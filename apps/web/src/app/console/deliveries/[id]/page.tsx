'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, ErrorState, PageHeader, Skeleton, toast } from '@sendnaro/ui';
import { apiBrowserFetch } from '@/lib/api-browser';
import { STATUS_VARIANT, type DeliveryRow } from '@/lib/console-types';

interface Detail extends DeliveryRow {
  invoiceId: string | null;
  attemptLog: { attempt: number; outcome: string; errorCode: string | null; message: string | null; at: string }[];
  nextAttemptAt: string | null;
}

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['delivery', id], queryFn: () => apiBrowserFetch<{ data: Detail }>(`/deliveries/${id}`) });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return <ErrorState title="Delivery not found" onRetry={() => refetch()} />;
  const d = data.data;

  const openPdf = async () => {
    if (!d.invoiceId) return;
    try {
      const r = await apiBrowserFetch<{ data: { url: string } }>(`/documents/${d.invoiceId}/pdf-link`);
      window.open(r.data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('The document is not available yet');
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-3"><Link href="/console/deliveries">&larr; Deliveries</Link></Button>
      <PageHeader title={`${d.kind} delivery`} description={d.id} />

      <dl className="border-border grid gap-4 rounded-lg border p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><Badge variant={STATUS_VARIANT[d.status] ?? 'default'}>{d.status.replace(/_/g, ' ')}</Badge> {d.simulated && <Badge variant="outline">simulated</Badge>}</dd></div>
        <div><dt className="text-muted-foreground">Channel</dt><dd className="mt-1 capitalize">{d.channel} ({d.environment})</dd></div>
        <div><dt className="text-muted-foreground">Recipient</dt><dd className="mt-1 font-mono text-xs">{d.to}</dd></div>
        <div><dt className="text-muted-foreground">Template</dt><dd className="mt-1">{d.template}</dd></div>
        <div><dt className="text-muted-foreground">Created</dt><dd className="mt-1">{new Date(d.createdAt).toLocaleString()}</dd></div>
        <div><dt className="text-muted-foreground">Delivered</dt><dd className="mt-1">{d.deliveredAt ? new Date(d.deliveredAt).toLocaleString() : 'not confirmed'}</dd></div>
        {d.error && <div className="sm:col-span-2"><dt className="text-muted-foreground">Error</dt><dd className="mt-1"><code>{d.error.code}</code> {d.error.message}</dd></div>}
        {d.nextAttemptAt && <div className="sm:col-span-2"><dt className="text-muted-foreground">Next attempt</dt><dd className="mt-1">{new Date(d.nextAttemptAt).toLocaleString()}</dd></div>}
      </dl>

      {d.invoiceId && <Button variant="outline" onClick={openPdf}>Open document (PDF)</Button>}

      <section aria-labelledby="attempts">
        <h2 id="attempts" className="font-semibold">Attempts</h2>
        {d.attemptLog.length === 0 ? <p className="text-muted-foreground mt-2 text-sm">No attempts yet.</p> : (
          <ol className="mt-3 space-y-2 text-sm">
            {d.attemptLog.map((a) => (
              <li key={a.attempt} className="border-border rounded-md border p-3">
                <span className="font-medium">#{a.attempt}</span> {a.outcome.replace(/_/g, ' ')} <span className="text-muted-foreground">at {new Date(a.at).toLocaleString()}</span>
                {a.errorCode && <span className="text-muted-foreground block text-xs">{a.errorCode}{a.message ? `: ${a.message}` : ''}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
