'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrency } from '@invoicetap/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  SimpleBarChart,
} from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';
import { useMyWorkspaces } from '@/hooks/use-workspaces';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

export default function ReportsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const defaultCurrency = workspaces?.[0]?.workspace.defaultCurrency ?? 'USD';
  const [currency, setCurrency] = React.useState(defaultCurrency);

  React.useEffect(() => setCurrency(defaultCurrency), [defaultCurrency]);

  const { data: revenueByCustomer, isLoading: loadingCustomers } = useQuery({
    queryKey: ['reports', 'revenue-by-customer', currency],
    queryFn: () =>
      apiBrowserFetch<{ data: { customerName: string; amountMinorUnits: number }[] }>(
        `/reports/revenue-by-customer?currency=${currency}`,
      ).then((r) => r.data),
  });

  const { data: profit, isLoading: loadingProfit } = useQuery({
    queryKey: ['reports', 'profit-estimate', currency],
    queryFn: () =>
      apiBrowserFetch<{
        data: {
          revenueMinorUnits: number;
          expensesMinorUnits: number;
          estimatedProfitMinorUnits: number;
        };
      }>(`/reports/profit-estimate?currency=${currency}`).then((r) => r.data),
  });

  const { data: overdue, isLoading: loadingOverdue } = useQuery({
    queryKey: ['reports', 'overdue-ageing', currency],
    queryFn: () =>
      apiBrowserFetch<{
        data: Record<string, { id: string; number: string; grandTotalMinorUnits: number }[]>;
      }>(`/reports/overdue-ageing?currency=${currency}`).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        actions={
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={currency}>{currency}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by customer</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCustomers ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <SimpleBarChart
                data={(revenueByCustomer ?? [])
                  .slice(0, 8)
                  .map((c) => ({ label: c.customerName, value: c.amountMinorUnits }))}
                accessibleSummary="Revenue by customer bar chart"
                valueFormatter={(v) => formatMoney(v, currency)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profit estimate</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProfit ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue collected</span>
                  <span>{formatMoney(profit?.revenueMinorUnits ?? 0, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses</span>
                  <span>{formatMoney(profit?.expensesMinorUnits ?? 0, currency)}</span>
                </div>
                <div className="border-border flex justify-between border-t pt-2 font-semibold">
                  <span>Estimated profit</span>
                  <span>{formatMoney(profit?.estimatedProfitMinorUnits ?? 0, currency)}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  This is a simple estimate (revenue minus expenses), not a certified profit/loss
                  statement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Overdue ageing</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOverdue ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-4">
                {overdue &&
                  Object.entries(overdue).map(([bucket, invoices]) => (
                    <div key={bucket} className="border-border rounded-md border p-3 text-center">
                      <p className="text-muted-foreground text-xs">{bucket} days</p>
                      <p className="mt-1 text-lg font-semibold">{invoices.length}</p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
