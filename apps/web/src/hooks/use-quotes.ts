'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateQuoteInput } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface Quote {
  id: string;
  number: string;
  status: string;
  currency: string;
  issueDate: string;
  expiryDate: string | null;
  subtotalMinorUnits: number;
  totalTaxMinorUnits: number;
  grandTotalMinorUnits: number;
  publicToken: string;
  customer: { id: string; name: string; email: string | null; whatsappPhone?: string | null };
  items: { id: string; description: string; quantity: string; lineTotalMinorUnits: number }[];
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function useQuotes(params: { page?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.search) query.set('search', params.search);

  return useQuery({
    queryKey: ['quotes', params],
    queryFn: () => apiBrowserFetch<PaginatedResult<Quote>>(`/quotes?${query.toString()}`),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['quotes', id],
    queryFn: () => apiBrowserFetch<{ data: Quote }>(`/quotes/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) =>
      apiBrowserFetch<{ data: Quote }>('/quotes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

export function useSendQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiBrowserFetch(`/quotes/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ channel: 'BOTH' }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useConvertQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dueDate: Date) =>
      apiBrowserFetch<{ data: { id: string } }>(`/quotes/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ dueDate }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
