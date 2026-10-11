import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { parseApiEnv } from '@invoicetap/config/env';
import { logger } from '../../config/logger.js';
import { webhookRateLimit } from '../../middleware/rate-limit.js';
import { handleTelegramUpdate } from '../../services/telegram/telegram.service.js';

export const telegramWebhookRouter = Router();
telegramWebhookRouter.use('/webhooks/telegram', webhookRateLimit);

function secretMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false; // fail closed when no secret is configured
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Register with setWebhook(url, secret_token = TELEGRAM_WEBHOOK_SECRET); Telegram echoes it in this header. */
telegramWebhookRouter.post('/webhooks/telegram', async (req, res) => {
  const header = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  if (!secretMatches(header, parseApiEnv().TELEGRAM_WEBHOOK_SECRET)) {
    res.status(401).end();
    return;
  }
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    // Always 200: a non-2xx makes Telegram retry the same update repeatedly.
    logger.error({ err }, 'Telegram update handling failed');
  }
  res.status(200).json({ ok: true });
});
