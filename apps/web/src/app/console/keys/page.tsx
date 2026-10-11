'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import {
  Badge, Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, ErrorState, FormField, Input, PageHeader, Skeleton, toast,
} from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface Key { id: string; name: string; environment: 'sandbox' | 'live'; display: string; scopes: string[]; rateLimitPerMinute: number; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }

const SCOPES: [string, string][] = [
  ['invoices:create', 'Create invoices and receipts'],
  ['invoices:read', 'Read invoices'],
  ['otp:create', 'Send WhatsApp codes'],
  ['otp:verify', 'Verify codes'],
  ['notifications:send', 'Send notifications'],
  ['deliveries:read', 'Read deliveries'],
  ['telegram:link', 'Create Telegram links'],
];

export default function KeysPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['keys'], queryFn: () => apiBrowserFetch<{ data: Key[] }>('/keys') });
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [environment, setEnvironment] = React.useState<'sandbox' | 'live'>('sandbox');
  const [scopes, setScopes] = React.useState<string[]>(SCOPES.map(([s]) => s));
  const [secret, setSecret] = React.useState<{ value: string; name: string } | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: 'rotate' | 'revoke'; key: Key } | null>(null);

  const done = () => void qc.invalidateQueries({ queryKey: ['keys'] });
  const fail = (err: unknown) => toast.error('That did not work', err instanceof ApiClientError ? err.message : 'Please try again.');

  const create = useMutation({
    mutationFn: () => apiBrowserFetch<{ data: { secret: string; name: string } }>('/keys', { method: 'POST', body: JSON.stringify({ name, environment, scopes }) }),
    onSuccess: (r) => { setCreating(false); setName(''); setSecret({ value: r.data.secret, name: r.data.name }); done(); },
    onError: fail,
  });
  const rotate = useMutation({
    mutationFn: (id: string) => apiBrowserFetch<{ data: { secret: string; name: string } }>(`/keys/${id}/rotate`, { method: 'POST' }),
    onSuccess: (r) => { setConfirm(null); setSecret({ value: r.data.secret, name: r.data.name }); done(); },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiBrowserFetch(`/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setConfirm(null); toast.success('Key revoked'); done(); },
    onError: fail,
  });

  const toggle = (s: string) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        description="Keys are server-side secrets. The full key is shown once, when you create or rotate it."
        actions={<Button onClick={() => setCreating(true)}>Create key</Button>}
      />

      {isLoading ? <Skeleton className="h-40 w-full" /> : isError || !data ? (
        <ErrorState title="Could not load keys" onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState icon={<KeyRound className="size-5" />} title="No keys yet" description="Create a sandbox key to send your first request." action={{ label: 'Create sandbox key', onClick: () => setCreating(true) }} />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Key</th><th className="px-3 py-2">Scopes</th><th className="px-3 py-2">Last used</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {data.data.map((k) => (
                <tr key={k.id} className="border-border border-t align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{k.name}</p>
                    <Badge variant={k.environment === 'live' ? 'primary' : 'outline'}>{k.environment}</Badge>{' '}
                    {k.revokedAt && <Badge variant="destructive">revoked</Badge>}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{k.display}</td>
                  <td className="text-muted-foreground max-w-xs px-3 py-3 text-xs">{k.scopes.join(', ') || 'none (cannot call the API)'}</td>
                  <td className="text-muted-foreground px-3 py-3 text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'never'}</td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-3 text-right">
                    {!k.revokedAt && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: 'rotate', key: k })}>Rotate</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: 'revoke', key: k })}>Revoke</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
            <DialogDescription>Give it only the scopes your integration needs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Name" htmlFor="key-name" required><Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout backend" /></FormField>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Environment</legend>
              <div className="flex gap-4 text-sm">
                {(['sandbox', 'live'] as const).map((e) => (
                  <label key={e} className="flex items-center gap-2 capitalize"><input type="radio" name="env" checked={environment === e} onChange={() => setEnvironment(e)} /> {e}</label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Scopes</legend>
              <div className="grid gap-1.5 text-sm">
                {SCOPES.map(([s, label]) => (
                  <label key={s} className="flex items-center gap-2"><input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} /> <span className="font-mono text-xs">{s}</span> <span className="text-muted-foreground">{label}</span></label>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button disabled={!name.trim() || scopes.length === 0 || create.isPending} onClick={() => create.mutate()}>Create key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>This is the only time the full key for “{secret?.name}” is shown. Store it in your server&apos;s environment variables, not in browser code.</DialogDescription>
          </DialogHeader>
          <code className="bg-muted block break-all rounded-md p-3 font-mono text-xs" data-testid="new-key-secret">{secret?.value}</code>
          <DialogFooter>
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(secret?.value ?? ''); toast.success('Copied'); }}>Copy</Button>
            <Button onClick={() => setSecret(null)}>I have saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'rotate' ? 'Rotate this key?' : 'Revoke this key?'}
        description={confirm?.kind === 'rotate' ? 'A new key is created with the same scopes and the old one stops working immediately. Update your server before you rotate.' : 'Requests using this key will be rejected immediately, and queued messages it created will not be sent.'}
        confirmLabel={confirm?.kind === 'rotate' ? 'Rotate' : 'Revoke'}
        variant="destructive"
        isLoading={rotate.isPending || revoke.isPending}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'rotate') rotate.mutate(confirm.key.id);
          else revoke.mutate(confirm.key.id);
        }}
      />
    </div>
  );
}
