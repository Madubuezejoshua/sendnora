import { describe, expect, it, vi, beforeEach } from 'vitest';
import { prisma } from '@sendnaro/database';
import { setupWorkspaceContext } from './setup.js';

/**
 * Mocks the outbound "verify with the provider's API" call so this test
 * doesn't require real Paystack credentials or network access, while still
 * exercising the real idempotency guard (WebhookEvent uniqueness +
 * PaymentAttempt.status check) in payments.service.ts exactly as
 * production traffic would hit it.
 */
vi.mock('../../src/services/payments/provider-registry.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/services/payments/provider-registry.js')
  >('../../src/services/payments/provider-registry.js');
  return {
    ...actual,
    resolvePaymentProvider: vi.fn(),
    getPlatformWebhookProvider: vi.fn(() => ({
      key: 'PAYSTACK',
      extractEventId: (payload: Record<string, unknown>) =>
        String((payload.data as Record<string, unknown>)?.id),
    })),
  };
});

describe('payment webhook idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a duplicate webhook event exactly once', async () => {
    const { resolvePaymentProvider } =
      await import('../../src/services/payments/provider-registry.js');
    const { handleWebhookEvent } = await import('../../src/modules/payments/payments.service.js');

    const { workspace } = await setupWorkspaceContext();
    const customerRes = await prisma.customer.create({
      data: {
        workspaceId: workspace.id,
        type: 'INDIVIDUAL',
        name: 'Webhook Customer',
        email: 'webhook@example.com',
      },
    });

    const { computeAndShapeLineItems } = await import('../../src/services/line-items.service.js');
    const { allocateDocumentNumber } = await import('../../src/services/numbering.service.js');
    const { generatePublicToken } = await import('@sendnaro/shared');

    const shaped = computeAndShapeLineItems({
      currency: 'NGN',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        { description: 'Webhook item', quantity: 1, unitPriceMinorUnits: 5000, taxRatePercent: 0 },
      ],
    });

    const invoice = await prisma.$transaction(async (tx) => {
      const number = await allocateDocumentNumber(tx, workspace.id, 'INVOICE', undefined);
      return tx.invoice.create({
        data: {
          workspaceId: workspace.id,
          customerId: customerRes.id,
          number,
          publicToken: generatePublicToken(),
          status: 'ISSUED',
          currency: 'NGN',
          taxMode: 'EXCLUSIVE',
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          issuedAt: new Date(),
          ...shaped.documentTotals,
          items: { create: shaped.items },
        },
      });
    });

    const attempt = await prisma.paymentAttempt.create({
      data: {
        workspaceId: workspace.id,
        invoiceId: invoice.id,
        provider: 'PAYSTACK',
        reference: `test_ref_${Date.now()}`,
        amountMinorUnits: 5000,
        currency: 'NGN',
        status: 'INITIATED',
      },
    });

    vi.mocked(resolvePaymentProvider).mockResolvedValue({
      key: 'PAYSTACK',
      verifyTransaction: vi.fn().mockResolvedValue({
        successful: true,
        amountMinorUnits: 5000,
        currency: 'NGN',
        reference: attempt.reference,
        paidAt: new Date(),
        raw: {},
      }),
    } as never);

    const eventId = Date.now();
    const payload = { event: 'charge.success', data: { id: eventId, reference: attempt.reference } };

    await handleWebhookEvent('PAYSTACK', payload);
    await handleWebhookEvent('PAYSTACK', payload); // duplicate delivery

    const payments = await prisma.payment.findMany({ where: { workspaceId: workspace.id } });
    expect(payments).toHaveLength(1);

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updatedInvoice.status).toBe('PAID');
    expect(updatedInvoice.amountPaidMinorUnits).toBe(5000);

    const webhookEvents = await prisma.webhookEvent.findMany({
      where: { provider: 'PAYSTACK', externalEventId: String(eventId) },
    });
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0]?.status).toBe('PROCESSED');
  });
});
