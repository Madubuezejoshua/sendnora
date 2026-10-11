import { Router, raw } from 'express';
import { prisma } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';
import { logger } from '../../config/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { webhookRateLimit } from '../../middleware/rate-limit.js';
import { requireOwnerOrAdmin } from '../console/guards.js';
import {
  applyPaymentReversal,
  confirmActivationPayment,
  getActivationState,
  startActivationCheckout,
} from './activation.service.js';
import { getActivationGateway } from './gateway.js';

/** Session-authenticated activation endpoints for the console. Guards are per-route, never path-less. */
export const sendnaroBillingRouter = Router();
const guard = [requireAuth, requireWorkspace];

sendnaroBillingRouter.get('/activation', ...guard, async (req, res, next) => {
  try {
    res.json({ data: await getActivationState(req.workspace!.workspaceId) });
  } catch (err) {
    next(err);
  }
});

sendnaroBillingRouter.post('/activation/checkout', ...guard, requireOwnerOrAdmin, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { email: true } });
    res.json({ data: await startActivationCheckout(req.workspace!.workspaceId, user.email) });
  } catch (err) {
    next(err);
  }
});

/**
 * Called when the customer returns from checkout. The query string is NOT trusted: the reference is
 * only a lookup key, and the outcome comes from the gateway's server-to-server verification.
 */
sendnaroBillingRouter.post('/activation/verify', ...guard, async (req, res, next) => {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference : '';
    if (!reference) throw new AppError('VALIDATION_ERROR', 'reference is required');
    const outcome = await confirmActivationPayment(reference, req.workspace!.workspaceId);
    res.json({ data: { result: outcome.result, state: await getActivationState(req.workspace!.workspaceId) } });
  } catch (err) {
    next(err);
  }
});

/**
 * Gateway webhook for Sendnaro's own activation payments. Mounted BEFORE express.json so the exact raw
 * bytes are available for signature verification. The payload only names a reference; the outcome is
 * always re-checked with the gateway (confirmActivationPayment), so a forged or replayed body is harmless.
 */
export const sendnaroActivationWebhookRouter = Router();
sendnaroActivationWebhookRouter.use('/webhooks/sendnaro-activation', webhookRateLimit);

sendnaroActivationWebhookRouter.post('/webhooks/sendnaro-activation', raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const rawBody = req.body as Buffer;
  if (!getActivationGateway().verifyWebhookSignature(rawBody, req.headers['x-paystack-signature'] as string | undefined)) {
    res.status(401).end();
    return;
  }
  try {
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: { reference?: string; transaction_reference?: string; amount?: number };
    };
    const reference = event.data?.reference ?? event.data?.transaction_reference;
    if (reference?.startsWith('snact_')) {
      if (event.event === 'charge.success') await confirmActivationPayment(reference);
      else if (event.event === 'refund.processed') await applyPaymentReversal(event.data?.transaction_reference ?? reference, 'refund', event.data?.amount);
      else if (event.event === 'charge.dispute.create') await applyPaymentReversal(reference, 'dispute');
    }
  } catch (err) {
    logger.error({ err }, 'Activation webhook processing failed');
  }
  res.status(200).json({ received: true }); // 200 so the gateway does not retry-storm; state is re-derivable via verify
});
