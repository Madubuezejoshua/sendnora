'use server';

import { randomBytes } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { sha256Hex } from '@sendnaro/database/encryption';
import { forgotPasswordSchema } from '@sendnaro/shared';
import { getWebEnv } from '@/lib/env';
import { sendAuthEmail, resetPasswordContent } from '@/lib/auth-email';

export async function forgotPasswordAction(input: { email: string }): Promise<{ ok: boolean }> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: true }; // Never reveal validation details for this endpoint.

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Always return ok — never reveal whether an email address has an account (prevents user enumeration).
  if (!user) return { ok: true };

  const rawToken = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const env = getWebEnv();
  const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;
  const content = resetPasswordContent(user.name ?? user.email, resetUrl);
  await sendAuthEmail(user.email, content.subject, content.html, content.text).catch((err: Error) => console.error('Auth email was not sent:', err.message));

  return { ok: true };
}
