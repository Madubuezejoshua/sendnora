'use client';

import * as React from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, FormField, Input, Tabs, TabsContent, TabsList, TabsTrigger, toast } from '@sendnaro/ui';
import { apiBrowserFetch } from '@/lib/api-browser';

/**
 * Drives the REAL /api/v1 endpoints with a sandbox key. The key lives only in this component's memory and
 * is relayed by /api/sandbox, which accepts sn_test_ keys only. Nothing here is mocked in the browser.
 */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Entry = { id: number; title: string; status: number; body: unknown };

const SCENARIOS = ['success', 'invalid_recipient', 'temporary_failure', 'permanent_failure', 'throttled', 'delayed_callback', 'duplicate_callback', 'ambiguous_timeout', 'ambiguous_timeout_lost'];

async function sbx(key: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`/api/sandbox${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Sandbox-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}

export function Playground() {
  const [key, setKey] = React.useState('');
  const [log, setLog] = React.useState<Entry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [phone, setPhone] = React.useState('+2348012345678');
  const [code, setCode] = React.useState('');
  const [challenge, setChallenge] = React.useState('');
  const [inboxCode, setInboxCode] = React.useState('');
  const [customerId, setCustomerId] = React.useState('customer_42');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [channels, setChannels] = React.useState<string[]>(['whatsapp']);
  const [scenario, setScenario] = React.useState('success');
  const [pdfUrl, setPdfUrl] = React.useState('');
  const seq = React.useRef(0);

  const push = (title: string, status: number, body: unknown) => setLog((l) => [{ id: ++seq.current, title, status, body }, ...l].slice(0, 12));
  const need = () => {
    if (!/^sn_test_/.test(key)) {
      toast.error('Add a sandbox key first', 'Create one below, or paste a key that starts with sn_test_.');
      return false;
    }
    return true;
  };
  const run = async (fn: () => Promise<void>) => {
    if (!need()) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const call = async (title: string, method: string, path: string, body?: unknown) => {
    const r = await sbx(key, method, path, body);
    push(title, r.status, r.body);
    return r;
  };
  const process = (fast = false) => call('Process queue', 'POST', '/sandbox/process-queue', { fast_forward: fast });
  const TERMINAL = ['sandbox_simulated', 'delivered', 'read', 'sent', 'provider_accepted', 'failed', 'expired', 'blocked'];
  /** Like a real client: poll until the work settles (a worker may already hold a job, so one run is not enough). */
  const settle = async (fast: boolean, done: (body: Json) => boolean, path: string, title: string) => {
    let last = { status: 0, body: {} as Json };
    for (let i = 0; i < 8; i += 1) {
      await sbx(key, 'POST', '/sandbox/process-queue', { fast_forward: fast });
      last = await sbx(key, 'GET', path);
      if (done(last.body)) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    push(title, last.status, last.body);
    return last;
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const r = await apiBrowserFetch<{ data: { secret: string } }>('/keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Playground', environment: 'sandbox' }),
      });
      setKey(r.data.secret);
      toast.success('Sandbox key created', 'It is kept in this page only. Copy it if you want to reuse it.');
    } catch {
      toast.error('Could not create a key', 'Only business owners and admins can create keys.');
    } finally {
      setBusy(false);
    }
  };

  const sendInvoice = () =>
    run(async () => {
      const r = await call('POST /invoices', 'POST', '/invoices', {
        external_order_id: `order_${Date.now()}`,
        document_type: 'receipt',
        payment: { status: 'paid', reference: 'sandbox_payment_1' },
        customer: { external_customer_id: customerId, name: 'Test Customer', whatsapp_phone: phone },
        currency: 'NGN',
        items: [{ description: 'Sample purchase', quantity: 1, unit_amount_minor: 500000 }],
        channels,
        consent: { whatsapp_transactional: true },
      });
      if (r.status !== 202) return;
      const g = await settle(
        false,
        (b) => b.pdf?.status === 'ready' && (b.deliveries ?? []).every((d: { status: string }) => TERMINAL.includes(d.status)),
        `/invoices/${r.body.id}`,
        `GET /invoices/${r.body.id}`,
      );
      setPdfUrl(g.body.pdf?.url ?? '');
    });

  const sendCode = () =>
    run(async () => {
      const r = await call('POST /otp/challenges', 'POST', '/otp/challenges', { phone, purpose: 'phone_verification', customer_ref: 'playground_user' });
      if (r.status !== 202) return;
      setChallenge(r.body.id);
      await process();
      const inbox = await sbx(key, 'GET', `/sandbox/otp-inbox?phone=${encodeURIComponent(phone)}`);
      setInboxCode(inbox.body.messages?.[0]?.code ?? '');
      push('GET /sandbox/otp-inbox (sandbox only)', inbox.status, inbox.body);
    });

  const verifyCode = () =>
    run(async () => {
      await call(`POST /otp/challenges/${challenge}/verify`, 'POST', `/otp/challenges/${challenge}/verify`, { code, phone, purpose: 'phone_verification' });
    });

  const makeLink = () =>
    run(async () => {
      const r = await call('POST /telegram/link-tokens', 'POST', '/telegram/link-tokens', { external_customer_id: customerId, name: 'Test Customer', force_relink: true });
      setLinkUrl(r.body.url ?? '');
    });

  const simulateStart = () =>
    run(async () => {
      const token = linkUrl ? new URL(linkUrl).searchParams.get('start') : '';
      if (!token) return toast.error('Create a link first');
      await call('POST /sandbox/telegram/start (simulated Start)', 'POST', '/sandbox/telegram/start', { token, chat_id: 'sandbox_chat_1' });
    });

  const sendScenario = (fast: boolean) =>
    run(async () => {
      const r = await call(`POST /notifications (scenario: ${scenario})`, 'POST', '/notifications', {
        type: 'order_confirmation',
        customer: { external_customer_id: customerId, name: 'Test Customer', whatsapp_phone: phone },
        channels: ['whatsapp'],
        fields: { order_reference: `A-${Date.now() % 10000}` },
        consent: { whatsapp_transactional: true },
        scenario,
      });
      if (r.status !== 202) return;
      const id = r.body.deliveries[0].id;
      await settle(fast, (b) => TERMINAL.includes(b.status), `/deliveries/${id}`, `GET /deliveries/${id}`);
    });

  const toggleChannel = (c: string) => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sandbox playground</CardTitle>
        <p className="text-muted-foreground text-sm">
          Calls the real API with a sandbox key. Providers are simulated, so nothing reaches a real customer.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Sandbox key" htmlFor="pg-key" className="min-w-[16rem] flex-1">
            <Input id="pg-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="sn_test_..." />
          </FormField>
          <Button variant="outline" onClick={createKey} disabled={busy}>
            Create sandbox key
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Customer phone (WhatsApp)" htmlFor="pg-phone">
            <Input id="pg-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Customer id" htmlFor="pg-cust">
            <Input id="pg-cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
          </FormField>
        </div>

        <Tabs defaultValue="invoice">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="otp">WhatsApp code</TabsTrigger>
            <TabsTrigger value="telegram">Telegram</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          </TabsList>

          <TabsContent value="invoice" className="space-y-3 pt-4">
            <p className="text-muted-foreground text-sm">Submit a sample paid purchase, then inspect the PDF and the simulated deliveries.</p>
            <div className="flex gap-4 text-sm">
              {['whatsapp', 'telegram'].map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="checkbox" checked={channels.includes(c)} onChange={() => toggleChannel(c)} /> {c}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={sendInvoice} disabled={busy || channels.length === 0}>Send sample purchase</Button>
              {pdfUrl && <a className="text-sm underline underline-offset-2" href={pdfUrl} target="_blank" rel="noreferrer">Open generated PDF</a>}
            </div>
            <p className="text-muted-foreground text-xs">Telegram shows “failed: telegram_not_connected” until the customer is connected (Telegram tab).</p>
          </TabsContent>

          <TabsContent value="otp" className="space-y-3 pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <Button onClick={sendCode} disabled={busy}>Send code</Button>
              {inboxCode && <Badge variant="warning">Sandbox inbox code: {inboxCode}</Badge>}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Code received" htmlFor="pg-code" className="w-40">
                <Input id="pg-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
              </FormField>
              <Button variant="outline" onClick={verifyCode} disabled={busy || !challenge || code.length < 4}>Verify</Button>
            </div>
          </TabsContent>

          <TabsContent value="telegram" className="space-y-3 pt-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={makeLink} disabled={busy}>Create link</Button>
              <Button variant="outline" onClick={simulateStart} disabled={busy || !linkUrl}>Simulate customer pressing Start</Button>
            </div>
            {linkUrl && <p className="break-all font-mono text-xs">{linkUrl}</p>}
            <p className="text-muted-foreground text-xs">Then send a sample purchase with the Telegram channel ticked. Skip “Start” to see the not-connected case.</p>
          </TabsContent>

          <TabsContent value="scenarios" className="space-y-3 pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Provider behaviour" htmlFor="pg-scn">
                <select id="pg-scn" value={scenario} onChange={(e) => setScenario(e.target.value)} className="border-input bg-background h-10 rounded-md border px-3 text-sm">
                  {SCENARIOS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </FormField>
              <Button onClick={() => sendScenario(true)} disabled={busy}>Send and fast-forward retries</Button>
              <Button variant="outline" onClick={() => sendScenario(false)} disabled={busy}>Send, no waiting</Button>
            </div>
            <p className="text-muted-foreground text-xs">Scenarios only exist in the sandbox. A live key that sends one is rejected.</p>
          </TabsContent>
        </Tabs>

        <section aria-label="API responses" aria-live="polite" className="space-y-2">
          {log.length === 0 ? (
            <p className="text-muted-foreground text-sm">Responses appear here, newest first.</p>
          ) : (
            log.map((e) => (
              <details key={e.id} open={e.id === log[0]?.id} className="border-border rounded-md border">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <Badge variant={e.status < 300 ? 'success' : 'destructive'}>{e.status}</Badge> {e.title}
                </summary>
                <pre className="bg-muted/50 max-h-72 overflow-auto p-3 text-xs">{JSON.stringify(e.body, null, 2)}</pre>
              </details>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}
