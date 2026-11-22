import crypto from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import path from 'node:path';

/**
 * Sendnaro Security Primitives
 *
 * Implements hardened replacements and fixes for all security findings audited
 * from the upstream repository:
 * - Constant-time secret & token comparisons (timingSafeEqual)
 * - Fail-closed webhook verification (rejects undefined/unset tokens)
 * - AES-256-GCM encryption for provider credentials & webhook secrets at rest
 * - HMAC-SHA256 OTP code derivation (codes are never stored in plaintext)
 * - scrypt password hashing with per-user random salt
 * - SSRF-hardened webhook URL validation (blocks private/loopback/metadata IPv4, IPv6, IPv4-mapped IPv6)
 * - Path traversal confinement with trailing path.sep boundary check
 * - Content-Disposition filename sanitization against header injection
 * - Proxy/relay path segment sanitization against directory escape
 * - Null-prototype signature header parsing against prototype pollution
 */

const EPHEMERAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_OTP_HMAC_KEY = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getEncryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim() || EPHEMERAL_ENCRYPTION_KEY;
  return crypto.createHash('sha256').update(raw).digest();
}

function getOtpHmacKey(): string {
  return process.env.OTP_HMAC_KEY?.trim() || EPHEMERAL_OTP_HMAC_KEY;
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SESSION_SECRET;
}

export function constantTimeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Burn comparable time before returning false to avoid leaking length via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// -----------------------------------------------------------------------------
// Password Hashing (scrypt + 16-byte random salt)
// -----------------------------------------------------------------------------

export function hashPassword(plainText: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainText, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(storedHash: string, plainText: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(plainText, salt, 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// AES-256-GCM Secret Encryption at Rest
// -----------------------------------------------------------------------------

export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed ciphertext');
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

// -----------------------------------------------------------------------------
// API Keys (256-bit CSPRNG, SHA-256 hashed at rest)
// -----------------------------------------------------------------------------

export type ApiEnvironment = 'SANDBOX' | 'LIVE';

export const API_SCOPES = [
  'invoices:create',
  'invoices:read',
  'otp:create',
  'otp:verify',
  'notifications:send',
  'deliveries:read',
  'telegram:link',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

const KEY_PREFIX: Record<ApiEnvironment, string> = {
  SANDBOX: 'sn_test_',
  LIVE: 'sn_live_',
};

const KEY_PATTERN = /^sn_(test|live)_[A-Za-z0-9_-]{43}$/;

export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateApiKey(environment: ApiEnvironment) {
  const secret = crypto.randomBytes(32).toString('base64url'); // 43 chars, 256 bits
  const key = `${KEY_PREFIX[environment]}${secret}`;
  return {
    key,
    hash: hashSha256(key),
    prefix: `${KEY_PREFIX[environment]}${secret.slice(0, 4)}`,
    lastFour: secret.slice(-4),
  };
}

export function parseBearerApiKey(
  authHeader: string | undefined,
): { key: string; environment: ApiEnvironment } | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return { key, environment: match[1] === 'test' ? 'SANDBOX' : 'LIVE' };
}

// -----------------------------------------------------------------------------
// Session Tokens (Signed HMAC Bearer tokens, tracked server-side)
// -----------------------------------------------------------------------------

export interface SessionTokenPayload {
  sid: string;
  uid: string;
  exp: number;
}

export function mintSessionToken(sessionId: string, userId: string, ttlSeconds = 86400 * 7): string {
  const payload: SessionTokenPayload = {
    sid: sessionId,
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionTokenPayload | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  if (!constantTimeEqual(expectedSig, providedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (!parsed.sid || !parsed.uid || typeof parsed.exp !== 'number') return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// HMAC-SHA256 OTP Code Generation (Never Stored in Plaintext)
// -----------------------------------------------------------------------------

export function newOtpSeed(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function computeOtpCode(seed: string, version: number, length = 6): string {
  const digest = crypto
    .createHmac('sha256', getOtpHmacKey())
    .update(`${seed}|${version}`)
    .digest();
  const value = digest.readBigUInt64BE(0) % 10n ** BigInt(length);
  return value.toString().padStart(length, '0');
}

export function verifyOtpCode(expected: string, provided: string): boolean {
  return constantTimeEqual(expected, provided.trim());
}

// -----------------------------------------------------------------------------
// Webhook Signing & Verification (Null-prototype safe + replay protection)
// -----------------------------------------------------------------------------

export const WEBHOOK_SIGNATURE_HEADER = 'Sendnaro-Signature';
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

export function signWebhookPayload(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string | Buffer,
  header: string | undefined,
  toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  // Null-prototype map prevents prototype-pollution keys (__proto__, constructor)
  const parts = new Map<string, string>();
  for (const segment of header.split(',')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    const k = segment.slice(0, eq).trim();
    const v = segment.slice(eq + 1).trim();
    if ((k === 't' || k === 'v1') && !parts.has(k)) {
      parts.set(k, v);
    }
  }
  const tRaw = parts.get('t');
  const v1 = parts.get('v1');
  if (!tRaw || !v1) return false;
  const t = Number(tRaw);
  if (!Number.isInteger(t) || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');
  return constantTimeEqual(expected, v1);
}

// -----------------------------------------------------------------------------
// Inbound Provider Webhook Verification (FIXED: Fail-closed + timingSafeEqual)
// -----------------------------------------------------------------------------

export function verifyMetaWebhookChallenge(
  expectedVerifyToken: string | undefined,
  mode: string | undefined,
  providedToken: string | undefined,
): boolean {
  // FIX: Explicitly fail closed when expectedVerifyToken is missing/empty
  if (!expectedVerifyToken || !expectedVerifyToken.trim()) return false;
  if (mode !== 'subscribe') return false;
  return constantTimeEqual(expectedVerifyToken, providedToken);
}

export function verifyMetaSignature(
  appSecret: string | undefined,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return constantTimeEqual(expected, signatureHeader.slice('sha256='.length));
}

export function verifyTelegramSecret(
  expectedSecret: string | undefined,
  providedHeader: string | undefined,
): boolean {
  if (!expectedSecret || !expectedSecret.trim()) return false;
  return constantTimeEqual(expectedSecret, providedHeader);
}

// -----------------------------------------------------------------------------
// SSRF Defense for Outbound Webhook URLs
// -----------------------------------------------------------------------------

const BLOCKED_SUBNETS = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_SUBNETS.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_SUBNETS.addSubnet(net6, prefix, 'ipv6');
}

export function isBlockedIpAddress(address: string, allowLocal = false): boolean {
  let ip = address.trim().replace(/^\[|\]$/g, '');
  const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mappedV4) ip = mappedV4[1]!;
  const family = net.isIP(ip);
  if (family === 0) return true;
  if (allowLocal && (ip === '::1' || ip.startsWith('127.'))) return false;
  return BLOCKED_SUBNETS.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export async function assertSafeWebhookUrl(raw: string, allowLocal = false): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Webhook URL is not a valid URL');
  }
  if (url.username || url.password) {
    throw new Error('Webhook URL must not contain embedded credentials');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(host);

  if (url.protocol !== 'https:' && !(allowLocal && isLocalHost && url.protocol === 'http:')) {
    throw new Error('Webhook URL must use https://');
  }

  if (net.isIP(host) !== 0) {
    if (isBlockedIpAddress(host, allowLocal)) {
      throw new Error('Webhook URL points to a private, loopback, or metadata IP address');
    }
    return url;
  }

  if (isLocalHost && !allowLocal) {
    throw new Error('Webhook URL cannot target localhost or loopback addresses');
  }

  if (host.endsWith('.internal') || host.endsWith('.local') || host === 'metadata.google.internal') {
    throw new Error('Webhook URL cannot target internal or metadata hostnames');
  }

  if (!isLocalHost) {
    const records = await dns.promises.lookup(host, { all: true }).catch(() => []);
    for (const record of records) {
      if (isBlockedIpAddress(record.address, allowLocal)) {
        throw new Error('Webhook URL resolves to a private or reserved network address');
      }
    }
  }

  return url;
}

// -----------------------------------------------------------------------------
// Anti-Phishing Link Host Allowlist for Notifications
// -----------------------------------------------------------------------------

const LINK_LIKE_RE =
  /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|app|co|ng|me|ly|link|xyz|info|biz|click|top)\b/gi;

export function assertNotificationLinksAllowed(
  texts: (string | undefined)[],
  linkUrl: string | undefined,
  allowedOrigins: string[],
): void {
  const hosts: string[] = [];
  if (linkUrl) {
    let parsed: URL;
    try {
      parsed = new URL(linkUrl);
    } catch {
      throw new Error('link.url must be a valid https:// URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('link.url must use https://');
    }
    hosts.push(parsed.hostname.toLowerCase());
  }

  for (const text of texts) {
    if (!text) continue;
    for (const match of text.match(LINK_LIKE_RE) ?? []) {
      try {
        const parsed = new URL(match.startsWith('http') ? match : `https://${match}`);
        hosts.push(parsed.hostname.toLowerCase());
      } catch {
        hosts.push(match.toLowerCase());
      }
    }
  }

  const normalizedAllowed = allowedOrigins.map((h) => h.trim().toLowerCase()).filter(Boolean);
  for (const host of hosts) {
    const permitted = normalizedAllowed.some((a) => host === a || host.endsWith(`.${a}`));
    if (!permitted) {
      throw new Error(
        `Link host "${host}" is not on this business's allowed link origins (Settings → Business)`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Path Traversal Confinement, Proxy Path Sanitization & Header Sanitization
// -----------------------------------------------------------------------------

/**
 * FIX: Enforces trailing path.sep boundary check so sibling directories sharing
 * a prefix with rootDir (e.g. `.dev-storage-secrets`) can never be accessed.
 */
export function resolveSafeStoragePath(rootDir: string, storageKey: string): string {
  if (!storageKey || storageKey.includes('\0')) {
    throw new Error('Invalid storage key');
  }
  const normalizedRoot = path.resolve(rootDir);
  const resolved = path.resolve(normalizedRoot, storageKey);
  if (resolved === normalizedRoot || !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error('Storage key escapes confined root directory');
  }
  return resolved;
}

/**
 * FIX: Rejects path traversal segments (`..`, `.`, `%2e`, backslashes, null bytes)
 * before forwarding through any sandbox or console relay path.
 */
export function sanitizeRelayPath(rawPath: string, allowlistRegex: RegExp): string | null {
  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) return null;
  const cleaned = decoded.replace(/^\/+/, '');
  const segments = cleaned.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (!allowlistRegex.test(cleaned)) return null;
  return cleaned;
}

/**
 * FIX: Strips CR, LF, quotes, and path separators from download filenames
 * to prevent HTTP Content-Disposition header injection.
 */
export function sanitizeDownloadFilename(rawName: string): string {
  const safe = rawName
    .replace(/[\r\n"\\/;<>:*?|]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .trim()
    .slice(0, 120);
  return safe || 'document.txt';
}

// -----------------------------------------------------------------------------
// In-Memory Rate Limiter (Per-IP & Per-API-Key)
// -----------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = rateBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds: 0 };
}
