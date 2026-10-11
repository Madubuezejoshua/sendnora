'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, PageHeader, Skeleton, toast } from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';

interface RecurringInvoice {
  id: string;
  frequency: string;
  status: string;
  nextRunAt: string;
  currency: string;
  generatedCount: number;
  customer: { name: string };
}

export default function RecurringInvoicesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['recurring-invoices'],
    queryFn: () => apiBrowserFetch<{ items: RecurringInvoice[] }>('/recurring-invoices'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' }) =>
      apiBrowserFetch(`/recurring-invoices/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      toast.success('Updated');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring invoices"
        description="Invoices generate automatically on the schedule you set"
      />

      {isLoading && <Skeleton className="h-40 w-full" />}

      {!isLoading && (!data?.items || data.items.length === 0) && (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          No recurring invoices yet. Create an invoice, then set it to recur — recurring setup is
          managed from the invoice creation flow.
        </Card>
      )}

      <div className="space-y-3">
        {data?.items.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{r.customer.name}</p>
              <p className="text-muted-foreground text-sm">
                {r.frequency} · Next run {new Date(r.nextRunAt).toLocaleDateString()} ·{' '}
                {r.generatedCount} generated
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toggle.mutate({ id: r.id, action: r.status === 'ACTIVE' ? 'pause' : 'resume' })
                }
              >
                {r.status === 'ACTIVE' ? 'Pause' : 'Resume'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
