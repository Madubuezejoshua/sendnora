import { PrismaClient } from '../generated/client/index.js';

/**
 * Singleton PrismaClient. In dev, `tsx --watch`/Next.js hot-reload would
 * otherwise create a new client (and a new connection pool) on every file
 * change, quickly exhausting Postgres/Neon connection limits — so we stash
 * the instance on `globalThis` and reuse it.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '../generated/client/index.js';
export type { PrismaClient } from '../generated/client/index.js';
