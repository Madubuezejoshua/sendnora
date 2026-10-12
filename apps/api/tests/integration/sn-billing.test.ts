import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import {
  app,
  auth,
  bearer,
  connectWhatsApp,
  drain,
  invoiceBody,
  makeBusiness,
  makeKey,
  sessionToken,
} from './sn-helpers.js';
import { createTestUser } from './setup.js';
import {
  getBillingSettings,
  saveBillingSettings,
  seedBillingDefaults,
} from '../../src/sendnaro/entitlement.js';
import {
  setActivationGatewayForTests,
  type ActivationGateway,
  type GatewayVerification,
} from '../../src/sendnaro/billing/gateway.js';
import {
  applyPaymentReversal,
  computeActivationRevenue,
  confirmActivationPayment,
  paymentGrantsAccess,
} from '../../src/sendnaro/billing/activation.service.js';
import { setLiveProviderOverride } from '../../src/sendnaro/delivery/provider.js';

/** Fake HTTP gateway: only the network boundary is replaced; quote, verification, entitlement are the real code. */
class FakeGateway implements ActivationGateway {
  name = 'paystack';
  configured = true;
  live = true;
  results = new Map<string, GatewayVerification>();
  initialized: { reference: string; amountMinor: number }[] = [];
  isConfigured = () => this.configured;
  isLiveMode = () => this.live;
  async initialize(i: { reference: string; amountMinor: number }) {
    this.initialized.push({ reference: i.reference, amountMinor: i.amountMinor });
    return { checkoutUrl: `https://checkout.test/${i.reference}` };
  }
  async verify(reference: string): Promise<GatewayVerification> {
    return (
      this.results.get(reference) ?? {
        status: 'pending',
        amountMinor: 0,
        currency: 'NGN',
        transactionId: '',
        livemode: this.live,
      }
    );
  }
  verifyWebhookSignature(raw: Buffer, sig: string | undefined) {
    return sig === createHmac('sha512', 'test-gateway-secret').update(raw).digest('hex');
  }
  succeed(reference: string, amountMinor: number, currency = 'NGN') {
    this.results.set(reference, {
      status: 'success',
      amountMinor,
      currency,
      transactionId: `txn_${reference}`,
      livemode: this.live,
    });
  }
}

const gw = new FakeGateway();
const PRICE = 500000;
let admin: { id: string; token: string };
let liveSends = 0;

async function liveBusiness() {
  const biz = await makeBusiness();
  const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
  const sandboxKey = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
  await connectWhatsApp(biz.workspace.id);
  return {
    ...biz,
    live: live.key,
    sandbox: sandboxKey.key,
    token: await sessionToken(biz.user.id, biz.workspace.id),
  };
}

const notify = (key: string, scenario?: string) =>
  request(app())
    .post('/api/v1/notifications')
    .set(auth(key))
    .send({
      type: 'order_confirmation',
      customer: { external_customer_id: 'c1', name: 'Ada', whatsapp_phone: '+2348012345678' },
      channels: ['whatsapp'],
      fields: { order_reference: 'A-1' },
      consent: { whatsapp_transactional: true },
      ...(scenario ? { scenario } : {}),
    });

const setBilling = (patch: Record<string, unknown>, token = admin.token) =>
  request(app()).patch('/api/console/admin/billing').set(bearer(token)).send(patch);

beforeAll(async () => {
  const user = await createTestUser({ isPlatformAdmin: true });
  admin = { id: user.id, token: await sessionToken(user.id, undefined, true) };
  setActivationGatewayForTests(gw);
  setLiveProviderOverride(() => {
    liveSends += 1;
    return { kind: 'accepted', providerMessageId: `wamid.${liveSends}` };
  });
});
afterEach(async () => {
  await saveBillingSettings({ billingRequired: false });
});
afterAll(async () => {
  await saveBillingSettings({ billingRequired: false });
  setActivationGatewayForTests(null);
  setLiveProviderOverride(null);
});

describe('billing disabled (the required default)', () => {
  it('defaults to billing_required=false when nothing was ever chosen, and a restart/redeploy never resets a choice', async () => {
    await prisma.applicationSetting.deleteMany({
      where: { key: { in: ['billing_required', 'activation_price_minor', 'activation_currency'] } },
    });
    expect((await getBillingSettings()).billingRequired).toBe(false);
    await seedBillingDefaults();
    expect((await getBillingSettings()).billingRequired).toBe(false);

    await saveBillingSettings({ billingRequired: true });
    await seedBillingDefaults(); // what a redeploy/seed does
    expect((await getBillingSettings()).billingRequired).toBe(true);
    await saveBillingSettings({ billingRequired: false });
  });

  it('sandbox works without any payment', async () => {
    const biz = await liveBusiness();
    const res = await notify(biz.sandbox);
    expect(res.status).toBe(202);
    await drain(biz.workspace.id);
    expect(
      (
        await prisma.delivery.findFirstOrThrow({
          where: { workspaceId: biz.workspace.id, environment: 'SANDBOX' },
        })
      ).status,
    ).toBe('SANDBOX_SIMULATED');
  });

  it('an UNPAID business can send live when billing is off, through the real gate (provider boundary replaced only)', async () => {
    const biz = await liveBusiness();
    const before = liveSends;
    const res = await notify(biz.live);
    expect(res.status).toBe(202);
    await drain(biz.workspace.id);
    expect(liveSends).toBe(before + 1);
    const d = await prisma.delivery.findFirstOrThrow({
      where: { workspaceId: biz.workspace.id, environment: 'LIVE' },
    });
    expect(d.status).toBe('PROVIDER_ACCEPTED');
    expect(d.simulated).toBe(false);
    expect(await prisma.entitlement.count({ where: { workspaceId: biz.workspace.id } })).toBe(0); // free access is not a fake purchase
  });

  it('live without a configured sender reports setup_required instead of faking success', async () => {
    const biz = await makeBusiness();
    const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    const res = await notify(live.key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('setup_required');
    expect(await prisma.delivery.count({ where: { workspaceId: biz.workspace.id } })).toBe(0);
  });

  it('starts no checkout and charges nothing', async () => {
    const biz = await liveBusiness();
    const before = gw.initialized.length;
    const res = await request(app())
      .post('/api/console/activation/checkout')
      .set(bearer(biz.token));
    expect(res.status).toBe(409);
    expect(gw.initialized.length).toBe(before);
    expect(await prisma.activationPayment.count({ where: { workspaceId: biz.workspace.id } })).toBe(
      0,
    );
    const state = await request(app()).get('/api/console/activation').set(bearer(biz.token));
    expect(state.body.data.state).toBe('free_access');
  });

  it('keys, suspension and revocation still apply with billing off', async () => {
    const biz = await liveBusiness();
    await prisma.apiKey.updateMany({
      where: { workspaceId: biz.workspace.id, environment: 'LIVE' },
      data: { revokedAt: new Date() },
    });
    expect((await notify(biz.live)).status).toBe(401);
    const second = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    await prisma.workspace.update({
      where: { id: biz.workspace.id },
      data: { suspendedAt: new Date() },
    });
    expect((await notify(second.key)).body.error.code).toBe('business_suspended');
  });
});

describe('billing enabled (isolated tests only)', () => {
  it('admin controls: non-admins are refused; enabling needs confirmation and a ready gateway', async () => {
    const biz = await liveBusiness();
    expect((await setBilling({ billingRequired: true }, biz.token)).status).toBe(403);
    expect(
      (await request(app()).get('/api/console/admin/billing').set(bearer(biz.token))).status,
    ).toBe(403);

    const noConfirm = await setBilling({ billingRequired: true, activationPriceMinor: PRICE });
    expect(noConfirm.status).toBe(422);
    gw.configured = false;
    const notReady = await setBilling({
      billingRequired: true,
      activationPriceMinor: PRICE,
      confirm: true,
    });
    expect(notReady.status).toBe(409);
    expect(notReady.body.error.message).toMatch(/billing_not_ready/);
    gw.configured = true;
    expect((await getBillingSettings()).billingRequired).toBe(false); // failed safely: nothing changed

    const noPrice = await setBilling({ billingRequired: true, confirm: true });
    expect(noPrice.status).toBe(409);

    const ok = await setBilling({
      billingRequired: true,
      activationPriceMinor: PRICE,
      activationCurrency: 'NGN',
      confirm: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.settings.billingRequired).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'billing.settings_changed', actorUserId: admin.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  it('blocks unpaid live requests AND already-queued live jobs; sandbox stays free', async () => {
    const biz = await liveBusiness();
    const queued = await notify(biz.live); // accepted while billing was off
    expect(queued.status).toBe(202);
    await saveBillingSettings({ billingRequired: true, activationPriceMinor: PRICE });

    const before = liveSends;
    await drain(biz.workspace.id);
    expect(liveSends).toBe(before); // the queued job was NOT sent
    const d = await prisma.delivery.findFirstOrThrow({
      where: { workspaceId: biz.workspace.id, environment: 'LIVE' },
    });
    expect(d.status).toBe('BLOCKED');
    expect(d.lastErrorCode).toBe('activation_required');

    const blocked = await notify(biz.live);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('activation_required');
    expect(await prisma.delivery.count({ where: { workspaceId: biz.workspace.id } })).toBe(1); // no side effects for the rejected call
    const inv = await request(app())
      .post('/api/v1/invoices')
      .set(auth(biz.live))
      .send(invoiceBody());
    expect(inv.body.error.code).toBe('activation_required');
    expect(await prisma.issuedDocument.count({ where: { workspaceId: biz.workspace.id } })).toBe(0); // blocked before generation

    expect((await notify(biz.sandbox)).status).toBe(202); // sandbox unaffected
  });

  it('verified payment grants the entitlement exactly once; the paid business sends, another does not', async () => {
    await saveBillingSettings({
      billingRequired: true,
      activationPriceMinor: PRICE,
      activationCurrency: 'NGN',
    });
    const paid = await liveBusiness();
    const other = await liveBusiness();

    const checkout = await request(app())
      .post('/api/console/activation/checkout')
      .set(bearer(paid.token));
    expect(checkout.status).toBe(200);
    const ref: string = checkout.body.data.reference;
    expect(checkout.body.data.checkoutUrl).toContain(ref);

    // A browser returning from checkout proves nothing: while the gateway says "pending" nothing is granted.
    const early = await request(app())
      .post('/api/console/activation/verify')
      .set(bearer(paid.token))
      .send({ reference: ref });
    expect(early.body.data.result).toBe('pending');
    expect(await prisma.entitlement.count({ where: { workspaceId: paid.workspace.id } })).toBe(0);

    gw.succeed(ref, PRICE);
    // Concurrent confirmations (webhook + redirect + retries) race: exactly one wins.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => confirmActivationPayment(ref)),
    );
    expect(results.filter((r) => r.result === 'granted')).toHaveLength(1);
    expect(results.filter((r) => r.result === 'already_processed')).toHaveLength(5);
    expect(await prisma.entitlement.count({ where: { workspaceId: paid.workspace.id } })).toBe(1);
    expect(
      await prisma.activationPayment.count({
        where: { workspaceId: paid.workspace.id, status: 'SUCCEEDED' },
      }),
    ).toBe(1);

    const again = await request(app())
      .post('/api/console/activation/verify')
      .set(bearer(paid.token))
      .send({ reference: ref });
    expect(again.body.data.result).toBe('already_processed');
    expect(again.body.data.state.state).toBe('active');

    expect((await notify(paid.live)).status).toBe(202);
    await drain(paid.workspace.id);
    expect(
      (
        await prisma.delivery.findFirstOrThrow({
          where: { workspaceId: paid.workspace.id, environment: 'LIVE' },
        })
      ).status,
    ).toBe('PROVIDER_ACCEPTED');
    expect((await notify(other.live)).body.error.code).toBe('activation_required');
  });

  it('rejects forged callbacks, foreign references, amount/currency mismatches and signature failures', async () => {
    await saveBillingSettings({
      billingRequired: true,
      activationPriceMinor: PRICE,
      activationCurrency: 'NGN',
    });
    const biz = await liveBusiness();
    const other = await liveBusiness();
    const ref: string = (
      await request(app()).post('/api/console/activation/checkout').set(bearer(biz.token))
    ).body.data.reference;

    const body = JSON.stringify({ event: 'charge.success', data: { reference: ref } });
    const bad = await request(app())
      .post('/api/v1/webhooks/sendnaro-activation')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'forged')
      .send(body);
    expect(bad.status).toBe(401);
    expect(await prisma.entitlement.count({ where: { workspaceId: biz.workspace.id } })).toBe(0);

    // A correctly signed webhook still cannot grant by itself: the gateway says it is not paid.
    const good = await request(app())
      .post('/api/v1/webhooks/sendnaro-activation')
      .set('Content-Type', 'application/json')
      .set(
        'x-paystack-signature',
        createHmac('sha512', 'test-gateway-secret').update(body).digest('hex'),
      )
      .send(body);
    expect(good.status).toBe(200);
    expect(await prisma.entitlement.count({ where: { workspaceId: biz.workspace.id } })).toBe(0);

    // Another business cannot confirm (or even discover) this reference; unknown references are rejected.
    gw.succeed(ref, PRICE);
    const foreign = await request(app())
      .post('/api/console/activation/verify')
      .set(bearer(other.token))
      .send({ reference: ref });
    expect(foreign.body.data.result).toBe('rejected');
    expect((await confirmActivationPayment('snact_doesnotexist')).result).toBe('rejected');
    expect(await prisma.entitlement.count({ where: { workspaceId: other.workspace.id } })).toBe(0);

    // Amount mismatch (gateway reports less than the stored quote).
    const mismatch = (
      await request(app()).post('/api/console/activation/checkout').set(bearer(other.token))
    ).body.data.reference as string;
    gw.succeed(mismatch, 100);
    expect((await confirmActivationPayment(mismatch)).result).toBe('rejected');
    const third = await liveBusiness();
    const wrongCurrency = (
      await request(app()).post('/api/console/activation/checkout').set(bearer(third.token))
    ).body.data.reference as string;
    gw.succeed(wrongCurrency, PRICE, 'USD');
    expect((await confirmActivationPayment(wrongCurrency)).result).toBe('rejected');
    expect(
      await prisma.entitlement.count({
        where: { workspaceId: { in: [biz.workspace.id, other.workspace.id, third.workspace.id] } },
      }),
    ).toBe(0);

    // The real one finally succeeds via the signed webhook path.
    const signed = JSON.stringify({ event: 'charge.success', data: { reference: ref } });
    await request(app())
      .post('/api/v1/webhooks/sendnaro-activation')
      .set('Content-Type', 'application/json')
      .set(
        'x-paystack-signature',
        createHmac('sha512', 'test-gateway-secret').update(signed).digest('hex'),
      )
      .send(signed);
    const ent = await prisma.entitlement.findUnique({ where: { workspaceId: biz.workspace.id } });
    expect(ent?.source).toBe('PAYMENT');
  });

  it('honours the stored quote when the owner changes the price afterwards', async () => {
    await saveBillingSettings({
      billingRequired: true,
      activationPriceMinor: PRICE,
      activationCurrency: 'NGN',
    });
    const biz = await liveBusiness();
    const ref: string = (
      await request(app()).post('/api/console/activation/checkout').set(bearer(biz.token))
    ).body.data.reference;
    await saveBillingSettings({ activationPriceMinor: 900000 }); // price raised after the quote
    gw.succeed(ref, PRICE);
    expect((await confirmActivationPayment(ref)).result).toBe('granted');
  });

  it('test-mode (sandbox gateway) payments never unlock production and never count as revenue', async () => {
    expect(paymentGrantsAccess(false, 'production')).toBe(false);
    expect(paymentGrantsAccess(true, 'production')).toBe(true);
    expect(paymentGrantsAccess(false, 'development')).toBe(true); // dev/CI may exercise the flow

    const cur = `T${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const biz = await makeBusiness();
    const quote = await prisma.activationQuote.create({
      data: {
        workspaceId: biz.workspace.id,
        amountMinor: 1000,
        currency: cur,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.activationPayment.create({
      data: {
        workspaceId: biz.workspace.id,
        quoteId: quote.id,
        provider: 'paystack',
        reference: `snact_t_${cur}`,
        amountMinor: 1000,
        currency: cur,
        livemode: false,
        status: 'SUCCEEDED',
      },
    });
    expect((await computeActivationRevenue()).find((r) => r.currency === cur)).toBeUndefined();
  });

  it('revenue is computed per currency from verified live payments, net of refunds, never double counted', async () => {
    const cur = `R${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const mk = async (amount: number, status: 'SUCCEEDED' | 'PENDING', live = true) => {
      const biz = await makeBusiness();
      const quote = await prisma.activationQuote.create({
        data: {
          workspaceId: biz.workspace.id,
          amountMinor: amount,
          currency: cur,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      const ref = `snact_${cur}_${Math.random().toString(36).slice(2, 8)}`;
      await prisma.activationPayment.create({
        data: {
          workspaceId: biz.workspace.id,
          quoteId: quote.id,
          provider: 'paystack',
          reference: ref,
          amountMinor: amount,
          currency: cur,
          livemode: live,
          status,
        },
      });
      return ref;
    };
    const r1 = await mk(10000, 'SUCCEEDED');
    await mk(5000, 'SUCCEEDED');
    await mk(7000, 'PENDING'); // unverified: not revenue
    await mk(3000, 'SUCCEEDED', false); // test mode: not revenue
    expect((await computeActivationRevenue()).find((r) => r.currency === cur)).toEqual({
      currency: cur,
      collectedMinor: 15000,
      payments: 2,
    });
    await confirmActivationPayment(r1); // already succeeded -> no double count
    expect((await computeActivationRevenue()).find((r) => r.currency === cur)?.collectedMinor).toBe(
      15000,
    );

    await applyPaymentReversal(r1, 'refund', 4000); // partial refund
    expect((await computeActivationRevenue()).find((r) => r.currency === cur)?.collectedMinor).toBe(
      11000,
    );
  });

  it('a full refund or a dispute withdraws access; turning billing off preserves history', async () => {
    await saveBillingSettings({
      billingRequired: true,
      activationPriceMinor: PRICE,
      activationCurrency: 'NGN',
    });
    const biz = await liveBusiness();
    const ref: string = (
      await request(app()).post('/api/console/activation/checkout').set(bearer(biz.token))
    ).body.data.reference;
    gw.succeed(ref, PRICE);
    await confirmActivationPayment(ref);
    expect((await notify(biz.live)).status).toBe(202);

    await applyPaymentReversal(ref, 'refund'); // full
    expect(
      (await prisma.entitlement.findUniqueOrThrow({ where: { workspaceId: biz.workspace.id } }))
        .revokedReason,
    ).toBe('payment_refunded');
    expect((await notify(biz.live)).body.error.code).toBe('activation_required');

    // Billing off again: the gate relaxes, and the payment/entitlement history is untouched.
    const off = await setBilling({ billingRequired: false });
    expect(off.status).toBe(200);
    expect((await notify(biz.live)).status).toBe(202);
    expect(await prisma.activationPayment.count({ where: { workspaceId: biz.workspace.id } })).toBe(
      1,
    );
    expect(await prisma.entitlement.count({ where: { workspaceId: biz.workspace.id } })).toBe(1);
  });

  it('complimentary activation is recorded separately (never as revenue) and must carry a note', async () => {
    await saveBillingSettings({ billingRequired: true, activationPriceMinor: PRICE });
    const biz = await liveBusiness();
    const missing = await request(app())
      .post(`/api/console/admin/entitlements/${biz.workspace.id}/complimentary`)
      .set(bearer(admin.token))
      .send({});
    expect(missing.status).toBe(400);
    const ok = await request(app())
      .post(`/api/console/admin/entitlements/${biz.workspace.id}/complimentary`)
      .set(bearer(admin.token))
      .send({ note: 'Early partner' });
    expect(ok.status).toBe(200);
    expect(
      (await prisma.entitlement.findUniqueOrThrow({ where: { workspaceId: biz.workspace.id } }))
        .source,
    ).toBe('COMPLIMENTARY');
    expect(await prisma.activationPayment.count({ where: { workspaceId: biz.workspace.id } })).toBe(
      0,
    );
    expect((await notify(biz.live)).status).toBe(202);
    expect(
      (
        await request(app())
          .post(`/api/console/admin/entitlements/${biz.workspace.id}/complimentary`)
          .set(bearer(biz.token))
          .send({ note: 'self-grant' })
      ).status,
    ).toBe(403);
  });

  it('admin can suspend a business; suspension overrides payment', async () => {
    await saveBillingSettings({ billingRequired: true, activationPriceMinor: PRICE });
    const biz = await liveBusiness();
    await prisma.entitlement.create({
      data: { workspaceId: biz.workspace.id, source: 'COMPLIMENTARY', note: 'x' },
    });
    expect((await notify(biz.live)).status).toBe(202);
    expect(
      (
        await request(app())
          .post(`/api/console/admin/businesses/${biz.workspace.id}/suspend`)
          .set(bearer(admin.token))
          .send({ reason: 'abuse' })
      ).status,
    ).toBe(200);
    expect((await notify(biz.live)).body.error.code).toBe('business_suspended');
    expect(
      (
        await request(app())
          .post(`/api/console/admin/businesses/${biz.workspace.id}/unsuspend`)
          .set(bearer(biz.token))
      ).status,
    ).toBe(403);
  });
});
