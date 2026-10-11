'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, FormField, Input } from '@sendnaro/ui';
import { registerAction } from './actions';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Enter a valid email'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-zA-Z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});
type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const [submitted, setSubmitted] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await registerAction(values);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof FormValues, { message: messages?.[0] });
        }
      }
      if (result.error) setFormError(result.error);
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          We&apos;ve sent a verification link to your email address. Click it to activate your
          account.
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
      <h1 className="text-lg font-semibold">Create your account</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <FormField label="Full name" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" autoComplete="name" invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          required
          error={errors.password?.message}
          hint="At least 12 characters, with a letter and a number"
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        {formError && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {formError}
          </p>
        )}
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground font-medium underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}
