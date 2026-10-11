'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { getCurrency } from '@invoicetap/shared';
import {
  Button,
  CurrencyInput,
  DateInput,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@invoicetap/ui';
import { useRecordPayment } from '@/hooks/use-invoices';

const METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  currency,
  outstandingMinorUnits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  currency: string;
  outstandingMinorUnits: number;
}) {
  const recordPayment = useRecordPayment(invoiceId);
  const minorUnitDigits = getCurrency(currency).minorUnitDigits;
  const [amount, setAmount] = React.useState(outstandingMinorUnits);
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      method: 'BANK_TRANSFER' as (typeof METHODS)[number],
      paidAt: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  });

  React.useEffect(() => setAmount(outstandingMinorUnits), [outstandingMinorUnits, open]);

  const onSubmit = async (values: {
    method: (typeof METHODS)[number];
    paidAt: string;
    notes: string;
  }) => {
    try {
      await recordPayment.mutateAsync({
        amountMinorUnits: amount,
        method: values.method,
        paidAt: new Date(values.paidAt) as never,
        notes: values.notes || undefined,
      });
      toast.success('Payment recorded', 'A receipt has been generated.');
      onOpenChange(false);
    } catch {
      toast.error('Could not record payment');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Amount" htmlFor="amount" required>
            <CurrencyInput
              id="amount"
              minorUnitDigits={minorUnitDigits}
              valueMinorUnits={amount}
              onValueChange={setAmount}
              symbol={getCurrency(currency).symbol}
            />
          </FormField>
          <FormField label="Payment method" htmlFor="method" required>
            <Select
              value={watch('method')}
              onValueChange={(v) => setValue('method', v as (typeof METHODS)[number])}
            >
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Date paid" htmlFor="paidAt" required>
            <DateInput id="paidAt" {...register('paidAt')} />
          </FormField>
          <FormField label="Notes" htmlFor="notes" hint="Optional, internal only">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={recordPayment.isPending} disabled={amount <= 0}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
