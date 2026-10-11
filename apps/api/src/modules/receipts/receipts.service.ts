import { prisma } from '@sendnaro/database';
import { AppError, type PaginationQuery } from '@sendnaro/shared';
import { paginate, toSkipTake } from '../../services/pagination.js';

export async function listReceipts(workspaceId: string, query: PaginationQuery) {
  const where = {
    workspaceId,
    ...(query.search ? { number: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.receipt.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortDirection },
      include: {
        invoice: { select: { id: true, number: true, customer: { select: { name: true } } } },
      },
    }),
    prisma.receipt.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function getReceipt(workspaceId: string, receiptId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, workspaceId },
    include: { items: true, invoice: true },
  });
  if (!receipt) throw new AppError('NOT_FOUND', 'Receipt not found');
  return receipt;
}

export async function getReceiptByPublicToken(publicToken: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { publicToken },
    include: {
      items: true,
      invoice: { include: { customer: true } },
      workspace: { include: { businessProfile: { include: { address: true } } } },
    },
  });
  if (!receipt) throw new AppError('NOT_FOUND', 'Receipt not found');
  return receipt;
}

export async function voidReceipt(workspaceId: string, receiptId: string, reason: string) {
  const receipt = await getReceipt(workspaceId, receiptId);
  if (receipt.status === 'VOID') throw new AppError('CONFLICT', 'Receipt is already void');
  return prisma.receipt.update({
    where: { id: receiptId },
    data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
  });
}
