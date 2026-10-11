import { createHash, randomBytes } from 'node:crypto';
import type { ApiEnvironment } from '@sendnaro/database';

/**
 * API secrets: `sn_test_<43 chars>` (sandbox) or `sn_live_<43 chars>` (live), 256 bits of CSPRNG output.
 * Only the SHA-256 digest is stored (the secret has full entropy, so a fast hash is appropriate and allows
 * an indexed lookup). The prefix is a routing/identification aid, never proof of anything.
 */
export const KEY_PREFIX: Record<ApiEnvironment, string> = { SANDBOX: 'sn_test_', LIVE: 'sn_live_' };

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

const KEY_PATTERN = /^sn_(test|live)_[A-Za-z0-9_-]{43}$/;

export function generateSecret(environment: ApiEnvironment) {
  const secret = randomBytes(32).toString('base64url'); // 43 chars
  const key = `${KEY_PREFIX[environment]}${secret}`;
  return {
    key,
    hash: hashKey(key),
    // Safe-to-display fragments only.
    prefix: `${KEY_PREFIX[environment]}${secret.slice(0, 4)}`,
    lastFour: secret.slice(-4),
  };
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Extracts a well-formed key from an Authorization header, or null (no DB lookup for garbage). */
export function parseBearerKey(
  header: string | undefined,
): { key: string; environment: ApiEnvironment } | null {
  if (!header?.startsWith('Bearer ')) return null;
  const key = header.slice('Bearer '.length).trim();
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return { key, environment: match[1] === 'test' ? 'SANDBOX' : 'LIVE' };
}
