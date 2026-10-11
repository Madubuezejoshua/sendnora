'use client';

import * as React from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Skeleton } from '@sendnaro/ui';
import { apiBrowserFetch } from '@/lib/api-browser';
import { STATUS_VARIANT, type DeliveryRow } from '@/lib/console-types';

const STATUSES = ['', 'queued', 'processing', 'provider_accepted', 'sent', 'delivered', 'read', 'retrying', 'failed', 'expired', 'blocked', 'sandbox_simulated'];

export default function DeliveriesPage() {
  const [environment, setEnvironment] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [channel, setChannel] = React.useState('');
  const [q, setQ] = React.useState('');
  const [applied, setApplied] = React.useState('');

  const query = useInfiniteQuery({
    queryKey: ['deliveries', environment, status, channel, applied],
    initialPageParam: '' as string,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams();
      if (environment) p.set('environment', environment);
      if (status) p.set('status', status);
      if (channel) p.set('channel', channel);
      if (applied) p.set('q', applied);
      if (pageParam) p.set('cursor', pageParam);
      return apiBrowserFetch<{ data: DeliveryRow[]; nextCursor: string | null }>(`/deliveries?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const select = 'border-input bg-background h-10 rounded-md border px-3 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader title="Deliveries" description="Every request and each channel's delivery. Sensitive content is never shown." />

      <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Environment</span>
          <select className={select} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
            <option value="">All</option><option value="sandbox">Sandbox</option><option value="live">Live</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Channel</span>
          <select className={select} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order id, invoice number or delivery id" />
        </label>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {query.isLoading ? <Skeleton className="h-48 w-full" /> : query.isError ? (
        <ErrorState title="Could not load deliveries" onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Inbox className="size-5" />} title="No deliveries yet" description="Send a request from the sandbox playground or your backend and it will appear here." action={{ label: 'Open the playground', onClick: () => { window.location.href = '/console'; } }} />
      ) : (
        <>
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"><span className="sr-only">Details</span></th></tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-border border-t align-top">
                    <td className="text-muted-foreground whitespace-nowrap px-3 py-2.5 text-xs">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5">
                      <span className="capitalize">{d.kind}</span>
                      {(d.invoiceNumber || d.externalOrderId) && <span className="text-muted-foreground block text-xs">{d.invoiceNumber} {d.externalOrderId}</span>}
                    </td>
                    <td className="px-3 py-2.5 capitalize">{d.channel} <Badge variant="outline">{d.environment}</Badge></td>
                    <td className="px-3 py-2.5 font-mono text-xs">{d.to}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={STATUS_VARIANT[d.status] ?? 'default'}>{d.status.replace(/_/g, ' ')}</Badge>
                      {d.error && <span className="text-muted-foreground mt-1 block text-xs">{d.error.code}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right"><Link href={`/console/deliveries/${d.id}`} className="text-primary text-xs underline underline-offset-2">Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.hasNextPage && <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>Load more</Button>}
        </>
      )}
    </div>
  );
}
