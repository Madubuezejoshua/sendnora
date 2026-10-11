'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrency } from '@sendnaro/shared';
import { Badge, Button, ConfirmDialog, ErrorState, FormField, Input, Skeleton, toast } from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface BillingAdmin {
  settings: { billingRequired: boolean; activationPriceMinor: number | null; activationCurrency: string };
  readiness: { gateway: string; configured: boolean; mode: 'live' | 'test'; ready: boolean; problems: string[] };
  revenue: { currency: string; collectedMinor: number; payments: number }[];
  payments: { id: string; business: string; reference: string; amountMinor: number; currency: string; status: string; livemode: boolean; refundedMinor: number; createdAt: string }[];
  entitlements: { workspaceId: string; business: string; source: string; grantedAt: string; revokedAt: string | null; revokedReason: string | null; note: string | null }[];
}
interface Business { id: string; name: string; suspendedAt: string | null; entitlement: { source: string; revokedAt: string | null } | null }
interface AuditRow { id: string; action: string; createdAt: string; metadata: unknown }

const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 10 ** getCurrency(currency).minorUnitDigits);
  } catch {
    return `${currency} ${minor}`;
  }
};

export default function AdminBillingPage() {
  const qc = useQueryClient();
  const billing = useQuery({ queryKey: ['admin-billing'], queryFn: () => apiBrowserFetch<{ data: BillingAdmin }>('/admin/billing') });
  const businesses = useQuery({ queryKey: ['admin-businesses'], queryFn: () => apiBrowserFetch<{ data: Business[] }>('/admin/businesses') });
  const audit = useQuery({ queryKey: ['admin-audit'], queryFn: () => apiBrowserFetch<{ data: AuditRow[] }>('/admin/audit') });

  const [price, setPrice] = React.useState('');
  const [currency, setCurrency] = React.useState('NGN');
  const [confirmEnable, setConfirmEnable] = React.useState(false);
  const [note, setNote] = React.useState<{ id: string; text: string } | null>(null);

  React.useEffect(() => {
    const s = billing.data?.data.settings;
    if (s) {
      setPrice(s.activationPriceMinor ? String(s.activationPriceMinor / 10 ** getCurrency(s.activationCurrency).minorUnitDigits) : '');
      setCurrency(s.activationCurrency);
    }
  }, [billing.data]);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['admin-billing'] });
    void qc.invalidateQueries({ queryKey: ['admin-businesses'] });
    void qc.invalidateQueries({ queryKey: ['admin-audit'] });
  };
  const fail = (err: unknown) => toast.error('Could not save', err instanceof ApiClientError ? err.message : 'Please try again.');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiBrowserFetch('/admin/billing', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { toast.success('Saved'); refreshAll(); },
    onError: fail,
  });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) => apiBrowserFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    onSuccess: () => { toast.success('Done'); refreshAll(); },
    onError: fail,
  });

  if (billing.isLoading) return <Skeleton className="h-64 w-full" />;
  if (billing.isError || !billing.data) return <ErrorState title="Could not load billing" onRetry={() => billing.refetch()} />;
  const { settings, readiness, revenue, payments, entitlements } = billing.data.data;
  const minorFromInput = () => Math.round(Number(price) * 10 ** getCurrency(currency).minorUnitDigits);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Billing and access</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One-time activation payments. Billing is{' '}
          <Badge variant={settings.billingRequired ? 'warning' : 'success'}>{settings.billingRequired ? 'required for live sending' : 'off (free live access)'}</Badge>.
          Sandbox is always free.
        </p>
      </header>

      <section className="border-border space-y-4 rounded-lg border p-5" aria-labelledby="price">
        <h2 id="price" className="font-semibold">Activation price</h2>
        <div className="grid max-w-md gap-4 sm:grid-cols-[1fr_6rem]">
          <FormField label="Amount" htmlFor="price-input" hint="Charged once per business">
            <Input id="price-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </FormField>
          <FormField label="Currency" htmlFor="currency-input">
            <Input id="currency-input" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </FormField>
        </div>
        <Button variant="outline" disabled={!price || patch.isPending} onClick={() => patch.mutate({ activationPriceMinor: minorFromInput(), activationCurrency: currency })}>
          Save price
        </Button>
      </section>

      <section className="border-border space-y-3 rounded-lg border p-5" aria-labelledby="gateway">
        <h2 id="gateway" className="font-semibold">Payment gateway readiness</h2>
        <p className="text-sm">
          {readiness.gateway}: <Badge variant={readiness.configured ? 'success' : 'destructive'}>{readiness.configured ? 'configured' : 'not configured'}</Badge>{' '}
          <Badge variant={readiness.mode === 'live' ? 'primary' : 'warning'}>{readiness.mode} mode</Badge>
        </p>
        {readiness.problems.length > 0 && (
          <ul className="text-destructive list-disc pl-5 text-sm">{readiness.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {readiness.mode === 'test' && <p className="text-muted-foreground text-sm">Test-mode payments never unlock production and are not counted as revenue.</p>}
        <div className="flex gap-2 pt-2">
          {settings.billingRequired ? (
            <Button variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ billingRequired: false })}>Turn billing off</Button>
          ) : (
            <Button disabled={patch.isPending} onClick={() => setConfirmEnable(true)}>Require activation payments…</Button>
          )}
        </div>
      </section>

      <section aria-labelledby="revenue">
        <h2 id="revenue" className="font-semibold">Collected activation revenue</h2>
        <p className="text-muted-foreground mt-1 text-sm">Verified live-mode payments, net of refunds, per currency. Never summed across currencies.</p>
        {revenue.length === 0 ? <p className="text-muted-foreground mt-3 text-sm">Nothing collected yet.</p> : (
          <ul className="mt-3 space-y-1 text-sm">{revenue.map((r) => <li key={r.currency}><strong>{money(r.collectedMinor, r.currency)}</strong> from {r.payments} payment{r.payments === 1 ? '' : 's'}</li>)}</ul>
        )}
      </section>

      <section aria-labelledby="payments">
        <h2 id="payments" className="font-semibold">Payments</h2>
        <div className="border-border mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase"><tr><th className="px-3 py-2">Business</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Date</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-border border-t">
                  <td className="px-3 py-2">{p.business}</td>
                  <td className="px-3 py-2">{money(p.amountMinor, p.currency)}{p.refundedMinor ? ` (refunded ${money(p.refundedMinor, p.currency)})` : ''}</td>
                  <td className="px-3 py-2"><Badge variant={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'default' : 'destructive'}>{p.status.toLowerCase()}</Badge></td>
                  <td className="px-3 py-2">{p.livemode ? 'live' : 'test'}</td>
                  <td className="px-3 py-2">{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">No activation payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="businesses">
        <h2 id="businesses" className="font-semibold">Businesses</h2>
        <div className="border-border mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase"><tr><th className="px-3 py-2">Business</th><th className="px-3 py-2">Access</th><th className="px-3 py-2">Actions</th></tr></thead>
            <tbody>
              {(businesses.data?.data ?? []).map((b) => {
                const active = b.entitlement && !b.entitlement.revokedAt;
                return (
                  <tr key={b.id} className="border-border border-t">
                    <td className="px-3 py-2">{b.name} {b.suspendedAt && <Badge variant="destructive">suspended</Badge>}</td>
                    <td className="px-3 py-2">{active ? <Badge variant="success">{b.entitlement!.source.toLowerCase()}</Badge> : <span className="text-muted-foreground">not activated</span>}</td>
                    <td className="space-x-2 px-3 py-2">
                      {b.suspendedAt
                        ? <Button size="sm" variant="outline" onClick={() => act.mutate({ path: `/admin/businesses/${b.id}/unsuspend` })}>Unsuspend</Button>
                        : <Button size="sm" variant="outline" onClick={() => act.mutate({ path: `/admin/businesses/${b.id}/suspend`, body: { reason: 'Suspended by platform admin' } })}>Suspend</Button>}
                      {!active && <Button size="sm" variant="outline" onClick={() => setNote({ id: b.id, text: '' })}>Grant complimentary…</Button>}
                      {active && <Button size="sm" variant="outline" onClick={() => act.mutate({ path: `/admin/entitlements/${b.id}/revoke`, body: { reason: 'revoked_by_admin' } })}>Revoke</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {note && (
          <div className="border-border mt-3 flex max-w-xl items-end gap-3 rounded-lg border p-4">
            <FormField label="Note (required, recorded in the audit history)" htmlFor="comp-note" className="flex-1">
              <Input id="comp-note" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
            </FormField>
            <Button disabled={!note.text.trim()} onClick={() => { act.mutate({ path: `/admin/entitlements/${note.id}/complimentary`, body: { note: note.text } }); setNote(null); }}>Grant</Button>
            <Button variant="ghost" onClick={() => setNote(null)}>Cancel</Button>
          </div>
        )}
        {entitlements.some((e) => e.revokedAt) && <p className="text-muted-foreground mt-2 text-xs">Revoked entitlements stay in the history below.</p>}
      </section>

      <section aria-labelledby="audit">
        <h2 id="audit" className="font-semibold">Audit history</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(audit.data?.data ?? []).slice(0, 20).map((a) => (
            <li key={a.id} className="flex justify-between gap-4"><span>{a.action}</span><span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span></li>
          ))}
          {(audit.data?.data ?? []).length === 0 && <li className="text-muted-foreground">No billing or access changes recorded yet.</li>}
        </ul>
      </section>

      <ConfirmDialog
        open={confirmEnable}
        onOpenChange={setConfirmEnable}
        title="Require activation payments?"
        description="Every business without a verified one-time activation will be blocked from live sending, including messages already queued. The sandbox stays free. You can turn this off again at any time."
        confirmLabel="Require activation"
        variant="destructive"
        isLoading={patch.isPending}
        onConfirm={async () => {
          await patch.mutateAsync({ billingRequired: true, confirm: true, ...(price ? { activationPriceMinor: minorFromInput(), activationCurrency: currency } : {}) });
          setConfirmEnable(false);
        }}
      />
    </div>
  );
}
