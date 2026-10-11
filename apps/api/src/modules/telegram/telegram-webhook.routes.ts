import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { parseApiEnv } from '@sendnaro/config/env';
import { logger } from '../../config/logger.js';
import { webhookRateLimit } from '../../middleware/rate-limit.js';
import { handleTelegramUpdate } from '../../services/telegram/telegram.service.js';
import { handleBotUpdate } from '../../sendnaro/v1/telegram.service.js';

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
    // Sendnaro link tokens first; unknown tokens and other messages fall through to the legacy customer flow.
    if (!(await handleBotUpdate(req.body))) await handleTelegramUpdate(req.body);
  } catch (err) {
    // Always 200: a non-2xx makes Telegram retry the same update repeatedly.
    logger.error({ err }, 'Telegram update handling failed');
  }
  res.status(200).json({ ok: true });
});
