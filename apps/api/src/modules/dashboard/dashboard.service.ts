import { prisma } from '@invoicetap/database';
import { OPEN_INVOICE_STATUSES } from '@invoicetap/shared';

/**
 * All amounts are grouped by currency rather than summed together — this
 * app never converts between currencies without an explicit, configured
 * exchange rate, so mixing e.g. NGN and USD totals would silently produce
 * a meaningless number. See PRODUCT_REQUIREMENTS.md.
 */
export async function getDashboardSummary(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  const invoices = await prisma.invoice.findMany({
    where: { workspaceId, status: { not: 'CANCELLED' } },
    select: {
      currency: true,
      status: true,
      grandTotalMinorUnits: true,
      amountPaidMinorUnits: true,
      dueDate: true,
    },
  });

  const byCurrency = new Map<
    string,
    { totalInvoiced: number; totalCollected: number; outstanding: number; overdue: number }
  >();
  for (const inv of invoices) {
    const entry = byCurrency.get(inv.currency) ?? {
      totalInvoiced: 0,
      totalCollected: 0,
      outstanding: 0,
      overdue: 0,
    };
    if (inv.status !== 'DRAFT' && inv.status !== 'VOID') {
      entry.totalInvoiced += inv.grandTotalMinorUnits;
      entry.totalCollected += inv.amountPaidMinorUnits;
      if (OPEN_INVOICE_STATUSES.includes(inv.status)) {
        entry.outstanding += inv.grandTotalMinorUnits - inv.amountPaidMinorUnits;
        if (inv.status === 'OVERDUE')
          entry.overdue += inv.grandTotalMinorUnits - inv.amountPaidMinorUnits;
      }
    }
    byCurrency.set(inv.currency, entry);
  }

  const [customersCount, draftCount, paidCount, recentInvoices, upcomingDue] = await Promise.all([
    prisma.customer.count({ where: { workspaceId, status: 'ACTIVE' } }),
    prisma.invoice.count({ where: { workspaceId, status: 'DRAFT' } }),
    prisma.invoice.count({ where: { workspaceId, status: 'PAID' } }),
    prisma.invoice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, status: { in: OPEN_INVOICE_STATUSES } },
      orderBy: { dueDate: 'asc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
  ]);

  // Monthly revenue (collected payments) for the last 6 months, workspace default currency only.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
  sixMonthsAgo.setUTCDate(1);
  const payments = await prisma.payment.findMany({
    where: {
      workspaceId,
      status: 'SUCCESSFUL',
      currency: workspace.defaultCurrency,
      paidAt: { gte: sixMonthsAgo },
    },
    select: { amountMinorUnits: true, paidAt: true },
  });
  const monthlyRevenue: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i);
    const label = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const monthKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const value = payments
      .filter((p) => `${p.paidAt.getUTCFullYear()}-${p.paidAt.getUTCMonth()}` === monthKey)
      .reduce((acc, p) => acc + p.amountMinorUnits, 0);
    monthlyRevenue.push({ label, value });
  }

  return {
    defaultCurrency: workspace.defaultCurrency,
    byCurrency: Array.from(byCurrency.entries()).map(([currency, totals]) => ({
      currency,
      ...totals,
    })),
    customersCount,
    draftInvoicesCount: draftCount,
    paidInvoicesCount: paidCount,
    monthlyRevenue,
    recentInvoices,
    upcomingDue,
    onboardingCompleted: Boolean(workspace.onboardingCompletedAt),
  };
}
