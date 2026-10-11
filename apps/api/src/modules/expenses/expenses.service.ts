import { prisma } from '@sendnaro/database';
import { AppError, type CreateExpenseInput, type PaginationQuery } from '@sendnaro/shared';
import { paginate, toSkipTake } from '../../services/pagination.js';

export async function listExpenses(
  workspaceId: string,
  query: PaginationQuery & { category?: string },
) {
  const where = {
    workspaceId,
    deletedAt: null,
    ...(query.category ? { category: query.category } : {}),
    ...(query.search ? { vendor: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, totalItems] = await Promise.all([
    prisma.expense.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'incurredAt']: query.sortDirection },
    }),
    prisma.expense.count({ where }),
  ]);
  return paginate(items, totalItems, query);
}

export async function getExpense(workspaceId: string, expenseId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, workspaceId, deletedAt: null },
  });
  if (!expense) throw new AppError('NOT_FOUND', 'Expense not found');
  return expense;
}

export async function createExpense(
  workspaceId: string,
  createdById: string,
  input: CreateExpenseInput,
) {
  return prisma.expense.create({
    data: {
      workspaceId,
      vendor: input.vendor,
      category: input.category,
      amountMinorUnits: input.amountMinorUnits,
      currency: input.currency,
      taxAmountMinorUnits: input.taxAmountMinorUnits,
      incurredAt: input.incurredAt,
      paymentMethod: input.paymentMethod,
      description: input.description,
      isRecurring: input.isRecurring,
      createdById,
    },
  });
}

export async function updateExpense(
  workspaceId: string,
  expenseId: string,
  input: Partial<CreateExpenseInput>,
) {
  await getExpense(workspaceId, expenseId);
  return prisma.expense.update({ where: { id: expenseId }, data: input });
}

export async function deleteExpense(workspaceId: string, expenseId: string) {
  await getExpense(workspaceId, expenseId);
  return prisma.expense.update({ where: { id: expenseId }, data: { deletedAt: new Date() } });
}
