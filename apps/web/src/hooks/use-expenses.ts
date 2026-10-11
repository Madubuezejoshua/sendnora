'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateExpenseInput } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface Expense {
  id: string;
  vendor: string;
  category: string;
  amountMinorUnits: number;
  currency: string;
  incurredAt: string;
  paymentMethod: string | null;
  description: string | null;
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function useExpenses(params: { page?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.search) query.set('search', params.search);
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: () => apiBrowserFetch<PaginatedResult<Expense>>(`/expenses?${query.toString()}`),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) =>
      apiBrowserFetch<{ data: Expense }>('/expenses', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
