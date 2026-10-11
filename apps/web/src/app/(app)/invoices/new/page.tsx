'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createInvoiceSchema, CURRENCIES, type CreateInvoiceInput } from '@invoicetap/shared';
import {
  Button,
  Card,
  DateInput,
  FormField,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@invoicetap/ui';
import { useCustomers } from '@/hooks/use-customers';
import { useCreateInvoice } from '@/hooks/use-invoices';
import { LineItemEditor } from '@/components/app/line-item-editor';

export default function NewInvoicePage() {
  const router = useRouter();
  const { data: customers } = useCustomers({ page: 1 });
  const createInvoice = useCreateInvoice();

  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateInvoiceInput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      issueDate: today as never,
      dueDate: in14Days as never,
      lineItems: [{ description: '', quantity: 1, unitPriceMinorUnits: 0, taxRatePercent: 0 }],
      shippingMinorUnits: 0,
      additionalFeesMinorUnits: 0,
    },
  });

  const onSubmit = async (values: CreateInvoiceInput) => {
    try {
      const result = await createInvoice.mutateAsync(values);
      toast.success('Invoice created');
      router.push(`/invoices/${result.data.id}`);
    } catch {
      toast.error('Could not create invoice');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New invoice" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Customer"
              htmlFor="customerId"
              required
              error={errors.customerId?.message}
            >
              <Select onValueChange={(v) => setValue('customerId', v)}>
                <SelectTrigger id="customerId">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.items.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
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
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Issue date" htmlFor="issueDate" required>
              <DateInput id="issueDate" defaultValue={today} {...register('issueDate' as never)} />
            </FormField>

            <FormField
              label="Due date"
              htmlFor="dueDate"
              required
              error={errors.dueDate?.message as string | undefined}
            >
              <DateInput id="dueDate" defaultValue={in14Days} {...register('dueDate' as never)} />
            </FormField>
          </div>
        </Card>

        <Card className="p-6">
          <LineItemEditor control={control} register={register} watch={watch} setValue={setValue} />
          {errors.lineItems && (
            <p className="text-destructive mt-2 text-sm">{errors.lineItems.message as string}</p>
          )}
        </Card>

        <Card className="space-y-4 p-6">
          <FormField label="Notes" htmlFor="notes" hint="Shown to the customer">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </FormField>
          <FormField
            label="Payment instructions"
            htmlFor="paymentInstructions"
            hint="E.g. bank account details"
          >
            <Textarea id="paymentInstructions" rows={2} {...register('paymentInstructions')} />
          </FormField>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createInvoice.isPending}>
            Save draft
          </Button>
        </div>
      </form>
    </div>
  );
}
