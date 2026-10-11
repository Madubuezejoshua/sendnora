import { prisma } from '@sendnaro/database';
import {
  AppError,
  assertQuoteTransition,
  generatePublicToken,
  type CreateQuoteInput,
  type PaginationQuery,
  type QuoteStatus,
} from '@sendnaro/shared';
import { allocateDocumentNumber } from '../../services/numbering.service.js';
import { computeAndShapeLineItems } from '../../services/line-items.service.js';
import { paginate, toSkipTake } from '../../services/pagination.js';
import { createInvoiceFromQuote } from '../invoices/invoices.service.js';

export async function listQuotes(
  workspaceId: string,
  query: PaginationQuery & { status?: string },
) {
  const where = {
    workspaceId,
    ...(query.status && query.status !== 'ALL' ? { status: query.status as QuoteStatus } : {}),
    ...(query.search ? { number: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.quote.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortDirection },
      include: { customer: { select: { id: true, name: true, email: true } } },
    }),
    prisma.quote.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function getQuote(workspaceId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, workspaceId },
    include: { customer: true, items: { orderBy: { position: 'asc' } } },
  });
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found');
  return quote;
}

export async function getQuoteByPublicToken(publicToken: string) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken },
    include: {
      customer: true,
      items: { orderBy: { position: 'asc' } },
      workspace: { include: { businessProfile: { include: { address: true } } } },
    },
  });
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found');
  return quote;
}

export async function createQuote(
  workspaceId: string,
  createdById: string,
  input: CreateQuoteInput,
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
      'QUOTE',
      workspace.numberingFormats as never,
    );

    return tx.quote.create({
      data: {
        workspaceId,
        customerId: input.customerId,
        number,
        publicToken: generatePublicToken(),
        status: 'DRAFT',
        currency: input.currency,
        taxMode: input.taxMode,
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
        notes: input.notes,
        terms: input.terms,
        internalNotes: input.internalNotes,
        createdById,
        ...documentTotals,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
  });
}

export async function updateQuote(
  workspaceId: string,
  quoteId: string,
  input: Partial<CreateQuoteInput>,
) {
  const quote = await getQuote(workspaceId, quoteId);
  if (quote.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only draft quotes can be edited');
  }

  const merged = {
    customerId: input.customerId ?? quote.customerId,
    currency: input.currency ?? quote.currency,
    taxMode: input.taxMode ?? quote.taxMode,
    lineItems:
      input.lineItems ??
      quote.items.map((i) => ({
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
    shippingMinorUnits: input.shippingMinorUnits ?? quote.shippingMinorUnits,
    additionalFeesMinorUnits: input.additionalFeesMinorUnits ?? quote.additionalFeesMinorUnits,
  };

  const { items, documentTotals } = computeAndShapeLineItems(merged);

  return prisma.$transaction(async (tx) => {
    await tx.quoteItem.deleteMany({ where: { quoteId } });
    return tx.quote.update({
      where: { id: quoteId },
      data: {
        customerId: merged.customerId,
        currency: merged.currency,
        taxMode: merged.taxMode,
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
        notes: input.notes,
        terms: input.terms,
        internalNotes: input.internalNotes,
        ...documentTotals,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
  });
}

export async function transitionQuoteStatus(
  workspaceId: string,
  quoteId: string,
  to: QuoteStatus,
  extra?: { rejectionReason?: string },
) {
  const quote = await getQuote(workspaceId, quoteId);
  assertQuoteTransition(quote.status, to);

  const data: Record<string, unknown> = { status: to };
  if (to === 'SENT') data.sentAt = new Date();
  if (to === 'VIEWED' && !quote.viewedAt) data.viewedAt = new Date();
  if (to === 'ACCEPTED' || to === 'REJECTED') {
    data.respondedAt = new Date();
    if (extra?.rejectionReason) data.rejectionReason = extra.rejectionReason;
  }
  if (to === 'CANCELLED') data.cancelledAt = new Date();

  return prisma.quote.update({ where: { id: quoteId }, data });
}

export async function duplicateQuote(workspaceId: string, createdById: string, quoteId: string) {
  const source = await getQuote(workspaceId, quoteId);
  return createQuote(workspaceId, createdById, {
    customerId: source.customerId,
    currency: source.currency,
    taxMode: source.taxMode,
    issueDate: new Date(),
    expiryDate: undefined,
    lineItems: source.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPriceMinorUnits: i.unitPriceMinorUnits,
      taxRatePercent: Number(i.taxRatePercent),
      productId: i.productId ?? undefined,
      discount: i.discountType
        ? { type: i.discountType, value: Number(i.discountValue) }
        : undefined,
    })),
    notes: source.notes ?? undefined,
    terms: source.terms ?? undefined,
    shippingMinorUnits: 0,
    additionalFeesMinorUnits: 0,
  });
}

export async function convertQuoteToInvoice(
  workspaceId: string,
  createdById: string,
  quoteId: string,
  dueDate: Date,
) {
  const quote = await getQuote(workspaceId, quoteId);
  assertQuoteTransition(quote.status, 'CONVERTED');

  const invoice = await createInvoiceFromQuote(workspaceId, createdById, quote, dueDate);

  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: 'CONVERTED', convertedInvoiceId: invoice.id },
  });

  return invoice;
}
