'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createExpenseSchema,
  CURRENCIES,
  getCurrency,
  type CreateExpenseInput,
} from '@invoicetap/shared';
import {
  Button,
  DataTable,
  DateInput,
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
import { useCreateExpense, useExpenses, type Expense } from '@/hooks/use-expenses';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

const COLUMNS: DataTableColumn<Expense>[] = [
  {
    key: 'vendor',
    header: 'Vendor',
    sortable: true,
    render: (e) => <span className="font-medium">{e.vendor}</span>,
  },
  { key: 'category', header: 'Category', render: (e) => e.category },
  {
    key: 'incurredAt',
    header: 'Date',
    sortable: true,
    render: (e) => new Date(e.incurredAt).toLocaleDateString(),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (e) => formatMoney(e.amountMinorUnits, e.currency),
  },
];

function NewExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createExpense = useCreateExpense();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateExpenseInput>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: {
      currency: 'USD',
      incurredAt: new Date().toISOString().slice(0, 10) as never,
      taxAmountMinorUnits: 0,
      isRecurring: false,
    },
  });

  const onSubmit = async (values: CreateExpenseInput) => {
    try {
      await createExpense.mutateAsync(values);
      toast.success('Expense recorded');
      onOpenChange(false);
    } catch {
      toast.error('Could not record expense');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Vendor" htmlFor="vendor" required error={errors.vendor?.message}>
            <Input id="vendor" invalid={!!errors.vendor} {...register('vendor')} />
          </FormField>
          <FormField label="Category" htmlFor="category" required error={errors.category?.message}>
            <Input id="category" invalid={!!errors.category} {...register('category')} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Amount (minor units)"
              htmlFor="amountMinorUnits"
              required
              error={errors.amountMinorUnits?.message}
            >
              <Input
                id="amountMinorUnits"
                type="number"
                invalid={!!errors.amountMinorUnits}
                {...register('amountMinorUnits', { valueAsNumber: true })}
              />
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
          <FormField label="Date incurred" htmlFor="incurredAt" required>
            <DateInput
              id="incurredAt"
              defaultValue={new Date().toISOString().slice(0, 10)}
              {...register('incurredAt' as never)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createExpense.isPending}>
              Save expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpensesPage() {
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data, isLoading } = useExpenses({ page });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track business costs — not a certified accounting system"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> New expense
          </Button>
        }
      />
      <DataTable
        columns={COLUMNS}
        rows={data?.items ?? []}
        getRowId={(e) => e.id}
        isLoading={isLoading}
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 20}
        totalItems={data?.totalItems}
        onPageChange={setPage}
        emptyTitle="No expenses recorded"
      />
      <NewExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
