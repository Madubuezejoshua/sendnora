import { prisma, type BillingInterval } from '@invoicetap/database';
import { PLANS, type PlanCode } from '@invoicetap/shared';
import { logger } from '../../config/logger.js';

function computePeriodEnd(interval: BillingInterval, from: Date): Date {
  const d = new Date(from);
  if (interval === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/**
 * Handles Paystack subscription-lifecycle webhook events for PLATFORM
 * billing (a workspace paying for its own InvoiceTap plan) — a distinct
 * concern from payments.service.ts, which handles CUSTOMER invoice
 * payments. Both domains share the same `charge.success` event type, so
 * this differentiates by checking for `planCode`/`interval` in the
 * charge's metadata (only ever set by the subscription checkout flow in
 * billing.routes.ts, never by invoice payment-link init).
 *
 * Returns true if the event was recognized and handled (or deliberately
 * ignored) as a subscription-domain event; false means the caller should
 * fall through to the invoice-payment webhook handler instead.
 *
 * IMPORTANT CAVEAT: the exact field paths read below follow Paystack's
 * documented webhook payload shapes as of this writing, but this has NOT
 * been exercised against a live Paystack test-mode event (no Paystack
 * account was available while building this). Verify against a real
 * webhook delivery — Paystack's dashboard lets you replay past events —
 * before depending on this in production.
 */
export async function handleSubscriptionWebhookEvent(payload: {
  event: string;
  data: Record<string, unknown>;
}): Promise<boolean> {
  switch (payload.event) {
    case 'charge.success':
      return handleSubscriptionChargeSuccess(payload.data);
    case 'invoice.payment_failed':
      return handleSubscriptionPaymentFailed(payload.data);
    case 'subscription.disable':
    case 'subscription.not_renew':
      return handleSubscriptionDisabled(payload.data);
    default:
      return false;
  }
}

async function handleSubscriptionChargeSuccess(data: Record<string, unknown>): Promise<boolean> {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const workspaceId = metadata?.workspaceId as string | undefined;
  const planCode = metadata?.planCode as string | undefined;
  const interval = metadata?.interval as BillingInterval | undefined;

  if (!workspaceId || !planCode || !interval || !PLANS[planCode as PlanCode]) {
    return false; // Not one of ours, or a regular customer-invoice charge — let the other handler take it.
  }

  const subscriptionCode = data.subscription_code as string | undefined;
  const now = new Date();

  try {
    await prisma.subscription.update({
      where: { workspaceId },
      data: {
        planCode,
        status: 'ACTIVE',
        billingInterval: interval,
        provider: 'PAYSTACK',
        providerSubscriptionId: subscriptionCode,
        currentPeriodStart: now,
        currentPeriodEnd: computePeriodEnd(interval, now),
        cancelAtPeriodEnd: false,
      },
    });
  } catch (err) {
    logger.error({ err, workspaceId }, 'Failed to activate subscription from webhook');
  }

  return true;
}

async function handleSubscriptionPaymentFailed(data: Record<string, unknown>): Promise<boolean> {
  const subscriptionData = data.subscription as Record<string, unknown> | undefined;
  const subscriptionCode = (subscriptionData?.subscription_code ?? data.subscription_code) as
    string | undefined;
  if (!subscriptionCode) return false;

  await prisma.subscription.updateMany({
    where: { providerSubscriptionId: subscriptionCode },
    data: { status: 'PAST_DUE' },
  });
  return true;
}

async function handleSubscriptionDisabled(data: Record<string, unknown>): Promise<boolean> {
  const subscriptionCode = data.subscription_code as string | undefined;
  if (!subscriptionCode) return false;

  await prisma.subscription.updateMany({
    where: { providerSubscriptionId: subscriptionCode },
    data: { status: 'CANCELLED', cancelAtPeriodEnd: true },
  });
  return true;
}
