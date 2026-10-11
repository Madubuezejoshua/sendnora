'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { getCurrency } from '@invoicetap/shared';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  type DataTableColumn,
} from '@invoicetap/ui';
import { CsvImportExport } from '@/components/app/csv-import-export';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductSchema, CURRENCIES, type CreateProductInput } from '@invoicetap/shared';
import { useCreateProduct, useProducts, type Product } from '@/hooks/use-products';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

const COLUMNS: DataTableColumn<Product>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (p) => <span className="font-medium">{p.name}</span>,
  },
  { key: 'kind', header: 'Kind', render: (p) => <Badge variant="outline">{p.kind}</Badge> },
  {
    key: 'price',
    header: 'Price',
    align: 'right',
    render: (p) => formatMoney(p.unitPriceMinorUnits, p.currency),
  },
  { key: 'unit', header: 'Unit', render: (p) => p.unit },
];

function NewProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createProduct = useCreateProduct();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: { kind: 'SERVICE', currency: 'USD', unit: 'unit' },
  });

  const onSubmit = async (values: CreateProductInput) => {
    try {
      await createProduct.mutateAsync(values);
      toast.success('Product created');
      onOpenChange(false);
    } catch {
      toast.error('Could not create product');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New product or service</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" invalid={!!errors.name} {...register('name')} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Kind" htmlFor="kind">
              <Select
                defaultValue="SERVICE"
                onValueChange={(v) => setValue('kind', v as CreateProductInput['kind'])}
              >
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="PRODUCT">Product</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Currency" htmlFor="currency" required>
              <Select defaultValue="USD" onValueChange={(v) => setValue('currency', v)}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField
            label="Unit price (minor units)"
            htmlFor="unitPriceMinorUnits"
            required
            hint="E.g. 5000 = $50.00"
            error={errors.unitPriceMinorUnits?.message}
          >
            <Input
              id="unitPriceMinorUnits"
              type="number"
              invalid={!!errors.unitPriceMinorUnits}
              {...register('unitPriceMinorUnits', { valueAsNumber: true })}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createProduct.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data, isLoading } = useProducts({ page, search: search || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & services"
        actions={
          <>
            <CsvImportExport resource="products" invalidateQueryKey="products" />
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> New product
            </Button>
          </>
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={data?.items ?? []}
        getRowId={(p) => p.id}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 20}
        totalItems={data?.totalItems}
        onPageChange={setPage}
        emptyTitle="No products yet"
        emptyDescription="Add products or services to reuse them on quotes and invoices."
      />

      <NewProductDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
