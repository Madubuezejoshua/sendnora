'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getCurrency } from '@invoicetap/shared';
import { Button, DataTable, PageHeader, StatusBadge, type DataTableColumn } from '@invoicetap/ui';
import { useQuotes, type Quote } from '@/hooks/use-quotes';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

const COLUMNS: DataTableColumn<Quote>[] = [
  {
    key: 'number',
    header: 'Number',
    sortable: true,
    render: (q) => <span className="font-medium">{q.number}</span>,
  },
  { key: 'customer', header: 'Customer', render: (q) => q.customer.name },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (q) => formatMoney(q.grandTotalMinorUnits, q.currency),
  },
  { key: 'status', header: 'Status', render: (q) => <StatusBadge status={q.status} /> },
];

export default function QuotesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useQuotes({ page, search: search || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        actions={
          <Button asChild>
            <Link href="/quotes/new">
              <Plus className="size-4" /> New quote
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={data?.items ?? []}
        getRowId={(q) => q.id}
        isLoading={isLoading}
        onRowClick={(q) => router.push(`/quotes/${q.id}`)}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 20}
        totalItems={data?.totalItems}
        onPageChange={setPage}
        emptyTitle="No quotes yet"
        emptyDescription="Send a quote to get customer sign-off before invoicing."
      />
    </div>
  );
}
