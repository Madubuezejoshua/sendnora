import { Router, raw } from 'express';
import { z } from 'zod';
import { parseApiEnv } from '@sendnaro/config/env';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { webhookRateLimit } from '../../middleware/rate-limit.js';
import { logger } from '../../config/logger.js';
import { getPlatformWebhookProvider } from '../../services/payments/provider-registry.js';
import { handleSubscriptionWebhookEvent } from '../../services/payments/subscription-billing.service.js';
import * as paymentsService from './payments.service.js';

export const paymentsWebhookRouter = Router();
paymentsWebhookRouter.use('/webhooks', webhookRateLimit);

/**
 * Mounted with express.raw() so the exact bytes are available for HMAC
 * signature verification — this router MUST be registered before the
 * global express.json() body parser in app.ts, or Express will have
 * already consumed/parsed the body by the time this middleware runs.
 */
paymentsWebhookRouter.post(
  '/webhooks/paystack',
  raw({ type: '*/*', limit: '2mb' }),
  async (req, res, next) => {
    try {
      const provider = getPlatformWebhookProvider('PAYSTACK');
      const signature = req.headers['x-paystack-signature'] as string | undefined;
      const rawBody = req.body as Buffer;

      if (!provider.verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Rejected Paystack webhook with invalid signature');
        res
          .status(400)
          .json({ error: { code: 'WEBHOOK_SIGNATURE_INVALID', message: 'Invalid signature' } });
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8'));
      res.status(200).end(); // Ack immediately; providers retry on non-2xx or timeout.

      // Platform subscription billing and customer invoice payments share the
      // same webhook URL and (for charge.success) the same event type — try
      // the subscription-domain handler first; it only claims events that
      // carry its own metadata, so this never misroutes an invoice payment.
      const wasSubscriptionEvent = await handleSubscriptionWebhookEvent(payload);
      if (!wasSubscriptionEvent) {
        await paymentsService.handleWebhookEvent('PAYSTACK', payload);
      }
    } catch (err) {
      next(err);
    }
  },
);

paymentsWebhookRouter.post(
  '/webhooks/flutterwave',
  raw({ type: '*/*', limit: '2mb' }),
  async (req, res, next) => {
    try {
      const provider = getPlatformWebhookProvider('FLUTTERWAVE');
      const signature = req.headers['verif-hash'] as string | undefined;
      const rawBody = req.body as Buffer;

      if (!provider.verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Rejected Flutterwave webhook with invalid signature');
        res
          .status(400)
          .json({ error: { code: 'WEBHOOK_SIGNATURE_INVALID', message: 'Invalid signature' } });
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8'));
      res.status(200).end();
      await paymentsService.handleWebhookEvent('FLUTTERWAVE', payload);
    } catch (err) {
      next(err);
    }
  },
);

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireWorkspace);

paymentsRouter.post(
  '/invoices/:invoiceId/payment-link',
  requirePermission('invoice:read'),
  validateBody(z.object({ provider: z.enum(['PAYSTACK', 'FLUTTERWAVE']) })),
  async (req, res, next) => {
    try {
      const env = parseApiEnv();
      const result = await paymentsService.initializePaymentForInvoice(
        req.workspace!.workspaceId,
        req.params.invoiceId!,
        req.body.provider,
        env.NEXT_PUBLIC_APP_URL,
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);
