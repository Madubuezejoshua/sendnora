import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { encryptSecret } from '@sendnaro/database/encryption';
import {
  app,
  auth,
  addWebhookEndpoint,
  drain,
  invoiceBody,
  makeBusiness,
  makeKey,
  startReceiver,
} from './sn-helpers.js';
import {
  applyProviderReceipt,
  deliveryPolicy,
  processDelivery,
} from '../../src/sendnaro/delivery/engine.js';
import { claimBatch, drainOutbox } from '../../src/sendnaro/outbox.js';
import { signPayload, verifySignature } from '../../src/sendnaro/webhooks/signing.js';
import { webhookRetryPolicy } from '../../src/sendnaro/webhooks/dispatch.js';
import {
  assertWebhookUrl,
  isBlockedAddress,
  safeRequest,
} from '../../src/sendnaro/webhooks/ssrf.js';
import { setLiveProviderOverride } from '../../src/sendnaro/delivery/provider.js';
import { verifyMetaSignature } from '../../src/sendnaro/delivery/provider-webhooks.routes.js';
import { getTestEnv } from './setup.js';

const std = { ...deliveryPolicy };
const stdHooks = { ...webhookRetryPolicy };
afterEach(() => {
  Object.assign(deliveryPolicy, std);
  Object.assign(webhookRetryPolicy, stdHooks);
  setLiveProviderOverride(null);
});

async function sandbox() {
  const biz = await makeBusiness();
  const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
  return { ...biz, key };
}

async function notify(key: string, scenario: string) {
  const res = await request(app())
    .post('/api/v1/notifications')
    .set(auth(key))
    .send({
      type: 'order_confirmation',
      customer: { external_customer_id: 'c1', name: 'Ada', whatsapp_phone: '+2348012345678' },
      channels: ['whatsapp'],
      fields: { order_reference: 'A-100' },
      consent: { whatsapp_transactional: true },
      scenario,
    });
  expect(res.status).toBe(202);
  return String(res.body.deliveries[0].id).replace('dlv_', '');
}

const row = (id: string) =>
  prisma.delivery.findUniqueOrThrow({
    where: { id },
    include: { attempts: { orderBy: { attemptNo: 'asc' } } },
  });

describe('delivery reliability (sandbox scenarios)', () => {
  it('temporary failure: bounded retries then success', async () => {
    deliveryPolicy.retryBaseMs = 1;
    const { key, workspace } = await sandbox();
    const id = await notify(key, 'temporary_failure');
    await drain(workspace.id, 10);
    const d = await row(id);
    expect(d.status).toBe('SANDBOX_SIMULATED');
    expect(d.attempts.map((a) => a.outcome)).toEqual([
      'transient_failure',
      'transient_failure',
      'accepted',
    ]);
  });

  it('gives up after the attempt cap on a persistently failing provider', async () => {
    deliveryPolicy.retryBaseMs = 1;
    deliveryPolicy.maxAttempts = 3;
    const biz = await makeBusiness();
    const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    await prisma.channelConnection.create({
      data: {
        workspaceId: biz.workspace.id,
        environment: 'LIVE',
        channel: 'WHATSAPP',
        status: 'CONNECTED',
        config: {},
        secretCiphertext: encryptSecret('{}', getTestEnv().APP_ENCRYPTION_KEY),
      },
    });
    let calls = 0;
    setLiveProviderOverride(() => {
      calls += 1;
      return { kind: 'transient', code: 'provider_unavailable', message: 'down' };
    });
    const res = await request(app())
      .post('/api/v1/notifications')
      .set(auth(live.key))
      .send({
        type: 'order_confirmation',
        customer: { external_customer_id: 'c1', name: 'Ada', whatsapp_phone: '+2348012345678' },
        channels: ['whatsapp'],
        fields: {},
        consent: { whatsapp_transactional: true },
      });
    await drain(biz.workspace.id, 10);
    const d = await row(String(res.body.deliveries[0].id).replace('dlv_', ''));
    expect(d.status).toBe('FAILED');
    expect(d.lastErrorCode).toBe('max_retries_exceeded');
    expect(calls).toBe(3); // bounded
  });

  it('permanent failures are terminal immediately (no endless retry)', async () => {
    const { key, workspace } = await sandbox();
    for (const scenario of ['invalid_recipient', 'permanent_failure']) {
      const d = await row(await notify(key, scenario));
      expect(d.status).toBe('QUEUED');
    }
    await drain(workspace.id);
    const all = await prisma.delivery.findMany({
      where: { workspaceId: workspace.id },
      include: { attempts: true },
    });
    expect(all.every((d) => d.status === 'FAILED' && d.attempts.length === 1)).toBe(true);
    expect(all.map((d) => d.lastErrorCode).sort()).toEqual([
      'invalid_recipient',
      'provider_rejected',
    ]);
  });

  it('throttling is honoured (waits, then succeeds)', async () => {
    deliveryPolicy.retryBaseMs = 1;
    const { key, workspace } = await sandbox();
    const id = await notify(key, 'throttled');
    await drain(workspace.id, 8);
    const d = await row(id);
    expect(d.status).toBe('SANDBOX_SIMULATED');
    expect(d.attempts.map((a) => a.outcome)).toEqual(['throttled', 'accepted']);
  });

  it('delayed and duplicate provider receipts produce exactly one delivered transition and one webhook', async () => {
    const { key, workspace } = await sandbox();
    const receiver = await startReceiver();
    await addWebhookEndpoint(workspace.id, 'SANDBOX', receiver.url);
    const id = await notify(key, 'duplicate_callback');
    await drain(workspace.id, 8);
    const d = await row(id);
    expect(d.status).toBe('DELIVERED');
    expect(
      await prisma.merchantWebhookEvent.count({
        where: { workspaceId: workspace.id, type: 'delivery.delivered' },
      }),
    ).toBe(1);
    expect(
      await prisma.providerStatusEvent.count({
        where: { externalId: `sim_${id}`, status: 'delivered' },
      }),
    ).toBe(1);
    await receiver.close();
  });

  it('ambiguous timeout: never re-sends; a late receipt confirms it', async () => {
    const { key, workspace } = await sandbox();
    const id = await notify(key, 'ambiguous_timeout');
    await drain(workspace.id, 8);
    const d = await row(id);
    expect(d.status).toBe('DELIVERED');
    expect(d.attempts).toHaveLength(1); // exactly one provider call: no blind duplicate
    expect(d.attempts[0]!.outcome).toBe('ambiguous');
  });

  it('ambiguous timeout with no receipt: fails as unconfirmed after the grace window, still never re-sent', async () => {
    deliveryPolicy.reconcileGraceMs = 1;
    const { key, workspace } = await sandbox();
    const id = await notify(key, 'ambiguous_timeout_lost');
    await drain(workspace.id, 8);
    const d = await row(id);
    expect(d.status).toBe('FAILED');
    expect(d.lastErrorCode).toBe('provider_timeout_unconfirmed');
    expect(d.attempts).toHaveLength(1);
  });

  it('survives a worker crash between acceptance and sending (lock expiry re-claim)', async () => {
    const { key, workspace } = await sandbox();
    const id = await notify(key, 'success');
    // A worker claims the job and dies without finishing.
    const claimed = await claimBatch('dead-worker', 10, workspace.id);
    expect(claimed.length).toBeGreaterThan(0);
    expect((await drainOutbox({ workspaceId: workspace.id })).processed).toBe(0); // still locked: nobody double-processes
    await prisma.outboxEvent.updateMany({
      where: { workspaceId: workspace.id, status: 'PROCESSING' },
      data: { lockedAt: new Date(Date.now() - 10 * 60_000) },
    });
    await drain(workspace.id);
    expect((await row(id)).status).toBe('SANDBOX_SIMULATED');
  });

  it('a crash AFTER the provider call started never causes a second send', async () => {
    const { key, workspace } = await sandbox();
    const id = await notify(key, 'success');
    await prisma.delivery.update({
      where: { id },
      data: { status: 'PROCESSING', attemptCount: 1 },
    });
    await prisma.deliveryAttempt.create({
      data: { deliveryId: id, attemptNo: 1, outcome: 'started' },
    }); // unfinished attempt
    await processDelivery(id);
    const d = await row(id);
    expect(d.attempts).toHaveLength(1);
    expect(d.attempts[0]!.outcome).toBe('ambiguous');
    expect(d.status).toBe('PROCESSING'); // waiting for a receipt / reconcile, not re-sent
    void workspace;
  });

  it('out-of-order and duplicate provider receipts only move status forward', async () => {
    const biz = await makeBusiness();
    const wamid = `wamid.${Math.random().toString(36).slice(2)}`;
    const d = await prisma.delivery.create({
      data: {
        workspaceId: biz.workspace.id,
        environment: 'LIVE',
        kind: 'NOTIFICATION',
        channel: 'WHATSAPP',
        status: 'PROVIDER_ACCEPTED',
        toAddress: '+2348012345678',
        templateKey: 'x',
        providerMessageId: wamid,
      },
    });
    const apply = (status: 'sent' | 'delivered' | 'read' | 'failed') =>
      applyProviderReceipt({ provider: 'whatsapp:t', externalId: wamid, status });
    expect(await apply('read')).toBe(true);
    expect(await apply('delivered')).toBe(false); // late delivered after read is ignored
    expect(await apply('delivered')).toBe(false); // exact duplicate ignored
    expect(await apply('failed')).toBe(false); // late failure never undoes a read
    const fresh = await prisma.delivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(fresh.status).toBe('READ');
    expect(fresh.readAt).toBeTruthy();
  });

  it('WhatsApp status callbacks need a valid signature and cannot cross tenants', async () => {
    const mk = async () => {
      const biz = await makeBusiness();
      const secrets = {
        accessToken: 'a'.repeat(30),
        appSecret: `secret-${Math.random().toString(36).slice(2)}-padding`,
        verifyToken: 'verify-token-123',
      };
      const conn = await prisma.channelConnection.create({
        data: {
          workspaceId: biz.workspace.id,
          environment: 'LIVE',
          channel: 'WHATSAPP',
          status: 'CONNECTED',
          config: { phoneNumberId: `99${Math.floor(Math.random() * 1e8)}` },
          secretCiphertext: encryptSecret(JSON.stringify(secrets), getTestEnv().APP_ENCRYPTION_KEY),
        },
      });
      const d = await prisma.delivery.create({
        data: {
          workspaceId: biz.workspace.id,
          environment: 'LIVE',
          kind: 'NOTIFICATION',
          channel: 'WHATSAPP',
          status: 'PROVIDER_ACCEPTED',
          toAddress: '+2348012345678',
          templateKey: 'x',
          providerMessageId: `wamid.${Math.random().toString(36).slice(2)}`,
        },
      });
      return {
        conn,
        secrets,
        d,
        phoneNumberId: (conn.config as { phoneNumberId: string }).phoneNumberId,
      };
    };
    const a = await mk();
    const b = await mk();
    const payload = (x: typeof a, status: string) =>
      JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: x.phoneNumberId },
                  statuses: [{ id: x.d.providerMessageId, status }],
                },
              },
            ],
          },
        ],
      });
    const sign = (secret: string, body: string) =>
      `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const post = (x: typeof a, body: string, sig: string) =>
      request(app())
        .post(`/api/v1/webhooks/whatsapp/${x.conn.id}`)
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', sig)
        .send(body);

    const body = payload(a, 'delivered');
    expect((await post(a, body, 'sha256=deadbeef')).status).toBe(401); // forged
    expect((await post(a, body, sign(b.secrets.appSecret, body))).status).toBe(401); // signed with ANOTHER business's secret
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: a.d.id } })).status).toBe(
      'PROVIDER_ACCEPTED',
    );

    expect((await post(a, body, sign(a.secrets.appSecret, body))).status).toBe(200);
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: a.d.id } })).status).toBe(
      'DELIVERED',
    );

    // A validly signed callback that names B's message through A's connection cannot touch B.
    const crossBody = payload({ ...a, d: b.d }, 'read');
    await post(a, crossBody, sign(a.secrets.appSecret, crossBody));
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: b.d.id } })).status).toBe(
      'PROVIDER_ACCEPTED',
    );
    expect(verifyMetaSignature('s', Buffer.from('x'), undefined)).toBe(false);

    // Meta's one-time handshake uses the business's own verify token.
    const hs = await request(app()).get(`/api/v1/webhooks/whatsapp/${a.conn.id}`).query({
      'hub.mode': 'subscribe',
      'hub.verify_token': a.secrets.verifyToken,
      'hub.challenge': 'abc123',
    });
    expect(hs.status).toBe(200);
    expect(hs.text).toBe('abc123');
    expect(
      (
        await request(app())
          .get(`/api/v1/webhooks/whatsapp/${a.conn.id}`)
          .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'x' })
      ).status,
    ).toBe(403);
  });
});

describe('sandbox process-queue helper', () => {
  it('is tenant scoped, sandbox only, and can fast-forward delayed retries', async () => {
    deliveryPolicy.retryBaseMs = 60_000; // a retry would normally wait about a minute
    const a = await sandbox();
    const b = await sandbox();
    const idA = await notify(a.key, 'temporary_failure');
    const idB = await notify(b.key, 'success');

    const run = (key: string, body: object = {}) =>
      request(app()).post('/api/v1/sandbox/process-queue').set(auth(key)).send(body);
    const first = await run(a.key);
    expect(first.status).toBe(200);
    expect((await row(idA)).status).toBe('RETRYING'); // retry is scheduled in the future
    expect((await row(idB)).status).toBe('QUEUED'); // another business's job was NOT touched

    await run(a.key, { fast_forward: true });
    expect((await row(idA)).status).toBe('SANDBOX_SIMULATED');
    expect((await row(idB)).status).toBe('QUEUED');

    const live = await makeKey(a.workspace.id, a.user.id, 'LIVE');
    const denied = await run(live.key);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('sandbox_only');
  });
});

describe('outgoing merchant webhooks', () => {
  it('signs the exact bytes, supports replay protection, and a failing callback never re-sends the customer message', async () => {
    webhookRetryPolicy.delaysMs = [1, 1, 1, 1, 1, 1, 1];
    const { key, workspace } = await sandbox();
    const receiver = await startReceiver((n) => (n <= 2 ? 500 : 200)); // fails twice, then succeeds
    const { secret } = await addWebhookEndpoint(workspace.id, 'SANDBOX', receiver.url);
    const id = await notify(key, 'success');
    await drain(workspace.id, 12);

    const d = await row(id);
    expect(d.attempts).toHaveLength(1); // the customer message was sent ONCE
    expect(d.status).toBe('SANDBOX_SIMULATED');
    expect(receiver.received.length).toBeGreaterThanOrEqual(3); // the callback was retried

    const hit = receiver.received.at(-1)!;
    const header = hit.headers['sendnaro-signature'] as string;
    expect(verifySignature(secret, hit.raw, header)).toBe(true);
    expect(verifySignature(secret, `${hit.raw} `, header)).toBe(false); // exact bytes: one extra byte breaks it
    expect(verifySignature('whsec_wrong', hit.raw, header)).toBe(false);
    const stale = signPayload(secret, hit.raw, Math.floor(Date.now() / 1000) - 3600);
    expect(verifySignature(secret, hit.raw, stale)).toBe(false); // replay window
    const payload = JSON.parse(hit.raw);
    expect(payload.type).toBe('delivery.sent');
    expect(payload.id).toMatch(/^evt_/);
    expect(payload.livemode).toBe(false);
    await receiver.close();
  });

  it('never includes an OTP code in an otp.verified webhook', async () => {
    const { key, workspace } = await sandbox();
    const receiver = await startReceiver();
    await addWebhookEndpoint(workspace.id, 'SANDBOX', receiver.url);
    const c = await request(app())
      .post('/api/v1/otp/challenges')
      .set(auth(key))
      .send({ phone: '+2348012345678', purpose: 'login', customer_ref: 'u1' });
    const inbox = await request(app()).get('/api/v1/sandbox/otp-inbox').set(auth(key));
    const code = inbox.body.messages[0].code as string;
    await request(app())
      .post(`/api/v1/otp/challenges/${c.body.id}/verify`)
      .set(auth(key))
      .send({ code, phone: '+2348012345678', purpose: 'login' });
    await drain(workspace.id, 6);
    const verified = receiver.received
      .map((r) => JSON.parse(r.raw))
      .find((e) => e.type === 'otp.verified');
    expect(verified).toBeTruthy();
    expect(verified.data.outcome).toBe('verified');
    expect(JSON.stringify(verified)).not.toContain(code);
    await receiver.close();
  });

  it('blocks private networks, metadata endpoints, credentials in URLs and plain http for live endpoints (SSRF)', async () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.9.9',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      '::ffff:127.0.0.1',
      '100.64.0.1',
      'fc00::1',
      'fe80::1',
    ]) {
      expect(isBlockedAddress(ip, false), ip).toBe(true);
    }
    expect(isBlockedAddress('8.8.8.8', false)).toBe(false);
    expect(isBlockedAddress('127.0.0.1', true)).toBe(false); // sandbox + explicit dev flag only
    expect(isBlockedAddress('10.0.0.5', true)).toBe(true); // the dev flag never opens private ranges
    for (const url of [
      'http://example.com/hook',
      'https://127.0.0.1/hook',
      'https://169.254.169.254/latest',
      'https://user:pass@example.com/',
      'ftp://example.com/',
      'https://[::1]/',
    ]) {
      await expect(assertWebhookUrl(url, false), url).rejects.toThrow();
    }
    await expect(assertWebhookUrl('https://localhost/hook', false)).rejects.toThrow(); // hostname that resolves to loopback
    // Connect-time protection (DNS rebinding): even a vetted URL is re-checked when the socket opens.
    await expect(
      safeRequest('https://localhost:9/x', {
        method: 'POST',
        headers: {},
        body: '{}',
        timeoutMs: 2000,
        allowLocal: false,
      }),
    ).rejects.toThrow(/blocked_address|ECONN|refused|blocked/);
  });

  it('does not follow redirects', async () => {
    const http = await import('node:http');
    let hits = 0;
    const server = http.createServer((req, res) => {
      hits += 1;
      res.statusCode = 302;
      res.setHeader('Location', 'http://127.0.0.1:1/internal');
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const res = await safeRequest(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: {},
      body: '{}',
      timeoutMs: 2000,
      allowLocal: true,
    });
    expect(res.status).toBe(302); // reported as-is, never followed
    expect(hits).toBe(1);
    await new Promise<void>((r) => server.close(() => r()));
  });
});
