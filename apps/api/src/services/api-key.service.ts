import { createHash } from 'node:crypto';
import { prisma } from '@invoicetap/database';
import { AppError, generateApiKey } from '@invoicetap/shared';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Issues a new API key. The plaintext key is returned ONLY here — it is
 * never stored or retrievable again, only its SHA-256 hash and a display
 * prefix are persisted. SHA-256 (not argon2/bcrypt) is intentional: this is
 * a high-entropy 40-char random secret, not a low-entropy password, so a
 * fast deterministic hash is fine and lets lookup be a direct unique-index
 * query instead of testing every stored hash.
 *
 * NOTE: this key is a scoped management record only — no route middleware
 * currently authenticates incoming requests against ApiKey rows. Wiring
 * these up as a real external-API auth mechanism (scope enforcement, rate
 * limiting per key, public API docs) is a separate, not-yet-built feature.
 */
export async function createApiKey(workspaceId: string, createdById: string, name: string) {
  const { key, prefix } = generateApiKey();
  const record = await prisma.apiKey.create({
    data: {
      workspaceId,
      createdById,
      name,
      prefix,
      hashedKey: hashApiKey(key),
      scopes: [],
    },
  });
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    createdAt: record.createdAt,
    key,
  };
}

export async function listApiKeys(workspaceId: string) {
  return prisma.apiKey.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiKey(workspaceId: string, id: string) {
  const key = await prisma.apiKey.findFirst({ where: { id, workspaceId } });
  if (!key) throw new AppError('NOT_FOUND', 'API key not found');
  if (key.revokedAt) return key;
  return prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}
