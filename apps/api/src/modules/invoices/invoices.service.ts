import { prisma } from '@sendnaro/database';
import {
  AppError,
  assertInvoiceTransition,
  computeOutstandingBalance,
  DEFAULT_REMINDER_RULES,
  computeReminderSendDate,
  generatePublicToken,
  isInvoiceEditable,
  Money,
  type CreateInvoiceInput,
  type InvoiceStatus,
  type PaginationQuery,
  type RecordPaymentInput,
} from '@sendnaro/shared';
import { allocateDocumentNumber } from '../../services/numbering.service.js';
import { computeAndShapeLineItems } from '../../services/line-items.service.js';
import { paginate, toSkipTake } from '../../services/pagination.js';
import { assertCanIssueInvoice, incrementInvoiceUsage } from '../../services/billing.service.js';
import { createNotification } from '../../services/notification.service.js';
import type { Prisma } from '@sendnaro/database';

export async function listInvoices(
  workspaceId: string,
  query: PaginationQuery & { status?: string },
) {
  const where = {
    workspaceId,
    ...(query.status && query.status !== 'ALL' ? { status: query.status as InvoiceStatus } : {}),
    ...(query.search ? { number: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.invoice.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortDirection },
      include: { customer: { select: { id: true, name: true, email: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function getInvoice(workspaceId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      customer: true,
      items: { orderBy: { position: 'asc' } },
      paymentAllocations: { include: { payment: true } },
      creditNotes: true,
      receipts: true,
    },
  });
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
  return invoice;
}

export async function getInvoiceByPublicToken(publicToken: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken },
    include: {
      customer: true,
      items: { orderBy: { position: 'asc' } },
      workspace: { include: { businessProfile: { include: { address: true } } } },
    },
  });
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
  return invoice;
}

export async function createInvoice(
  workspaceId: string,
  createdById: string,
  input: CreateInvoiceInput,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, workspaceId },
  });
  if (!customer) throw new AppError('VALIDATION_ERROR', 'Customer not found');

  const { items, documentTotals } = computeAndShapeLineItems({
    currency: input.currency,
    taxMode: input.taxMode,
    lineItems: input.lineItems,
    documentDiscount: input.documentDiscount,
    shippingMinorUnits: input.shippingMinorUnits,
    additionalFeesMinorUnits: input.additionalFeesMinorUnits,
  });

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const number = await allocateDocumentNumber(
      tx,
      workspaceId,
      'INVOICE',
      workspace.numberingFormats as never,
    );

    return tx.invoice.create({
      data: {
        workspaceId,
        customerId: input.customerId,
        number,
        publicToken: generatePublicToken(),
        status: 'DRAFT',
        currency: input.currency,
        taxMode: input.taxMode,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        depositRequiredMinorUnits: input.depositRequiredMinorUnits,
        notes: input.notes,
        terms: input.terms,
        paymentInstructions: input.paymentInstructions,
        sourceQuoteId: input.sourceQuoteId,
        createdById,
        ...documentTotals,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
  });
}

export async function createInvoiceFromQuote(
  workspaceId: string,
  createdById: string,
  quote: {
    id: string;
    customerId: string;
    currency: string;
    taxMode: 'EXCLUSIVE' | 'INCLUSIVE';
    notes: string | null;
    terms: string | null;
    items: Array<{
      description: string;
      quantity: Prisma.Decimal;
      unitPriceMinorUnits: number;
      taxRatePercent: Prisma.Decimal;
      productId: string | null;
      discountType: string | null;
      discountValue: Prisma.Decimal | null;
    }>;
  },
  dueDate: Date,
) {
  return createInvoice(workspaceId, createdById, {
    customerId: quote.customerId,
    currency: quote.currency,
    taxMode: quote.taxMode,
    issueDate: new Date(),
    dueDate,
    lineItems: quote.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPriceMinorUnits: i.unitPriceMinorUnits,
      taxRatePercent: Number(i.taxRatePercent),
      productId: i.productId ?? undefined,
      discount: i.discountType
        ? { type: i.discountType as 'PERCENTAGE' | 'FIXED', value: Number(i.discountValue) }
        : undefined,
    })),
    notes: quote.notes ?? undefined,
    terms: quote.terms ?? undefined,
    sourceQuoteId: quote.id,
    shippingMinorUnits: 0,
    additionalFeesMinorUnits: 0,
  });
}

export async function updateInvoice(
  workspaceId: string,
  invoiceId: string,
  input: Partial<CreateInvoiceInput>,
) {
  const invoice = await getInvoice(workspaceId, invoiceId);
  if (!isInvoiceEditable(invoice.status)) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      'Only draft invoices can be edited. Issue a credit note for corrections to issued invoices.',
    );
  }

  const merged = {
    customerId: input.customerId ?? invoice.customerId,
    currency: input.currency ?? invoice.currency,
    taxMode: input.taxMode ?? invoice.taxMode,
    lineItems:
      input.lineItems ??
      invoice.items.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPriceMinorUnits: i.unitPriceMinorUnits,
        taxRatePercent: Number(i.taxRatePercent),
        productId: i.productId ?? undefined,
        discount: i.discountType
          ? { type: i.discountType, value: Number(i.discountValue) }
          : undefined,
      })),
    documentDiscount: input.documentDiscount,
    shippingMinorUnits: input.shippingMinorUnits ?? invoice.shippingMinorUnits,
    additionalFeesMinorUnits: input.additionalFeesMinorUnits ?? invoice.additionalFeesMinorUnits,
  };

  const { items, documentTotals } = computeAndShapeLineItems(merged);

  return prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: merged.customerId,
        currency: merged.currency,
        taxMode: merged.taxMode,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        notes: input.notes,
        terms: input.terms,
        paymentInstructions: input.paymentInstructions,
        ...documentTotals,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
  });
}

export async function issueInvoice(workspaceId: string, invoiceId: string) {
  const invoice = await getInvoice(workspaceId, invoiceId);
  assertInvoiceTransition(invoice.status, 'ISSUED');
  await assertCanIssueInvoice(workspaceId);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'ISSUED', issuedAt: new Date() },
    });

    const reminders = DEFAULT_REMINDER_RULES.map((rule) => ({
      workspaceId,
      invoiceId,
      timing: rule.timing,
      offsetDays: rule.offsetDays,
      scheduledFor: computeReminderSendDate(result.dueDate, rule),
    })).filter((r) => r.scheduledFor.getTime() > Date.now());

    if (reminders.length > 0) {
      await tx.reminderSchedule.createMany({ data: reminders });
    }

    return result;
  });

  await incrementInvoiceUsage(workspaceId);
  return updated;
}

export async function sendInvoice(workspaceId: string, invoiceId: string) {
  const invoice = await getInvoice(workspaceId, invoiceId);
  if (invoice.status === 'ISSUED') {
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }
  return invoice;
}

export async function markInvoiceViewed(publicToken: string) {
  const invoice = await prisma.invoice.findUnique({ where: { publicToken } });
  if (!invoice || invoice.viewedAt) return;
  if (['ISSUED', 'SENT'].includes(invoice.status)) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VIEWED', viewedAt: new Date() },
    });
  }
}

async function getTotalCreditedMinorUnits(invoiceId: string): Promise<number> {
  const result = await prisma.creditNote.aggregate({
    where: { invoiceId, status: 'ISSUED' },
    _sum: { amountMinorUnits: true },
  });
  return result._sum.amountMinorUnits ?? 0;
}

export interface RecordPaymentOptions {
  /** Absent for automated gateway payments recorded from a verified webhook. */
  recordedById?: string;
  /** Links the Payment back to the PaymentAttempt that produced it, for gateway payments. */
  paymentAttemptId?: string;
}

export async function recordPayment(
  workspaceId: string,
  invoiceId: string,
  input: RecordPaymentInput,
  options: RecordPaymentOptions = {},
) {
  const invoice = await getInvoice(workspaceId, invoiceId);

  const grandTotal = Money.fromMinorUnits(invoice.grandTotalMinorUnits, invoice.currency);
  const alreadyPaid = Money.fromMinorUnits(invoice.amountPaidMinorUnits, invoice.currency);
  const outstanding = computeOutstandingBalance(grandTotal, alreadyPaid);

  if (input.amountMinorUnits > outstanding.amountMinorUnits) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Payment amount exceeds the outstanding balance of ${outstanding.format()}`,
    );
  }

  const newAmountPaid = invoice.amountPaidMinorUnits + input.amountMinorUnits;
  const newStatus: InvoiceStatus =
    newAmountPaid >= invoice.grandTotalMinorUnits ? 'PAID' : 'PARTIALLY_PAID';
  assertInvoiceTransition(invoice.status, newStatus);

  const { payment, receipt } = await prisma.$transaction(async (tx) => {
    const createdPayment = await tx.payment.create({
      data: {
        workspaceId,
        amountMinorUnits: input.amountMinorUnits,
        currency: invoice.currency,
        method: input.method,
        status: 'SUCCESSFUL',
        reference: input.reference,
        paidAt: input.paidAt,
        notes: input.notes,
        recordedById: options.recordedById,
        paymentAttemptId: options.paymentAttemptId,
        allocations: { create: { invoiceId, amountMinorUnits: input.amountMinorUnits } },
      },
    });

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaidMinorUnits: newAmountPaid,
        status: newStatus,
        paidAt: newStatus === 'PAID' ? new Date() : invoice.paidAt,
      },
    });

    const receiptNumber = await allocateDocumentNumber(tx, workspaceId, 'RECEIPT', undefined);
    const createdReceipt = await tx.receipt.create({
      data: {
        workspaceId,
        invoiceId,
        paymentId: createdPayment.id,
        number: receiptNumber,
        publicToken: generatePublicToken(),
        amountMinorUnits: input.amountMinorUnits,
        currency: invoice.currency,
        paymentMethod: input.method,
        paidAt: input.paidAt,
        snapshotJson: {
          invoiceNumber: invoice.number,
          customerId: invoice.customerId,
          amountMinorUnits: input.amountMinorUnits,
          currency: invoice.currency,
          method: input.method,
          paidAt: input.paidAt,
        },
        items: {
          create: invoice.items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPriceMinorUnits: i.unitPriceMinorUnits,
            lineTotalMinorUnits: i.lineTotalMinorUnits,
          })),
        },
      },
    });

    return { payment: createdPayment, receipt: createdReceipt };
  });

  const recipientUserId =
    invoice.createdById ??
    (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }))
      ?.ownerId;
  if (recipientUserId) {
    const amount = Money.fromMinorUnits(input.amountMinorUnits, invoice.currency).format();
    await createNotification({
      userId: recipientUserId,
      workspaceId,
      type: 'PAYMENT_RECEIVED',
      title: `Payment received — ${amount}`,
      body: `${invoice.customer.name} paid ${amount} towards invoice ${invoice.number}.`,
      data: { invoiceId, paymentId: payment.id },
      url: `/invoices/${invoiceId}`,
    }).catch(() => {});
  }

  return { payment, receipt };
}

export async function voidInvoice(workspaceId: string, invoiceId: string, reason: string) {
  const invoice = await getInvoice(workspaceId, invoiceId);
  assertInvoiceTransition(invoice.status, 'VOID');

  if (invoice.amountPaidMinorUnits > 0) {
    const totalCredited = await getTotalCreditedMinorUnits(invoiceId);
    if (totalCredited < invoice.amountPaidMinorUnits) {
      throw new AppError(
        'CONFLICT',
        'A paid invoice must be fully covered by a credit note before it can be voided',
      );
    }
  }

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
  });
}

export async function createCreditNote(
  workspaceId: string,
  invoiceId: string,
  createdById: string,
  amountMinorUnits: number,
  reason: string,
) {
  const invoice = await getInvoice(workspaceId, invoiceId);
  if (amountMinorUnits > invoice.amountPaidMinorUnits) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Credit note amount cannot exceed the amount paid on this invoice',
    );
  }

  return prisma.$transaction(async (tx) => {
    const number = await allocateDocumentNumber(tx, workspaceId, 'CREDIT_NOTE', undefined);
    return tx.creditNote.create({
      data: { workspaceId, invoiceId, number, amountMinorUnits, reason, createdById },
    });
  });
}

/** Bulk-transitions all past-due open invoices to OVERDUE. Called by the protected cron endpoint. */
export async function sweepOverdueInvoices(): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] },
      dueDate: { lt: new Date() },
    },
    data: { status: 'OVERDUE' },
  });
  return result.count;
}
