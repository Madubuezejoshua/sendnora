'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createQuoteSchema, CURRENCIES, type CreateQuoteInput } from '@invoicetap/shared';
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
import { useCreateQuote } from '@/hooks/use-quotes';
import { LineItemEditor } from '@/components/app/line-item-editor';

export default function NewQuotePage() {
  const router = useRouter();
  const { data: customers } = useCustomers({ page: 1 });
  const createQuote = useCreateQuote();

  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateQuoteInput>({
    resolver: zodResolver(createQuoteSchema),
    defaultValues: {
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      issueDate: today as never,
      expiryDate: in14Days as never,
      lineItems: [{ description: '', quantity: 1, unitPriceMinorUnits: 0, taxRatePercent: 0 }],
      shippingMinorUnits: 0,
      additionalFeesMinorUnits: 0,
    },
  });

  const onSubmit = async (values: CreateQuoteInput) => {
    try {
      const result = await createQuote.mutateAsync(values);
      toast.success('Quote created');
      router.push(`/quotes/${result.data.id}`);
    } catch {
      toast.error('Could not create quote');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New quote" />
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
            <FormField label="Expiry date" htmlFor="expiryDate">
              <DateInput
                id="expiryDate"
                defaultValue={in14Days}
                {...register('expiryDate' as never)}
              />
            </FormField>
          </div>
        </Card>

        <Card className="p-6">
          <LineItemEditor control={control} register={register} watch={watch} setValue={setValue} />
        </Card>

        <Card className="p-6">
          <FormField label="Notes" htmlFor="notes" hint="Shown to the customer">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </FormField>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createQuote.isPending}>
            Save draft
          </Button>
        </div>
      </form>
    </div>
  );
}
