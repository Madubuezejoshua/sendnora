import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Outgoing webhook signatures.
 *
 *   Sendnaro-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 *
 * The HMAC covers the exact bytes transmitted. Receivers must (1) verify against the RAW body, not a
 * re-serialised object, (2) reject timestamps older than a tolerance (replay protection) and
 * (3) de-duplicate on the `id` (event_id) inside the payload because delivery is at-least-once.
 */
export const SIGNATURE_HEADER = 'Sendnaro-Signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signPayload(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export function verifySignature(
  secret: string,
  rawBody: string | Buffer,
  header: string | undefined,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=', 2) as [string, string]),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
