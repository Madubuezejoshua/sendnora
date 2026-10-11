import { prisma } from '@invoicetap/database';
import { parseApiEnv } from '@invoicetap/config/env';
import { paginate, toSkipTake } from '../../services/pagination.js';
import type { PaginationQuery } from '@invoicetap/shared';

export async function getPlatformStats() {
  const [userCount, workspaceCount, invoiceCount, activeSubscriptions, demoWorkspaces] =
    await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.invoice.count(),
      prisma.subscription.groupBy({ by: ['planCode'], where: { status: 'ACTIVE' }, _count: true }),
      prisma.workspace.count({ where: { isDemo: true } }),
    ]);
  return {
    userCount,
    workspaceCount,
    invoiceCount,
    demoWorkspaces,
    planDistribution: activeSubscriptions.map((s) => ({ planCode: s.planCode, count: s._count })),
  };
}

export async function listUsers(query: PaginationQuery) {
  const where = query.search
    ? {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { name: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }
    : {};
  const [items, totalItems] = await Promise.all([
    prisma.user.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        isPlatformAdmin: true,
        createdAt: true,
        deletedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function listWorkspacesAdmin(query: PaginationQuery) {
  const where = query.search
    ? { name: { contains: query.search, mode: 'insensitive' as const } }
    : {};
  const [items, totalItems] = await Promise.all([
    prisma.workspace.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { createdAt: 'desc' },
      include: { subscription: true, owner: { select: { email: true, name: true } } },
    }),
    prisma.workspace.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function overrideSubscription(workspaceId: string, planCode: string, status: string) {
  return prisma.subscription.update({
    where: { workspaceId },
    data: { planCode, status: status as never },
  });
}

export async function listWebhookEvents(
  query: PaginationQuery & { status?: string; provider?: string },
) {
  const where = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.provider ? { provider: query.provider as never } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.webhookEvent.findMany({ where, ...toSkipTake(query), orderBy: { createdAt: 'desc' } }),
    prisma.webhookEvent.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function listFailedRecurringInvoices() {
  return prisma.recurringInvoice.findMany({
    where: { lastRunError: { not: null } },
    include: { customer: true, workspace: true },
  });
}

export async function listSupportTicketsAdmin(query: PaginationQuery & { status?: string }) {
  const where = query.status ? { status: query.status as never } : {};
  const [items, totalItems] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
        workspace: { select: { name: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function listContactSubmissions(query: PaginationQuery) {
  const [items, totalItems] = await Promise.all([
    prisma.contactSubmission.findMany({ ...toSkipTake(query), orderBy: { createdAt: 'desc' } }),
    prisma.contactSubmission.count(),
  ]);
  return paginate(items, totalItems, query);
}

export async function listAuditLogs(query: PaginationQuery & { workspaceId?: string }) {
  const where = query.workspaceId ? { workspaceId: query.workspaceId } : {};
  const [items, totalItems] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function listEmailLogs(query: PaginationQuery) {
  const [items, totalItems] = await Promise.all([
    prisma.messageDelivery.findMany({ ...toSkipTake(query), orderBy: { createdAt: 'desc' } }),
    prisma.messageDelivery.count(),
  ]);
  return paginate(items, totalItems, query);
}

export async function listFeatureFlags() {
  return prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
}

export async function upsertFeatureFlag(
  key: string,
  enabled: boolean,
  description?: string,
  rolloutPercentage?: number,
) {
  return prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled, description, rolloutPercentage },
    update: { enabled, description, rolloutPercentage },
  });
}

export async function getSystemHealth() {
  const env = parseApiEnv();
  let dbHealthy = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbHealthy = false;
  }
  const [fileAssetCount, fileAssetBytes] = await Promise.all([
    prisma.fileAsset.count(),
    prisma.fileAsset.aggregate({ _sum: { sizeBytes: true } }),
  ]);
  return {
    database: dbHealthy ? 'healthy' : 'unhealthy',
    storageProvider: env.STORAGE_PROVIDER,
    emailProvider: env.EMAIL_PROVIDER,
    whatsappProvider: env.WHATSAPP_PROVIDER,
    storage: { fileCount: fileAssetCount, totalBytes: fileAssetBytes._sum.sizeBytes ?? 0 },
  };
}
