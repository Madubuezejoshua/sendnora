'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Badge, Button, DataTable, PageHeader, type DataTableColumn } from '@invoicetap/ui';
import { useCustomers, type Customer } from '@/hooks/use-customers';
import { CsvImportExport } from '@/components/app/csv-import-export';

const COLUMNS: DataTableColumn<Customer>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (c) => <span className="font-medium">{c.name}</span>,
  },
  { key: 'email', header: 'Email', render: (c) => c.email ?? '—' },
  { key: 'whatsappPhone', header: 'WhatsApp', render: (c) => c.whatsappPhone ?? '—' },
  { key: 'type', header: 'Type', render: (c) => <Badge variant="outline">{c.type}</Badge> },
];

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useCustomers({ page, search: search || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone you bill"
        actions={
          <>
            <CsvImportExport resource="customers" invalidateQueryKey="customers" />
            <Button asChild>
              <Link href="/customers/new">
                <Plus className="size-4" /> New customer
              </Link>
            </Button>
          </>
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={data?.items ?? []}
        getRowId={(c) => c.id}
        isLoading={isLoading}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search customers..."
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 20}
        totalItems={data?.totalItems}
        onPageChange={setPage}
        emptyTitle="No customers yet"
        emptyDescription="Add your first customer to start creating quotes and invoices."
      />
    </div>
  );
}
