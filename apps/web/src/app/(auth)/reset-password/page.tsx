import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@invoicetap/ui';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Invalid link</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This password reset link is missing its token.
        </p>
        <Button asChild className="mt-6">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
