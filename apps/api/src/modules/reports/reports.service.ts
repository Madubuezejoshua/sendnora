import { prisma } from '@invoicetap/database';

export interface ReportDateRange {
  from: Date;
  to: Date;
}

export async function revenueByPeriod(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const payments = await prisma.payment.findMany({
    where: {
      workspaceId,
      currency,
      status: 'SUCCESSFUL',
      paidAt: { gte: range.from, lte: range.to },
    },
    select: { amountMinorUnits: true, paidAt: true },
    orderBy: { paidAt: 'asc' },
  });
  const byDay = new Map<string, number>();
  for (const p of payments) {
    const key = p.paidAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + p.amountMinorUnits);
  }
  return Array.from(byDay.entries()).map(([date, amountMinorUnits]) => ({
    date,
    amountMinorUnits,
  }));
}

export async function revenueByCustomer(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      currency,
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
      issueDate: { gte: range.from, lte: range.to },
    },
    select: { amountPaidMinorUnits: true, customer: { select: { id: true, name: true } } },
  });
  const byCustomer = new Map<
    string,
    { customerId: string; customerName: string; amountMinorUnits: number }
  >();
  for (const inv of invoices) {
    const entry = byCustomer.get(inv.customer.id) ?? {
      customerId: inv.customer.id,
      customerName: inv.customer.name,
      amountMinorUnits: 0,
    };
    entry.amountMinorUnits += inv.amountPaidMinorUnits;
    byCustomer.set(inv.customer.id, entry);
  }
  return Array.from(byCustomer.values()).sort((a, b) => b.amountMinorUnits - a.amountMinorUnits);
}

export async function revenueByProduct(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        workspaceId,
        currency,
        status: { in: ['PAID', 'PARTIALLY_PAID', 'ISSUED', 'SENT', 'VIEWED', 'OVERDUE'] },
        issueDate: { gte: range.from, lte: range.to },
      },
    },
    select: { description: true, lineTotalMinorUnits: true, productId: true },
  });
  const byProduct = new Map<string, { name: string; amountMinorUnits: number }>();
  for (const item of items) {
    const key = item.productId ?? item.description;
    const entry = byProduct.get(key) ?? { name: item.description, amountMinorUnits: 0 };
    entry.amountMinorUnits += item.lineTotalMinorUnits;
    byProduct.set(key, entry);
  }
  return Array.from(byProduct.values()).sort((a, b) => b.amountMinorUnits - a.amountMinorUnits);
}

export async function outstandingInvoices(workspaceId: string, currency: string) {
  return prisma.invoice.findMany({
    where: {
      workspaceId,
      currency,
      status: { in: ['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  });
}

export async function overdueAgeing(workspaceId: string, currency: string) {
  const invoices = await prisma.invoice.findMany({
    where: { workspaceId, currency, status: 'OVERDUE' },
    select: {
      id: true,
      number: true,
      dueDate: true,
      grandTotalMinorUnits: true,
      amountPaidMinorUnits: true,
      customer: { select: { name: true } },
    },
  });
  const now = Date.now();
  const buckets = {
    '0-30': [] as typeof invoices,
    '31-60': [] as typeof invoices,
    '61-90': [] as typeof invoices,
    '90+': [] as typeof invoices,
  };
  for (const inv of invoices) {
    const daysPastDue = Math.floor((now - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000));
    if (daysPastDue <= 30) buckets['0-30'].push(inv);
    else if (daysPastDue <= 60) buckets['31-60'].push(inv);
    else if (daysPastDue <= 90) buckets['61-90'].push(inv);
    else buckets['90+'].push(inv);
  }
  return buckets;
}

export async function paymentMethodBreakdown(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const grouped = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      workspaceId,
      currency,
      status: 'SUCCESSFUL',
      paidAt: { gte: range.from, lte: range.to },
    },
    _sum: { amountMinorUnits: true },
    _count: true,
  });
  return grouped.map((g) => ({
    method: g.method,
    amountMinorUnits: g._sum.amountMinorUnits ?? 0,
    count: g._count,
  }));
}

export async function taxSummary(workspaceId: string, currency: string, range: ReportDateRange) {
  const result = await prisma.invoice.aggregate({
    where: {
      workspaceId,
      currency,
      status: { not: 'DRAFT' },
      issueDate: { gte: range.from, lte: range.to },
    },
    _sum: { totalTaxMinorUnits: true },
  });
  return { totalTaxMinorUnits: result._sum.totalTaxMinorUnits ?? 0 };
}

export async function discountSummary(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const result = await prisma.invoice.aggregate({
    where: {
      workspaceId,
      currency,
      status: { not: 'DRAFT' },
      issueDate: { gte: range.from, lte: range.to },
    },
    _sum: { totalDiscountMinorUnits: true },
  });
  return { totalDiscountMinorUnits: result._sum.totalDiscountMinorUnits ?? 0 };
}

export async function expenseSummary(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const expenses = await prisma.expense.findMany({
    where: {
      workspaceId,
      currency,
      deletedAt: null,
      incurredAt: { gte: range.from, lte: range.to },
    },
    select: { category: true, amountMinorUnits: true },
  });
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountMinorUnits);
    total += e.amountMinorUnits;
  }
  return {
    totalMinorUnits: total,
    byCategory: Array.from(byCategory.entries()).map(([category, amountMinorUnits]) => ({
      category,
      amountMinorUnits,
    })),
  };
}

/**
 * A simple, clearly-labelled estimate: revenue collected minus expenses
 * incurred in the period. This is NOT a certified profit/loss statement —
 * it ignores accrual accounting, cost of goods sold, depreciation, etc.
 * The UI must present this with an "estimate" label per PRODUCT_REQUIREMENTS.md.
 */
export async function profitEstimate(
  workspaceId: string,
  currency: string,
  range: ReportDateRange,
) {
  const [revenue, expenses] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        workspaceId,
        currency,
        status: 'SUCCESSFUL',
        paidAt: { gte: range.from, lte: range.to },
      },
      _sum: { amountMinorUnits: true },
    }),
    prisma.expense.aggregate({
      where: {
        workspaceId,
        currency,
        deletedAt: null,
        incurredAt: { gte: range.from, lte: range.to },
      },
      _sum: { amountMinorUnits: true },
    }),
  ]);
  const revenueMinorUnits = revenue._sum.amountMinorUnits ?? 0;
  const expensesMinorUnits = expenses._sum.amountMinorUnits ?? 0;
  return {
    revenueMinorUnits,
    expensesMinorUnits,
    estimatedProfitMinorUnits: revenueMinorUnits - expensesMinorUnits,
    isEstimate: true,
  };
}
