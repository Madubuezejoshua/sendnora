'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomerInput } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface Customer {
  id: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  name: string;
  email: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  currency: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function useCustomers(params: { page?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.search) query.set('search', params.search);

  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => apiBrowserFetch<PaginatedResult<Customer>>(`/customers?${query.toString()}`),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => apiBrowserFetch<{ data: Customer }>(`/customers/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      apiBrowserFetch<{ data: Customer }>('/customers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
