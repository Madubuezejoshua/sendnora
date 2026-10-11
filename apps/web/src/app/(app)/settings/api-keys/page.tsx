'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  PageHeader,
  Skeleton,
  toast,
} from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';

interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { name: string | null; email: string };
}

export default function ApiKeysSettingsPage() {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKeySummary | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiBrowserFetch<{ data: ApiKeySummary[] }>('/api-keys').then((r) => r.data),
  });

  const { register, handleSubmit, reset } = useForm<{ name: string }>();

  const create = useMutation({
    mutationFn: (values: { name: string }) =>
      apiBrowserFetch<{ data: { key: string } }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify(values),
      }).then((r) => r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      reset({ name: '' });
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: () => toast.error('Could not create API key'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiBrowserFetch(`/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('API key revoked');
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: () => toast.error('Could not revoke API key'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="API keys"
        description="Keys for accessing InvoiceTap programmatically. Treat them like passwords."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a key</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((v) => create.mutate(v))}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <FormField label="Name" htmlFor="name" required className="flex-1">
              <Input
                id="name"
                placeholder="e.g. Zapier integration"
                {...register('name', { required: true })}
              />
            </FormField>
            <Button type="submit" isLoading={create.isPending}>
              <KeyRound className="size-4" /> Generate key
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing keys</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-24 w-full" />}
          {keys?.length === 0 && <p className="text-muted-foreground text-sm">No API keys yet.</p>}
          <div className="divide-border divide-y">
            {keys?.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{k.name}</p>
                    {k.revokedAt && <Badge variant="destructive">Revoked</Badge>}
                  </div>
                  <p className="text-muted-foreground font-mono text-xs">{k.prefix}…</p>
                  <p className="text-muted-foreground text-xs">
                    Created {new Date(k.createdAt).toLocaleDateString()} by{' '}
                    {k.createdBy.name ?? k.createdBy.email}
                    {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!k.revokedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Revoke key"
                    onClick={() => setRevokeTarget(k)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={newKey !== null} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key now</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            This is the only time it will be shown. Store it somewhere safe.
          </p>
          <div className="bg-muted flex items-center justify-between gap-2 rounded-md p-3">
            <code className="overflow-x-auto text-xs">{newKey}</code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy key"
              onClick={() => {
                if (newKey) void navigator.clipboard.writeText(newKey);
                toast.success('Copied to clipboard');
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={`Revoke "${revokeTarget?.name}"?`}
        description="Any integration using this key will immediately stop working. This cannot be undone."
        confirmLabel="Revoke"
        variant="destructive"
        isLoading={revoke.isPending}
        onConfirm={() => {
          if (revokeTarget) revoke.mutate(revokeTarget.id);
        }}
      />
    </div>
  );
}
