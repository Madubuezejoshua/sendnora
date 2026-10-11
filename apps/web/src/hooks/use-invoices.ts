'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateInvoiceInput, RecordPaymentInput } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPriceMinorUnits: number;
  taxRatePercent: string;
  taxAmountMinorUnits: number;
  lineTotalMinorUnits: number;
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  subtotalMinorUnits: number;
  totalDiscountMinorUnits: number;
  totalTaxMinorUnits: number;
  shippingMinorUnits: number;
  grandTotalMinorUnits: number;
  amountPaidMinorUnits: number;
  notes: string | null;
  terms: string | null;
  paymentInstructions: string | null;
  publicToken: string;
  customer: { id: string; name: string; email: string | null; whatsappPhone: string | null };
  items: InvoiceLineItem[];
  receipts?: { id: string; number: string }[];
}

interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function useInvoices(params: { page?: number; search?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => apiBrowserFetch<PaginatedResult<Invoice>>(`/invoices?${query.toString()}`),
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: () => apiBrowserFetch<{ data: Invoice }>(`/invoices/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) =>
      apiBrowserFetch<{ data: Invoice }>('/invoices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useIssueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiBrowserFetch<{ data: Invoice }>(`/invoices/${id}/issue`, { method: 'POST' }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useRecordPayment(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      apiBrowserFetch(`/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useVoidInvoice(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiBrowserFetch(`/invoices/${invoiceId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
