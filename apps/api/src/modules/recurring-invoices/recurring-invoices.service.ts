import { prisma } from '@sendnaro/database';
import { AppError, computeNextRunAt, type PaginationQuery } from '@sendnaro/shared';
import type { CreateRecurringInvoiceInput } from '@sendnaro/shared';
import { paginate, toSkipTake } from '../../services/pagination.js';
import { createInvoice, issueInvoice } from '../invoices/invoices.service.js';
import { logger } from '../../config/logger.js';

export async function listRecurringInvoices(workspaceId: string, query: PaginationQuery) {
  const where = { workspaceId };
  const [items, totalItems] = await Promise.all([
    prisma.recurringInvoice.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortDirection },
      include: { customer: { select: { id: true, name: true } } },
    }),
    prisma.recurringInvoice.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function getRecurringInvoice(workspaceId: string, id: string) {
  const recurring = await prisma.recurringInvoice.findFirst({
    where: { id, workspaceId },
    include: { items: true, customer: true },
  });
  if (!recurring) throw new AppError('NOT_FOUND', 'Recurring invoice not found');
  return recurring;
}

export async function createRecurringInvoice(
  workspaceId: string,
  createdById: string,
  input: CreateRecurringInvoiceInput,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, workspaceId },
  });
  if (!customer) throw new AppError('VALIDATION_ERROR', 'Customer not found');

  return prisma.recurringInvoice.create({
    data: {
      workspaceId,
      customerId: input.customerId,
      frequency: input.frequency,
      customIntervalDays: input.customIntervalDays,
      startDate: input.startDate,
      endDate: input.endDate,
      nextRunAt: input.startDate,
      autoIssue: input.autoIssue,
      dueInDays: input.dueInDays,
      currency: input.currency,
      taxMode: input.taxMode,
      documentDiscountType: input.documentDiscount?.type,
      documentDiscountValue: input.documentDiscount?.value,
      shippingMinorUnits: input.shippingMinorUnits,
      additionalFeesMinorUnits: input.additionalFeesMinorUnits,
      notes: input.notes,
      terms: input.terms,
      createdById,
      items: {
        create: input.lineItems.map((li, i) => ({
          position: i,
          productId: li.productId,
          description: li.description,
          quantity: li.quantity,
          unitPriceMinorUnits: li.unitPriceMinorUnits,
          taxRatePercent: li.taxRatePercent,
          discountType: li.discount?.type,
          discountValue: li.discount?.value,
        })),
      },
    },
    include: { items: true },
  });
}

export async function pauseRecurringInvoice(workspaceId: string, id: string) {
  await getRecurringInvoice(workspaceId, id);
  return prisma.recurringInvoice.update({ where: { id }, data: { status: 'PAUSED' } });
}

export async function resumeRecurringInvoice(workspaceId: string, id: string) {
  const recurring = await getRecurringInvoice(workspaceId, id);
  return prisma.recurringInvoice.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      nextRunAt: recurring.nextRunAt < new Date() ? new Date() : recurring.nextRunAt,
    },
  });
}

/**
 * Generates invoices for every ACTIVE recurring invoice whose nextRunAt has
 * passed. Called only from the protected cron endpoint. Each recurring
 * invoice is processed independently so one failure doesn't block the
 * others; failures are recorded on the row itself (lastRunError) for the
 * admin panel's failed-job view rather than thrown.
 */
export async function runDueRecurringInvoices(): Promise<{ processed: number; failed: number }> {
  const workspace = await prisma.recurringInvoice.findMany({
    where: { status: 'ACTIVE', nextRunAt: { lte: new Date() } },
    include: { items: true },
  });

  let processed = 0;
  let failed = 0;

  for (const recurring of workspace) {
    try {
      if (recurring.endDate && recurring.endDate < new Date()) {
        await prisma.recurringInvoice.update({
          where: { id: recurring.id },
          data: { status: 'ENDED' },
        });
        continue;
      }

      const dueDate = new Date(Date.now() + recurring.dueInDays * 24 * 60 * 60 * 1000);
      const invoice = await createInvoice(recurring.workspaceId, recurring.createdById ?? '', {
        customerId: recurring.customerId,
        currency: recurring.currency,
        taxMode: recurring.taxMode,
        issueDate: new Date(),
        dueDate,
        lineItems: recurring.items.map((i) => ({
          description: i.description,
          quantity: Number(i.quantity),
          unitPriceMinorUnits: i.unitPriceMinorUnits,
          taxRatePercent: Number(i.taxRatePercent),
          productId: i.productId ?? undefined,
          discount: i.discountType
            ? { type: i.discountType, value: Number(i.discountValue) }
            : undefined,
        })),
        documentDiscount:
          recurring.documentDiscountType && recurring.documentDiscountValue
            ? {
                type: recurring.documentDiscountType,
                value: Number(recurring.documentDiscountValue),
              }
            : undefined,
        shippingMinorUnits: recurring.shippingMinorUnits,
        additionalFeesMinorUnits: recurring.additionalFeesMinorUnits,
        notes: recurring.notes ?? undefined,
        terms: recurring.terms ?? undefined,
      });

      if (recurring.autoIssue) {
        await issueInvoice(recurring.workspaceId, invoice.id);
      }

      const nextRunAt = computeNextRunAt(recurring.nextRunAt, {
        frequency: recurring.frequency,
        customIntervalDays: recurring.customIntervalDays ?? undefined,
        timezone: 'UTC',
      });

      await prisma.recurringInvoice.update({
        where: { id: recurring.id },
        data: {
          nextRunAt,
          lastRunAt: new Date(),
          lastRunError: null,
          generatedCount: { increment: 1 },
        },
      });

      processed += 1;
    } catch (err) {
      failed += 1;
      logger.error(
        { err, recurringInvoiceId: recurring.id },
        'Failed to generate recurring invoice',
      );
      await prisma.recurringInvoice
        .update({
          where: { id: recurring.id },
          data: { lastRunError: err instanceof Error ? err.message : 'Unknown error' },
        })
        .catch(() => {});
    }
  }

  return { processed, failed };
}
