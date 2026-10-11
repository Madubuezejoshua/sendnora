import type { PaginatedResult, PaginationQuery } from '@invoicetap/shared';

export function paginate<T>(
  items: T[],
  totalItems: number,
  query: PaginationQuery,
): PaginatedResult<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
  };
}

export function toSkipTake(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
