'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getCurrency } from '@invoicetap/shared';
import { Button, DataTable, PageHeader, StatusBadge, type DataTableColumn } from '@invoicetap/ui';
import { useInvoices, type Invoice } from '@/hooks/use-invoices';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

const COLUMNS: DataTableColumn<Invoice>[] = [
  {
    key: 'number',
    header: 'Number',
    sortable: true,
    render: (i) => <span className="font-medium">{i.number}</span>,
  },
  { key: 'customer', header: 'Customer', render: (i) => i.customer.name },
  {
    key: 'dueDate',
    header: 'Due date',
    sortable: true,
    render: (i) => new Date(i.dueDate).toLocaleDateString(),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (i) => formatMoney(i.grandTotalMinorUnits, i.currency),
  },
  { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useInvoices({ page, search: search || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus className="size-4" /> New invoice
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={data?.items ?? []}
        getRowId={(i) => i.id}
        isLoading={isLoading}
        onRowClick={(i) => router.push(`/invoices/${i.id}`)}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search by invoice number..."
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 20}
        totalItems={data?.totalItems}
        onPageChange={setPage}
        emptyTitle="No invoices yet"
        emptyDescription="Create your first invoice to start getting paid."
      />
    </div>
  );
}
