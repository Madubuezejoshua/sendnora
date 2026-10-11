'use server';

import { randomBytes } from 'node:crypto';
import { prisma } from '@invoicetap/database';
import { hashPassword } from '@invoicetap/database/password';
import { registerSchema } from '@invoicetap/shared';
import { getWebEnv } from '@/lib/env';
import { sendAuthEmail, verifyEmailContent } from '@/lib/auth-email';

export interface RegisterResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function registerAction(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { ok: false, error: 'An account with this email already exists.' };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });

  const token = randomBytes(32).toString('hex');
  await prisma.verificationToken.create({
    data: { identifier: user.email, token, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  const env = getWebEnv();
  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
  const content = verifyEmailContent(user.name ?? user.email, verifyUrl);
  await sendAuthEmail(user.email, content.subject, content.html, content.text).catch(() => {});

  return { ok: true };
}
