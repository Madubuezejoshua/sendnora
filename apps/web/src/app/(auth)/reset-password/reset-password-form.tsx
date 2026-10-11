'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, FormField, Input } from '@sendnaro/ui';
import { resetPasswordAction } from './actions';

const schema = z.object({
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-zA-Z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});
type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await resetPasswordAction({ token, password: values.password });
    if (!result.ok) {
      setFormError(result.error ?? 'Something went wrong');
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Password updated</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You can now log in with your new password.
        </p>
        <Button asChild className="mt-6">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <FormField
          label="New password"
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
          Update password
        </Button>
      </form>
    </div>
  );
}
