import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@invoicetap/database';
import { Button } from '@invoicetap/ui';

export const metadata: Metadata = { title: 'Verify email' };

async function verify(
  token: string | undefined,
  email: string | undefined,
): Promise<'ok' | 'invalid' | 'missing'> {
  if (!token || !email) return 'missing';

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.identifier !== email || record.expires < new Date()) {
    return 'invalid';
  }

  await prisma.$transaction([
    prisma.user.update({ where: { email }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  return 'ok';
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;
  const result = await verify(token, email);

  if (result === 'missing') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Click the verification link we sent you to activate your account.
        </p>
      </div>
    );
  }

  if (result === 'invalid') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Link expired or invalid</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This verification link is no longer valid. Please log in and request a new one.
        </p>
        <Button asChild className="mt-6">
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-lg font-semibold">Email verified</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Your email has been verified. You can now log in.
      </p>
      <Button asChild className="mt-6">
        <Link href="/login">Log in</Link>
      </Button>
    </div>
  );
}
