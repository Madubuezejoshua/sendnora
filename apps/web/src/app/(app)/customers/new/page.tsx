'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerSchema, type CreateCustomerInput } from '@invoicetap/shared';
import {
  Button,
  Card,
  FormField,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@invoicetap/ui';
import { useCreateCustomer } from '@/hooks/use-customers';
import { ApiClientError } from '@/lib/api-browser';

export default function NewCustomerPage() {
  const router = useRouter();
  const createCustomer = useCreateCustomer();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { type: 'INDIVIDUAL' },
  });

  const onSubmit = async (values: CreateCustomerInput) => {
    try {
      const result = await createCustomer.mutateAsync(values);
      toast.success('Customer created');
      router.push(`/customers/${result.data.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'PLAN_LIMIT_EXCEEDED') {
        toast.error('Customer limit reached', 'Upgrade your plan to add more customers.');
        return;
      }
      toast.error('Could not create customer');
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="New customer" />
      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Type" htmlFor="type">
            <Select
              value={watch('type')}
              onValueChange={(v) => setValue('type', v as CreateCustomerInput['type'])}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="BUSINESS">Business</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" invalid={!!errors.name} {...register('name')} />
          </FormField>

          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" invalid={!!errors.email} {...register('email')} />
          </FormField>

          <FormField
            label="WhatsApp number"
            htmlFor="whatsappPhone"
            hint="Include country code, e.g. +234..."
          >
            <Input id="whatsappPhone" {...register('whatsappPhone')} />
          </FormField>

          <FormField
            label="Notes"
            htmlFor="notes"
            hint="Internal only — never shown to the customer"
          >
            <Textarea id="notes" rows={3} {...register('notes')} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createCustomer.isPending}>
              Create customer
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
