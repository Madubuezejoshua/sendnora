'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProductInput } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface Product {
  id: string;
  kind: 'PRODUCT' | 'SERVICE';
  name: string;
  description: string | null;
  sku: string | null;
  unit: string;
  unitPriceMinorUnits: number;
  currency: string;
  status: 'ACTIVE' | 'ARCHIVED';
  taxRate: { id: string; name: string; ratePercent: string } | null;
  category: { id: string; name: string } | null;
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function useProducts(params: { page?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.search) query.set('search', params.search);

  return useQuery({
    queryKey: ['products', params],
    queryFn: () => apiBrowserFetch<PaginatedResult<Product>>(`/products?${query.toString()}`),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      apiBrowserFetch<{ data: Product }>('/products', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export interface TaxRate {
  id: string;
  name: string;
  ratePercent: string;
  isDefault: boolean;
}

export function useTaxRates() {
  return useQuery({
    queryKey: ['tax-rates'],
    queryFn: () => apiBrowserFetch<{ data: TaxRate[] }>('/tax-rates').then((r) => r.data),
  });
}
