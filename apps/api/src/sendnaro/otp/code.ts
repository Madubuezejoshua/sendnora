import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseApiEnv } from '@invoicetap/config/env';

/**
 * OTP codes are never stored. A challenge keeps a random 256-bit `seed`; the code for a given
 * version is HMAC-SHA256(OTP_HMAC_KEY, seed | version) reduced to N digits. Without the server-held
 * key the database reveals nothing about any code, and a stolen database alone cannot brute-force
 * a 6-digit space offline (a plain hash of a 6-digit code could be reversed instantly).
 * Resending bumps `version`, which makes the previous code invalid.
 */
function hmacKey(): string {
  const env = parseApiEnv();
  if (env.OTP_HMAC_KEY) return env.OTP_HMAC_KEY;
  if (env.NODE_ENV === 'production') throw new Error('OTP_HMAC_KEY is required in production');
  // Dev/test only: derive a stable key so local runs work without extra setup.
  return createHash('sha256').update(`otp:${env.APP_ENCRYPTION_KEY}`).digest('hex');
}

export function newSeed(): string {
  return randomBytes(32).toString('base64url');
}

export function computeOtpCode(seed: string, version: number, length: number): string {
  const digest = createHmac('sha256', hmacKey()).update(`${seed}|${version}`).digest();
  // 64 bits reduced mod 10^length: bias is negligible (< 1e-12 for 6 digits).
  const value = digest.readBigUInt64BE(0) % 10n ** BigInt(length);
  return value.toString().padStart(length, '0');
}

export function codesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
