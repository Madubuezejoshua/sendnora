'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, FormField, Input } from '@sendnaro/ui';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showTotp, setShowTotp] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      // signIn() stringifies options via URLSearchParams — an undefined value would arrive as "undefined".
      ...(values.totpCode ? { totpCode: values.totpCode } : {}),
      redirect: false,
    });

    if (result?.code === 'email_not_verified') {
      setFormError('Please verify your email first. Open the link in the message we sent you, then log in.');
      return;
    }
    if (result?.error) {
      setShowTotp(true);
      setFormError('Incorrect email/password, or a two-factor code is required.');
      return;
    }

    router.push(searchParams.get('callbackUrl') || '/console');
    router.refresh();
  };

  return (
    <div>
      <h1 className="text-lg font-semibold">Log in to your account</h1>
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
        <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        {showTotp && (
          <FormField
            label="Two-factor code"
            htmlFor="totpCode"
            hint="Only needed if you've enabled 2FA"
          >
            <Input id="totpCode" inputMode="numeric" maxLength={6} {...register('totpCode')} />
          </FormField>
        )}
        {formError && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {formError}
          </p>
        )}
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Log in
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-foreground font-medium underline underline-offset-2">
          Sign up free
        </Link>
      </p>
    </div>
  );
}
