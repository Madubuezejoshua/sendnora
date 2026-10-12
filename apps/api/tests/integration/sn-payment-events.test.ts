import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { encryptSecret } from '@sendnaro/database/encryption';
import { app, drain, makeBusiness } from './sn-helpers.js';
import { getTestEnv } from './setup.js';

const SECRET = 'sk_test_merchant_secret';

async function source() {
  const { workspace } = await makeBusiness();
  const src = await prisma.paymentEventSource.create({
    data: {
      workspaceId: workspace.id,
      environment: 'SANDBOX',
      provider: 'PAYSTACK',
      secretCiphertext: encryptSecret(SECRET, getTestEnv().APP_ENCRYPTION_KEY),
      defaultChannels: ['whatsapp'],
    },
  });
  return { workspace, src };
}

function event(over: Record<string, unknown> = {}, meta: Record<string, unknown> | null = {}) {
  return {
    event: 'charge.success',
    data: {
      id: 987001,
      reference: `ref_${Math.random().toString(36).slice(2, 10)}`,
      amount: 250000,
      currency: 'NGN',
      status: 'success',
      customer: {
        email: 'ada@example.com',
        first_name: 'Ada',
        last_name: 'Obi',
        customer_code: 'CUS_1',
      },
      metadata:
        meta === null
          ? null
          : { sendnaro: { whatsapp_phone: '+2348012345678', consent_whatsapp: true, ...meta } },
      ...over,
    },
  };
}

const post = (id: string, payload: unknown, secret = SECRET, sig?: string) => {
  const raw = JSON.stringify(payload);
  return request(app())
    .post(`/api/v1/webhooks/merchant/paystack/${id}`)
    .set('content-type', 'application/json')
    .set('x-paystack-signature', sig ?? createHmac('sha512', secret).update(raw).digest('hex'))
    .send(raw);
};

describe('merchant Paystack purchase events (pattern B)', () => {
  it('turns a verified charge.success into a delivered receipt, once, even when redelivered', async () => {
    const { workspace, src } = await source();
    const evt = event();
    const a = await post(src.id, evt);
    expect(a.status).toBe(200);
    expect(a.body.result).toBe('created');
    const b = await post(src.id, evt);
    expect(b.body.result).toBe('duplicate');
    await drain(workspace.id);
    const docs = await prisma.issuedDocument.findMany({ where: { workspaceId: workspace.id } });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.documentType).toBe('RECEIPT');
    const d = await prisma.delivery.findMany({ where: { workspaceId: workspace.id } });
    expect(d).toHaveLength(1);
    expect(d[0]!.status).toBe('SANDBOX_SIMULATED');
  });

  it('rejects a bad or missing signature and an unknown source, creating nothing', async () => {
    const { workspace, src } = await source();
    expect((await post(src.id, event(), SECRET, 'deadbeef')).status).toBe(401);
    expect((await post(src.id, event(), 'sk_other')).status).toBe(401);
    expect((await post('nope', event())).status).toBe(404);
    expect(await prisma.issuedDocument.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it('acknowledges but sends nothing without a phone and recorded consent, or when items disagree with the charge', async () => {
    const { workspace, src } = await source();
    expect((await post(src.id, event({}, { whatsapp_phone: undefined }))).body.result).toBe(
      'ignored',
    );
    expect((await post(src.id, event({}, { consent_whatsapp: false }))).body.result).toBe(
      'ignored',
    );
    const mismatch = await post(
      src.id,
      event({}, { items: [{ description: 'x', quantity: 1, unit_amount_minor: 1 }] }),
    );
    expect(mismatch.body.reason).toBe('items_do_not_match_paid_amount');
    expect((await post(src.id, { event: 'charge.failed', data: {} })).body.result).toBe('ignored');
    expect(await prisma.issuedDocument.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it("cannot be used to act on another business: a source's secret only authenticates its own events", async () => {
    const a = await source();
    const b = await source();
    const raw = JSON.stringify(event());
    // signed with A's key but sent to B's source (same secret value in fixtures, so use a distinct one)
    await prisma.paymentEventSource.update({
      where: { id: b.src.id },
      data: { secretCiphertext: encryptSecret('sk_test_b', getTestEnv().APP_ENCRYPTION_KEY) },
    });
    const res = await post(b.src.id, JSON.parse(raw), SECRET);
    expect(res.status).toBe(401);
    expect((await post(a.src.id, JSON.parse(raw))).status).toBe(200);
    expect(await prisma.issuedDocument.count({ where: { workspaceId: b.workspace.id } })).toBe(0);
  });
});
