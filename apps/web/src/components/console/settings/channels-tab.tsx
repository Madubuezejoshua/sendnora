'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, ErrorState, FormField, Input, Skeleton, toast } from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface Channels {
  whatsapp: { id: string; environment: string; status: string; lastError: string | null; config: { phoneNumberId?: string; templates?: Record<string, { name: string; language: string }> }; callbackUrl: string }[];
  telegram: { sharedBot: boolean; configured: boolean; botUsername: string | null };
}

const TEMPLATE_KINDS = [
  ['otp', 'Authentication (verification code) template'],
  ['invoice', 'Invoice / receipt template (document header + one body variable)'],
  ['notification', 'Notification template (one body variable)'],
] as const;

export function ChannelsTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['channels'], queryFn: () => apiBrowserFetch<{ data: Channels }>('/channels') });
  const [f, setF] = React.useState({ phoneNumberId: '', wabaId: '', accessToken: '', appSecret: '', verifyToken: '', otp: '', invoice: '', notification: '', language: 'en' });
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);

  const connect = useMutation({
    mutationFn: () => {
      const tpl = (name: string) => (name.trim() ? { name: name.trim(), language: f.language } : undefined);
      return apiBrowserFetch<{ data: { status: string; error: string | null } }>('/channels/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({
          phoneNumberId: f.phoneNumberId.trim(), wabaId: f.wabaId.trim() || undefined, accessToken: f.accessToken.trim(), appSecret: f.appSecret.trim(), verifyToken: f.verifyToken.trim(),
          templates: { ...(tpl(f.otp) ? { otp: tpl(f.otp) } : {}), ...(tpl(f.invoice) ? { invoice: tpl(f.invoice) } : {}), ...(tpl(f.notification) ? { notification: tpl(f.notification) } : {}) },
        }),
      });
    },
    onSuccess: (r) => {
      setF((x) => ({ ...x, accessToken: '', appSecret: '' })); // never keep secrets in the page
      void qc.invalidateQueries({ queryKey: ['channels'] }); void qc.invalidateQueries({ queryKey: ['overview'] });
      if (r.data.status === 'CONNECTED') toast.success('WhatsApp connected');
      else toast.error('Saved, but Meta did not accept the credentials', r.data.error ?? 'Check the phone number id and access token.');
    },
    onError: (e) => toast.error('Could not save', e instanceof ApiClientError ? (e.fieldErrors ? Object.values(e.fieldErrors).flat().join(' ') : e.message) : 'Please try again.'),
  });
  const disconnect = useMutation({
    mutationFn: () => apiBrowserFetch('/channels/whatsapp', { method: 'DELETE' }),
    onSuccess: () => { setConfirmDisconnect(false); toast.success('Disconnected'); void qc.invalidateQueries({ queryKey: ['channels'] }); void qc.invalidateQueries({ queryKey: ['overview'] }); },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) return <ErrorState title="Could not load channels" onRetry={() => refetch()} />;
  const wa = data.data.whatsapp.find((c) => c.environment === 'live');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const statusVariant = wa?.status === 'CONNECTED' ? 'success' : wa?.status === 'ERROR' ? 'destructive' : 'default';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">WhatsApp sender (live) <Badge variant={statusVariant}>{(wa?.status ?? 'NOT_CONNECTED').toLowerCase().replace('_', ' ')}</Badge></CardTitle>
          <p className="text-muted-foreground text-sm">
            Messages go through your own WhatsApp Business Platform sender, so Meta bills your account directly. Business-initiated messages must use
            templates that Meta has approved. Sendnaro never uses personal WhatsApp sessions or QR logins.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {wa?.lastError && <p className="text-destructive text-sm">{wa.lastError}</p>}
          {wa && (
            <div className="bg-muted/50 rounded-md p-3 text-xs">
              <p className="font-medium">In your Meta app, set the webhook to:</p>
              <code className="break-all">{wa.callbackUrl}</code>
              <p className="text-muted-foreground mt-1">Use the verify token you enter below, and subscribe to the “messages” field.</p>
            </div>
          )}
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); connect.mutate(); }}>
            <FormField label="Phone number ID" htmlFor="wa-pn" required><Input id="wa-pn" inputMode="numeric" value={f.phoneNumberId} onChange={set('phoneNumberId')} /></FormField>
            <FormField label="WhatsApp Business Account ID" htmlFor="wa-waba"><Input id="wa-waba" inputMode="numeric" value={f.wabaId} onChange={set('wabaId')} /></FormField>
            <FormField label="Access token" htmlFor="wa-token" required hint="Stored encrypted; never shown again"><Input id="wa-token" type="password" autoComplete="off" value={f.accessToken} onChange={set('accessToken')} /></FormField>
            <FormField label="App secret" htmlFor="wa-secret" required hint="Used to verify Meta's callbacks"><Input id="wa-secret" type="password" autoComplete="off" value={f.appSecret} onChange={set('appSecret')} /></FormField>
            <FormField label="Webhook verify token" htmlFor="wa-verify" required hint="A random string you also enter in Meta (12+ characters)"><Input id="wa-verify" type="password" autoComplete="off" value={f.verifyToken} onChange={set('verifyToken')} /></FormField>
            <FormField label="Template language" htmlFor="wa-lang"><Input id="wa-lang" value={f.language} onChange={set('language')} /></FormField>
            {TEMPLATE_KINDS.map(([k, label]) => (
              <FormField key={k} label={`${label}: name`} htmlFor={`wa-${k}`} hint={wa?.config.templates?.[k] ? `Currently: ${wa.config.templates[k]!.name}` : 'Approved template name'}>
                <Input id={`wa-${k}`} value={f[k]} onChange={set(k)} />
              </FormField>
            ))}
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={connect.isPending || !f.phoneNumberId || !f.accessToken || !f.appSecret || f.verifyToken.length < 12}>{wa ? 'Update and verify' : 'Connect and verify'}</Button>
              {wa?.status === 'CONNECTED' && <Button type="button" variant="outline" onClick={() => setConfirmDisconnect(true)}>Disconnect</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">Telegram <Badge variant={data.data.telegram.configured ? 'success' : 'default'}>{data.data.telegram.configured ? 'available' : 'not configured'}</Badge></CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>Telegram delivery uses the shared Sendnaro bot{data.data.telegram.botUsername ? ` (@${data.data.telegram.botUsername})` : ''}. Customers appear as coming from that bot, so tell them to expect it.</p>
          <p>A bot cannot message a customer first. Request a one-time link through the API (<code>POST /telegram/link-tokens</code>); the customer opens it and presses Start.</p>
          <p>Your customers&apos; Telegram connections belong to your business only and are never shared with other businesses.</p>
        </CardContent>
      </Card>

      <ConfirmDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect} title="Disconnect WhatsApp?" description="Your stored credentials are deleted. Live WhatsApp requests will return setup_required until you reconnect." confirmLabel="Disconnect" variant="destructive" isLoading={disconnect.isPending} onConfirm={() => disconnect.mutate()} />
    </div>
  );
}
