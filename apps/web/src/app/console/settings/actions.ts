'use server';

import { prisma } from '@sendnaro/database';
import { hashPassword, verifyPassword } from '@sendnaro/database/password';
import { changePasswordSchema } from '@sendnaro/shared';
import { auth } from '@/auth';

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Not signed in' };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (
    !user?.passwordHash ||
    !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))
  ) {
    return { ok: false, error: 'Current password is incorrect' };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { ok: true };
}

export async function listSessionsAction() {
  const session = await auth();
  if (!session?.user) return [];
  return prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expires: true, ipAddress: true, userAgent: true },
  });
}

/** Logs out every device, including the current one — simpler and safer than trying to preserve just the caller's session. */
export async function revokeOtherSessionsAction(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await prisma.session.deleteMany({ where: { userId: session.user.id } });
  return { ok: true };
}
