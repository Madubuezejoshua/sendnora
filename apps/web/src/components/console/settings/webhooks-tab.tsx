'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Webhook } from 'lucide-react';
import { Badge, Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, FormField, Input, Skeleton, toast } from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface Endpoint {
  id: string; environment: string; url: string; events: string[]; active: boolean; lastSuccessAt: string | null;
  recent: { event: string; status: string; attempts: number; lastStatus: number | null; lastError: string | null; at: string }[];
}

const EVENTS = ['invoice.generated', 'invoice.failed', 'delivery.sent', 'delivery.delivered', 'delivery.failed', 'otp.verified'];

export function WebhooksTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['webhooks'], queryFn: () => apiBrowserFetch<{ data: Endpoint[] }>('/webhooks') });
  const [adding, setAdding] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [environment, setEnvironment] = React.useState<'sandbox' | 'live'>('sandbox');
  const [events, setEvents] = React.useState<string[]>(EVENTS);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [remove, setRemove] = React.useState<Endpoint | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['webhooks'] });
  const fail = (e: unknown) => toast.error('That did not work', e instanceof ApiClientError ? e.message : 'Please try again.');
  const create = useMutation({
    mutationFn: () => apiBrowserFetch<{ data: { secret: string } }>('/webhooks', { method: 'POST', body: JSON.stringify({ environment, url, events }) }),
    onSuccess: (r) => { setAdding(false); setUrl(''); setSecret(r.data.secret); refresh(); },
    onError: fail,
  });
  const test = useMutation({
    mutationFn: (id: string) => apiBrowserFetch(`/webhooks/${id}/test`, { method: 'POST' }),
    onSuccess: () => toast.success('Test event queued', 'It is delivered by the worker; check the attempts below shortly.'),
    onError: fail,
  });
  const del = useMutation({
    mutationFn: (id: string) => apiBrowserFetch(`/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setRemove(null); refresh(); },
    onError: fail,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-muted-foreground max-w-xl text-sm">
          Sendnaro posts signed events to your server. Verify the <code>Sendnaro-Signature</code> header against the raw body, and de-duplicate on the
          event id. A failing endpoint is retried and never causes a customer message to be re-sent.
        </p>
        <Button onClick={() => setAdding(true)}>Add endpoint</Button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : isError || !data ? <ErrorState title="Could not load webhooks" onRetry={() => refetch()} /> : data.data.length === 0 ? (
        <EmptyState icon={<Webhook className="size-5" />} title="No endpoints yet" description="Add an https endpoint to receive delivery events." />
      ) : data.data.map((e) => (
        <Card key={e.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{e.url}</p>
                <p className="text-muted-foreground text-xs"><Badge variant="outline">{e.environment}</Badge> {e.events.includes('*') ? 'all events' : e.events.join(', ')} {e.lastSuccessAt && `· last success ${new Date(e.lastSuccessAt).toLocaleString()}`}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => test.mutate(e.id)}>Send test event</Button>
                <Button size="sm" variant="outline" onClick={() => setRemove(e)}>Delete</Button>
              </div>
            </div>
            {e.recent.length > 0 && (
              <ul className="space-y-1 text-xs">
                {e.recent.map((r, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3">
                    <Badge variant={r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'destructive' : 'warning'}>{r.status}</Badge>
                    <span>{r.event}</span><span className="text-muted-foreground">{r.attempts} attempt{r.attempts === 1 ? '' : 's'}{r.lastStatus ? ` · HTTP ${r.lastStatus}` : ''}{r.lastError ? ` · ${r.lastError}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a webhook endpoint</DialogTitle><DialogDescription>Live endpoints must use https and a public address.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <FormField label="Endpoint URL" htmlFor="wh-url" required><Input id="wh-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/sendnaro" /></FormField>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Environment</legend>
              <div className="flex gap-4 text-sm">{(['sandbox', 'live'] as const).map((e) => <label key={e} className="flex items-center gap-2 capitalize"><input type="radio" name="wh-env" checked={environment === e} onChange={() => setEnvironment(e)} /> {e}</label>)}</div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Events</legend>
              <div className="grid gap-1 text-sm">{EVENTS.map((ev) => <label key={ev} className="flex items-center gap-2 font-mono text-xs"><input type="checkbox" checked={events.includes(ev)} onChange={() => setEvents((c) => (c.includes(ev) ? c.filter((x) => x !== ev) : [...c, ev]))} /> {ev}</label>)}</div>
            </fieldset>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={!url || events.length === 0 || create.isPending} onClick={() => create.mutate()}>Add endpoint</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Signing secret</DialogTitle><DialogDescription>Shown once. Use it to verify the Sendnaro-Signature header.</DialogDescription></DialogHeader>
          <code className="bg-muted block break-all rounded-md p-3 font-mono text-xs">{secret}</code>
          <DialogFooter><Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(secret ?? ''); toast.success('Copied'); }}>Copy</Button><Button onClick={() => setSecret(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={Boolean(remove)} onOpenChange={(o) => !o && setRemove(null)} title="Delete this endpoint?" description="Events will no longer be sent to it." confirmLabel="Delete" variant="destructive" isLoading={del.isPending} onConfirm={() => { if (remove) del.mutate(remove.id); }} />
    </div>
  );
}
