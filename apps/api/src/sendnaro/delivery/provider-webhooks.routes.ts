import { Router, raw } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { decryptSecret } from '@sendnaro/database/encryption';
import { parseApiEnv } from '@sendnaro/config/env';
import { logger } from '../../config/logger.js';
import { webhookRateLimit } from '../../middleware/rate-limit.js';
import { applyProviderReceipt, type ProviderReceipt } from './engine.js';
import type { WhatsAppSecrets } from './whatsapp.provider.js';

/**
 * Per-business WhatsApp callbacks: /webhooks/whatsapp/:connectionId.
 * The connection id selects WHICH business's app secret and verify token apply, so a callback can only
 * ever be authenticated by, and applied to, the tenant that owns that sender. Nothing is trusted until
 * the HMAC over the exact raw bytes verifies.
 */
export const sendnaroProviderWebhookRouter = Router();
sendnaroProviderWebhookRouter.use('/webhooks/whatsapp/:connectionId', webhookRateLimit);

async function loadConnection(id: string) {
  const row = await prisma.channelConnection.findFirst({ where: { id, channel: 'WHATSAPP' } });
  if (!row?.secretCiphertext) return null;
  const secrets = JSON.parse(decryptSecret(row.secretCiphertext, parseApiEnv().APP_ENCRYPTION_KEY)) as WhatsAppSecrets;
  return { row, secrets };
}

sendnaroProviderWebhookRouter.get('/webhooks/whatsapp/:connectionId', async (req, res) => {
  const conn = await loadConnection(String(req.params.connectionId));
  const ok =
    conn?.secrets.verifyToken &&
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === conn.secrets.verifyToken;
  if (!ok) {
    res.status(403).end();
    return;
  }
  res.status(200).send(String(req.query['hub.challenge'] ?? ''));
});

const STATUS_MAP: Record<string, ProviderReceipt> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  played: 'read',
  failed: 'failed',
};

export function verifyMetaSignature(appSecret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header.slice('sha256='.length));
  return a.length === b.length && timingSafeEqual(a, b);
}

sendnaroProviderWebhookRouter.post(
  '/webhooks/whatsapp/:connectionId',
  raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    const conn = await loadConnection(String(req.params.connectionId));
    const rawBody = req.body as Buffer;
    if (!conn?.secrets.appSecret || !verifyMetaSignature(conn.secrets.appSecret, rawBody, req.headers['x-hub-signature-256'] as string | undefined)) {
      res.status(401).end();
      return;
    }
    try {
      const payload = JSON.parse(rawBody.toString('utf8')) as {
        entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; statuses?: { id: string; status: string; errors?: { code?: number }[] }[] } }[] }[];
      };
      const phoneNumberId = (conn.row.config as { phoneNumberId?: string }).phoneNumberId;
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          // Correlate by sender: ignore statuses that belong to a different phone number.
          if (change.value?.metadata?.phone_number_id !== phoneNumberId) continue;
          for (const s of change.value?.statuses ?? []) {
            const status = STATUS_MAP[s.status];
            if (!status) continue;
            await applyProviderReceipt({
              provider: `whatsapp:${conn.row.id}`,
              externalId: s.id,
              status,
              errorCode: s.errors?.[0]?.code ? `meta_${s.errors[0].code}` : undefined,
              workspaceId: conn.row.workspaceId,
              environment: conn.row.environment,
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'WhatsApp status callback processing failed'); // still 200: Meta retries non-2xx for days
    }
    res.status(200).json({ received: true });
  },
);
