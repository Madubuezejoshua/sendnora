'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, FormField, Input } from '@invoicetap/ui';
import { forgotPasswordAction } from './actions';

const schema = z.object({ email: z.string().trim().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    await forgotPasswordAction(values);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          If an account exists for that email, we&apos;ve sent a password reset link.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium underline underline-offset-2"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        We&apos;ll email you a link to reset your password.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>
    </div>
  );
}
