import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getCurrency } from '@invoicetap/shared';
import { RevenueChart } from './revenue-chart';
import { Button, Card, PageHeader, StatCard, StatusBadge } from '@invoicetap/ui';
import { apiFetch } from '@/lib/api-client';

export const metadata: Metadata = { title: 'Dashboard' };

interface DashboardSummary {
  defaultCurrency: string;
  byCurrency: {
    currency: string;
    totalInvoiced: number;
    totalCollected: number;
    outstanding: number;
    overdue: number;
  }[];
  customersCount: number;
  draftInvoicesCount: number;
  paidInvoicesCount: number;
  monthlyRevenue: { label: string; value: number }[];
  recentInvoices: {
    id: string;
    number: string;
    status: string;
    grandTotalMinorUnits: number;
    currency: string;
    customer: { name: string };
  }[];
  upcomingDue: {
    id: string;
    number: string;
    dueDate: string;
    grandTotalMinorUnits: number;
    currency: string;
    customer: { name: string };
  }[];
}

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  const major = minorUnits / 10 ** def.minorUnitDigits;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  })
    .format(major)
    .replace(currency, def.symbol);
}

export default async function DashboardPage() {
  const { data: summary } = await apiFetch<{ data: DashboardSummary }>('/dashboard');
  const primary = summary.byCurrency.find((c) => c.currency === summary.defaultCurrency) ?? {
    currency: summary.defaultCurrency,
    totalInvoiced: 0,
    totalCollected: 0,
    outstanding: 0,
    overdue: 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your business at a glance"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/quotes/new">New quote</Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">
                <Plus className="size-4" /> New invoice
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total invoiced"
          value={formatMoney(primary.totalInvoiced, primary.currency)}
        />
        <StatCard
          label="Total collected"
          value={formatMoney(primary.totalCollected, primary.currency)}
        />
        <StatCard label="Outstanding" value={formatMoney(primary.outstanding, primary.currency)} />
        <StatCard
          label="Overdue"
          value={formatMoney(primary.overdue, primary.currency)}
          trend={primary.overdue > 0 ? { value: 'Needs attention', direction: 'down' } : undefined}
        />
      </div>

      {summary.byCurrency.length > 1 && (
        <Card className="text-muted-foreground p-4 text-sm">
          You have activity in {summary.byCurrency.length} currencies. Totals above show{' '}
          {summary.defaultCurrency} only — see Reports for a full per-currency breakdown.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold">Revenue (last 6 months)</h2>
          <div className="mt-4">
            <RevenueChart data={summary.monthlyRevenue} currency={summary.defaultCurrency} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Upcoming due</h2>
          <div className="mt-4 space-y-3">
            {summary.upcomingDue.length === 0 && (
              <p className="text-muted-foreground text-sm">Nothing due soon.</p>
            )}
            {summary.upcomingDue.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between text-sm hover:underline"
              >
                <span className="truncate">{inv.customer.name}</span>
                <span className="shrink-0 font-medium">
                  {formatMoney(inv.grandTotalMinorUnits, inv.currency)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent invoices</h2>
          <Link href="/invoices" className="text-muted-foreground hover:text-foreground text-sm">
            View all
          </Link>
        </div>
        <div className="divide-border mt-4 divide-y">
          {summary.recentInvoices.length === 0 && (
            <p className="text-muted-foreground py-4 text-sm">No invoices yet.</p>
          )}
          {summary.recentInvoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="hover:bg-accent/50 flex items-center justify-between py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{inv.number}</span>
                <span className="text-muted-foreground">{inv.customer.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>{formatMoney(inv.grandTotalMinorUnits, inv.currency)}</span>
                <StatusBadge status={inv.status} />
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
