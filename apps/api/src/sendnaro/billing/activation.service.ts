import { randomBytes } from 'node:crypto';
import { prisma, type ActivationPayment } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { writeAuditLog } from '../../services/audit.service.js';
import { getBillingSettings, hasActiveEntitlement } from '../entitlement.js';
import { getActivationGateway } from './gateway.js';

const QUOTE_TTL_MS = 24 * 3600_000;

/**
 * Does a verified payment of this "mode" unlock live access on this deployment?
 * A test-mode (sandbox) gateway payment can never unlock PRODUCTION; outside production (dev/CI)
 * test-mode payments are accepted so the full flow can be exercised.
 */
export function paymentGrantsAccess(
  livemode: boolean,
  nodeEnv: string = parseApiEnv().NODE_ENV,
): boolean {
  return livemode || nodeEnv !== 'production';
}

export async function getActivationState(workspaceId: string) {
  const settings = await getBillingSettings();
  const entitlement = await prisma.entitlement.findUnique({ where: { workspaceId } });
  const entitled = Boolean(entitlement && !entitlement.revokedAt);
  const pending = await prisma.activationPayment.findFirst({
    where: { workspaceId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  return {
    billingRequired: settings.billingRequired,
    entitled,
    entitlementSource: entitled ? entitlement!.source : null,
    price:
      settings.activationPriceMinor === null
        ? null
        : { amountMinor: settings.activationPriceMinor, currency: settings.activationCurrency },
    hasPendingPayment: Boolean(pending),
    // Plain-language state for the console banner.
    state: !settings.billingRequired ? 'free_access' : entitled ? 'active' : 'activation_required',
  };
}

/**
 * Creates a stored price quote and a pending payment bound to (business, amount, currency), then
 * asks the gateway for a checkout. The amount comes from the stored quote, never from the client.
 */
export async function startActivationCheckout(workspaceId: string, userEmail: string) {
  const settings = await getBillingSettings();
  if (!settings.billingRequired) {
    throw new AppError(
      'CONFLICT',
      'Activation payments are not required right now; no checkout was started',
    );
  }
  if (await hasActiveEntitlement(workspaceId)) {
    throw new AppError('CONFLICT', 'This business is already activated');
  }
  if (!settings.activationPriceMinor || settings.activationPriceMinor <= 0) {
    throw new AppError('SERVICE_UNAVAILABLE', 'The activation price has not been configured');
  }
  const gateway = getActivationGateway();
  if (!gateway.isConfigured())
    throw new AppError('SERVICE_UNAVAILABLE', 'The payment gateway is not configured');

  // Reuse a still-valid pending checkout instead of creating duplicates on repeated clicks.
  const existing = await prisma.activationPayment.findFirst({
    where: { workspaceId, status: 'PENDING', quote: { expiresAt: { gt: new Date() } } },
    include: { quote: true },
    orderBy: { createdAt: 'desc' },
  });
  if (
    existing &&
    existing.amountMinor === settings.activationPriceMinor &&
    existing.currency === settings.activationCurrency
  ) {
    const { checkoutUrl } = await gateway
      .initialize({
        reference: existing.reference,
        amountMinor: existing.amountMinor,
        currency: existing.currency,
        email: userEmail,
        callbackUrl: `${parseApiEnv().NEXT_PUBLIC_APP_URL}/console/activation`,
      })
      .catch(() => ({ checkoutUrl: '' }));
    if (checkoutUrl) return { reference: existing.reference, checkoutUrl };
  }

  const reference = `snact_${randomBytes(12).toString('hex')}`;
  const quote = await prisma.activationQuote.create({
    data: {
      workspaceId,
      amountMinor: settings.activationPriceMinor,
      currency: settings.activationCurrency,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    },
  });
  await prisma.activationPayment.create({
    data: {
      workspaceId,
      quoteId: quote.id,
      provider: gateway.name,
      reference,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      livemode: gateway.isLiveMode(),
    },
  });
  const { checkoutUrl } = await gateway.initialize({
    reference,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    email: userEmail,
    callbackUrl: `${parseApiEnv().NEXT_PUBLIC_APP_URL}/console/activation`,
  });
  return { reference, checkoutUrl };
}

export type ConfirmOutcome =
  | { result: 'granted'; payment: ActivationPayment }
  | { result: 'already_processed'; payment: ActivationPayment }
  | { result: 'pending' | 'failed' | 'rejected'; reason: string };

/**
 * The ONLY path that turns a payment into entitlement. Called by the webhook AND by the post-redirect
 * verify endpoint; both converge here and both rely on the gateway's own server-side answer.
 * Safe to call concurrently and repeatedly: the PENDING -> SUCCEEDED flip is a single conditional
 * UPDATE, so exactly one caller grants and revenue can never be counted twice.
 */
export async function confirmActivationPayment(
  reference: string,
  expectedWorkspaceId?: string,
): Promise<ConfirmOutcome> {
  const payment = await prisma.activationPayment.findUnique({ where: { reference } });
  if (!payment) return { result: 'rejected', reason: 'unknown_reference' }; // forged / foreign reference
  if (expectedWorkspaceId && payment.workspaceId !== expectedWorkspaceId) {
    return { result: 'rejected', reason: 'unknown_reference' }; // never reveal other tenants' references
  }
  if (payment.status === 'SUCCEEDED') return { result: 'already_processed', payment };
  if (payment.status !== 'PENDING')
    return { result: 'rejected', reason: `payment_${payment.status.toLowerCase()}` };

  const verified = await getActivationGateway().verify(reference);
  if (verified.status === 'pending') return { result: 'pending', reason: 'gateway_pending' };
  if (verified.status !== 'success') {
    await prisma.activationPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: verified.status === 'abandoned' ? 'CANCELLED' : 'FAILED' },
    });
    return { result: 'failed', reason: verified.status };
  }

  // Amount, currency and mode must match what was quoted and recorded for THIS business.
  if (
    verified.amountMinor !== payment.amountMinor ||
    verified.currency !== payment.currency ||
    verified.livemode !== payment.livemode
  ) {
    await prisma.activationPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    await writeAuditLog({
      workspaceId: payment.workspaceId,
      action: 'billing.payment_mismatch',
      entityType: 'ActivationPayment',
      entityId: payment.id,
      metadata: { expectedMinor: payment.amountMinor, gotMinor: verified.amountMinor },
    });
    return { result: 'rejected', reason: 'amount_or_currency_mismatch' };
  }

  const granted = await prisma.$transaction(async (tx) => {
    const flipped = await tx.activationPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: 'SUCCEEDED',
        verifiedAt: new Date(),
        providerTransactionId: verified.transactionId,
      },
    });
    if (flipped.count === 0) return false; // another caller won the race
    if (paymentGrantsAccess(payment.livemode)) {
      await tx.entitlement.upsert({
        where: { workspaceId: payment.workspaceId },
        create: {
          workspaceId: payment.workspaceId,
          source: 'PAYMENT',
          activationPaymentId: payment.id,
        },
        update: {
          source: 'PAYMENT',
          activationPaymentId: payment.id,
          revokedAt: null,
          revokedReason: null,
          grantedAt: new Date(),
        },
      });
    }
    return true;
  });

  const fresh = await prisma.activationPayment.findUniqueOrThrow({ where: { id: payment.id } });
  if (granted) {
    await writeAuditLog({
      workspaceId: payment.workspaceId,
      action: paymentGrantsAccess(payment.livemode)
        ? 'billing.entitlement_granted'
        : 'billing.test_payment_recorded',
      entityType: 'ActivationPayment',
      entityId: payment.id,
      metadata: { livemode: payment.livemode },
    });
    return { result: 'granted', payment: fresh };
  }
  return { result: 'already_processed', payment: fresh };
}

/** Refund / chargeback: record it and withdraw access when the payment is fully reversed. */
export async function applyPaymentReversal(
  reference: string,
  kind: 'refund' | 'dispute',
  refundedMinor?: number,
): Promise<boolean> {
  const payment = await prisma.activationPayment.findUnique({ where: { reference } });
  if (!payment || payment.status === 'PENDING') return false;
  const refunded =
    kind === 'refund'
      ? Math.min(
          payment.amountMinor,
          (payment.refundedAmountMinor || 0) + (refundedMinor ?? payment.amountMinor),
        )
      : payment.refundedAmountMinor;
  const full = kind === 'dispute' || refunded >= payment.amountMinor;
  await prisma.$transaction(async (tx) => {
    await tx.activationPayment.update({
      where: { id: payment.id },
      data: {
        status: kind === 'dispute' ? 'DISPUTED' : full ? 'REFUNDED' : payment.status,
        refundedAmountMinor: refunded,
      },
    });
    if (full) {
      await tx.entitlement.updateMany({
        where: { activationPaymentId: payment.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: kind === 'dispute' ? 'payment_disputed' : 'payment_refunded',
        },
      });
    }
  });
  await writeAuditLog({
    workspaceId: payment.workspaceId,
    action: kind === 'dispute' ? 'billing.payment_disputed' : 'billing.payment_refunded',
    entityType: 'ActivationPayment',
    entityId: payment.id,
    metadata: { refundedMinor: refunded },
  });
  return true;
}

/** Revenue = verified, live-mode payments minus refunds, per currency. Disputed payments count as zero. */
export async function computeActivationRevenue(): Promise<
  { currency: string; collectedMinor: number; payments: number }[]
> {
  const rows = await prisma.activationPayment.findMany({
    where: { livemode: true, status: { in: ['SUCCEEDED', 'REFUNDED'] } },
    select: { currency: true, amountMinor: true, refundedAmountMinor: true, status: true },
  });
  const byCurrency = new Map<string, { collectedMinor: number; payments: number }>();
  for (const r of rows) {
    const net = r.amountMinor - r.refundedAmountMinor;
    const cur = byCurrency.get(r.currency) ?? { collectedMinor: 0, payments: 0 };
    cur.collectedMinor += net;
    cur.payments += net > 0 ? 1 : 0;
    byCurrency.set(r.currency, cur);
  }
  return [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v }));
}
