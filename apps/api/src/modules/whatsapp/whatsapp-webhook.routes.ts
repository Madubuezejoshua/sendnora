import { Router, raw } from 'express';
import { prisma } from '@invoicetap/database';
import { parseApiEnv } from '@invoicetap/config/env';
import { webhookRateLimit } from '../../middleware/rate-limit.js';
import { logger } from '../../config/logger.js';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from '../../services/whatsapp/meta-cloud-api.provider.js';

/**
 * Meta WhatsApp Cloud API inbound webhook — delivery status callbacks only
 * (sent/delivered/read/failed for messages we sent via
 * services/whatsapp/whatsapp.service.ts). Sending itself works without
 * this route; it only updates MessageDelivery rows so the admin panel's
 * delivery logs reflect what actually happened after Meta accepted the
 * send. Inert (always 404s the POST handler's real work) unless
 * WHATSAPP_PROVIDER=meta-cloud-api and all META_WHATSAPP_* vars are set —
 * see ENVIRONMENT.md.
 */
export const whatsappWebhookRouter = Router();
whatsappWebhookRouter.use('/webhooks', webhookRateLimit);

/** Meta's one-time subscription verification handshake when you register this URL in the Meta App dashboard. */
whatsappWebhookRouter.get('/webhooks/whatsapp', (req, res) => {
  const env = parseApiEnv();
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (verifyMetaWebhookChallenge(env, mode, token)) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).end();
});

whatsappWebhookRouter.post(
  '/webhooks/whatsapp',
  raw({ type: '*/*', limit: '2mb' }),
  async (req, res) => {
    const env = parseApiEnv();
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.body as Buffer;

    if (!verifyMetaWebhookSignature(env, rawBody, signature)) {
      logger.warn('Rejected WhatsApp webhook with invalid signature');
      res.status(400).end();
      return;
    }

    res.status(200).end(); // Ack immediately; Meta retries on non-2xx.

    try {
      const payload = JSON.parse(rawBody.toString('utf8'));
      const statuses: Array<{ id: string; status: string; timestamp: string }> =
        payload.entry?.flatMap((e: { changes?: { value?: { statuses?: unknown[] } }[] }) =>
          (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []),
        ) ?? [];

      for (const status of statuses) {
        const mapped = mapMetaStatus(status.status);
        if (!mapped) continue;

        await prisma.messageDelivery.updateMany({
          where: { providerMessageId: status.id, channel: 'WHATSAPP' },
          data: {
            status: mapped,
            deliveredAt: mapped === 'DELIVERED' || mapped === 'READ' ? new Date() : undefined,
            failedAt: mapped === 'FAILED' ? new Date() : undefined,
          },
        });
      }
    } catch (err) {
      logger.error({ err }, 'Failed to process WhatsApp delivery-status webhook');
    }
  },
);

function mapMetaStatus(status: string): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | null {
  switch (status) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    case 'failed':
      return 'FAILED';
    default:
      return null;
  }
}
