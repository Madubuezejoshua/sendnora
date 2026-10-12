import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Sendnaro webhook on YOUR server.
 *
 *   Sendnaro-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 *
 * 1. Verify against the RAW request body bytes, not a re-serialised object.
 * 2. Reject old timestamps (replay protection; 5 minutes is a sensible window).
 * 3. Deliveries are at-least-once: de-duplicate on the event `id`.
 *
 * Express: use express.raw({ type: 'application/json' }) on this route so req.body is a Buffer.
 */
export function verifySendnaroSignature(
  secret: string,
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.trim().split('=', 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

const seenEventIds = new Set<string>(); // use your database or Redis in production

/** Example handler body for POST /webhooks/sendnaro. Returns the HTTP status to answer with. */
export function handleSendnaroWebhook(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): number {
  if (!verifySendnaroSignature(secret, rawBody, signatureHeader)) return 401;
  const event = JSON.parse(rawBody.toString('utf8')) as {
    id: string;
    type: string;
    data: Record<string, unknown>;
  };
  if (seenEventIds.has(event.id)) return 200; // already processed
  seenEventIds.add(event.id);
  // switch (event.type) { case 'delivery.delivered': ... case 'delivery.failed': ... case 'otp.verified': ... }
  return 200;
}
