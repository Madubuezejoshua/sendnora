'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getCurrency } from '@invoicetap/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@invoicetap/ui';
import { useCustomer } from '@/hooks/use-customers';
import { apiBrowserFetch } from '@/lib/api-browser';
import { useQuery } from '@tanstack/react-query';

interface StatementInvoice {
  id: string;
  number: string;
  status: string;
  currency: string;
  grandTotalMinorUnits: number;
  amountPaidMinorUnits: number;
  dueDate: string;
}

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: statement } = useQuery({
    queryKey: ['customers', id, 'statement'],
    queryFn: () =>
      apiBrowserFetch<{ data: { invoices: StatementInvoice[] } }>(
        `/customers/${id}/statement`,
      ).then((r) => r.data),
    enabled: Boolean(id),
  });

  if (isLoading || !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={customer.name} description={customer.email ?? undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{customer.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{customer.email ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">WhatsApp</span>
              <span>{customer.whatsappPhone ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={customer.status} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Invoice history</CardTitle>
          </CardHeader>
          <CardContent>
            {(!statement || statement.invoices.length === 0) && (
              <p className="text-muted-foreground text-sm">No invoices yet.</p>
            )}
            <div className="divide-border divide-y">
              {statement?.invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="hover:bg-accent/50 flex items-center justify-between py-3 text-sm"
                >
                  <span className="font-medium">{inv.number}</span>
                  <span>{formatMoney(inv.grandTotalMinorUnits, inv.currency)}</span>
                  <StatusBadge status={inv.status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
