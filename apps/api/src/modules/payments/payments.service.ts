import { prisma } from '@invoicetap/database';
import { AppError, generateSecureId } from '@invoicetap/shared';
import { logger } from '../../config/logger.js';
import {
  resolvePaymentProvider,
  getPlatformWebhookProvider,
} from '../../services/payments/provider-registry.js';
import { recordPayment } from '../invoices/invoices.service.js';

export async function initializePaymentForInvoice(
  workspaceId: string,
  invoiceId: string,
  provider: 'PAYSTACK' | 'FLUTTERWAVE',
  appUrl: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { customer: true },
  });
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
  if (!invoice.customer.email)
    throw new AppError('VALIDATION_ERROR', 'Customer must have an email address to pay online');

  const outstanding = invoice.grandTotalMinorUnits - invoice.amountPaidMinorUnits;
  if (outstanding <= 0) throw new AppError('CONFLICT', 'This invoice has no outstanding balance');

  const gateway = await resolvePaymentProvider(workspaceId, provider);
  const reference = `itap_${generateSecureId(16)}`;

  const attempt = await prisma.paymentAttempt.create({
    data: {
      workspaceId,
      invoiceId,
      provider,
      reference,
      amountMinorUnits: outstanding,
      currency: invoice.currency,
      status: 'INITIATED',
    },
  });

  try {
    const result = await gateway.initializeTransaction({
      reference,
      amountMinorUnits: outstanding,
      currency: invoice.currency,
      customerEmail: invoice.customer.email,
      redirectUrl: `${appUrl}/pay/${invoice.publicToken}/return`,
      metadata: { invoiceId, workspaceId },
    });

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { authorizationUrl: result.authorizationUrl, rawInitResponse: result.raw as never },
    });

    return { authorizationUrl: result.authorizationUrl, reference };
  } catch (err) {
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED' } });
    logger.error({ err, invoiceId, provider }, 'Failed to initialize payment gateway transaction');
    throw new AppError(
      'PAYMENT_VERIFICATION_FAILED',
      'Could not start the payment. Please try again.',
    );
  }
}

/**
 * Processes an inbound gateway webhook. The caller (routes.ts) has already
 * verified the signature over the raw body and parsed it — this function's
 * job is idempotent, server-verified settlement: it re-fetches the
 * transaction from the provider's API (never trusting the webhook payload's
 * amount/status directly) and only then marks the invoice paid.
 */
export async function handleWebhookEvent(
  provider: 'PAYSTACK' | 'FLUTTERWAVE',
  payload: Record<string, unknown>,
): Promise<void> {
  const gateway = getPlatformWebhookProvider(provider);
  const externalEventId = gateway.extractEventId(payload);

  const existing = externalEventId
    ? await prisma.webhookEvent.findUnique({
        where: { provider_externalEventId: { provider, externalEventId } },
      })
    : null;
  if (existing?.status === 'PROCESSED') {
    return; // Already handled — provider retried delivery. This is the idempotency guard.
  }

  const eventRecord = existing
    ? existing
    : await prisma.webhookEvent.create({
        data: {
          provider,
          externalEventId,
          signatureValid: true,
          payload: payload as never,
          status: 'RECEIVED',
        },
      });

  const reference = extractReference(payload);
  if (!reference) {
    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { status: 'IGNORED', processedAt: new Date() },
    });
    return;
  }

  try {
    const attempt = await prisma.paymentAttempt.findFirst({ where: { provider, reference } });
    if (!attempt) {
      await prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: 'IGNORED', processedAt: new Date() },
      });
      return;
    }

    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { workspaceId: attempt.workspaceId },
    });

    if (attempt.status === 'SUCCESSFUL') {
      await prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return; // Already settled by a previous event/verification — duplicate-payment guard.
    }

    // Server-side verification against the provider's API — the webhook payload alone is never trusted for amount/currency.
    const workspaceGateway = await resolvePaymentProvider(attempt.workspaceId, provider);
    const verification = await workspaceGateway.verifyTransaction(reference);

    if (!verification.successful) {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', rawVerifyResponse: verification.raw as never },
      });
      await prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    if (
      verification.amountMinorUnits !== attempt.amountMinorUnits ||
      verification.currency !== attempt.currency
    ) {
      await prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Amount/currency mismatch between attempt and provider verification',
          processedAt: new Date(),
        },
      });
      return;
    }

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'SUCCESSFUL', rawVerifyResponse: verification.raw as never },
    });

    await recordPayment(
      attempt.workspaceId,
      attempt.invoiceId,
      {
        amountMinorUnits: attempt.amountMinorUnits,
        method: provider,
        paidAt: verification.paidAt ?? new Date(),
        reference,
      },
      { paymentAttemptId: attempt.id },
    );

    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, provider, reference }, 'Failed to process payment webhook');
    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        processedAt: new Date(),
      },
    });
  }
}

function extractReference(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  const ref = data?.reference ?? data?.tx_ref;
  return typeof ref === 'string' ? ref : undefined;
}
