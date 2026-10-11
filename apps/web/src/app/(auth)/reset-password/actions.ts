'use server';

import { prisma } from '@sendnaro/database';
import { hashPassword } from '@sendnaro/database/password';
import { sha256Hex } from '@sendnaro/database/encryption';
import { resetPasswordSchema } from '@sendnaro/shared';

export interface ResetPasswordResult {
  ok: boolean;
  error?: string;
}

export async function resetPasswordAction(input: {
  token: string;
  password: string;
}): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return {
      ok: false,
      error: 'This reset link has expired or already been used. Please request a new one.',
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Reset also revokes every existing session — a credential change should force re-authentication everywhere.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return { ok: true };
}
