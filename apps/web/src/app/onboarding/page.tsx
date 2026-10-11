'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWorkspaceSchema, CURRENCIES, type CreateWorkspaceInput } from '@sendnaro/shared';
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@sendnaro/ui';
import { apiBrowserFetch } from '@/lib/api-browser';

const BUSINESS_TYPES = [
  'FREELANCER',
  'SOLE_PROPRIETOR',
  'PARTNERSHIP',
  'LIMITED_COMPANY',
  'NGO',
  'OTHER',
] as const;

const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
];

export default function OnboardingPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      businessType: 'FREELANCER',
      countryCode: 'NG',
      timezone: 'Africa/Lagos',
      locale: 'en',
      defaultCurrency: 'NGN',
    },
  });

  const onSubmit = async (values: CreateWorkspaceInput) => {
    setSubmitting(true);
    try {
      const result = await apiBrowserFetch<{ data: { id: string } }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      document.cookie = `itap_active_workspace=${result.data.id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      toast.success('Workspace created');
      router.push('/console');
      router.refresh();
    } catch {
      toast.error('Could not create workspace');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Set up your business</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tell us a bit about your business to get started.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <FormField
            label="Business name"
            htmlFor="businessName"
            required
            error={errors.businessName?.message}
          >
            <Input
              id="businessName"
              invalid={!!errors.businessName}
              {...register('businessName')}
            />
          </FormField>

          <FormField label="Business type" htmlFor="businessType">
            <Select
              defaultValue="FREELANCER"
              onValueChange={(v) =>
                setValue('businessType', v as CreateWorkspaceInput['businessType'])
              }
            >
              <SelectTrigger id="businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Country code"
              htmlFor="countryCode"
              required
              hint="2 letters, e.g. NG"
              error={errors.countryCode?.message}
            >
              <Input
                id="countryCode"
                maxLength={2}
                invalid={!!errors.countryCode}
                {...register('countryCode')}
              />
            </FormField>
            <FormField label="Default currency" htmlFor="defaultCurrency" required>
              <Select defaultValue="NGN" onValueChange={(v) => setValue('defaultCurrency', v)}>
                <SelectTrigger id="defaultCurrency">
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

          <FormField label="Timezone" htmlFor="timezone" required>
            <Select defaultValue="Africa/Lagos" onValueChange={(v) => setValue('timezone', v)}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <Button type="submit" isLoading={submitting} className="w-full">
            Continue
          </Button>
        </form>
        <input type="hidden" value={watch('locale')} readOnly />
      </Card>
    </div>
  );
}
