import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { app, auth, drain, invoiceBody, makeBusiness, makeKey } from './sn-helpers.js';
import { getStorageProvider } from '../../src/services/storage/storage.service.js';

async function sandbox() {
  const biz = await makeBusiness();
  const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
  return { ...biz, key };
}

describe('automated invoices (sandbox, real pipeline)', () => {
  it('accepts a paid purchase, computes totals server-side, numbers it, renders a watermarked PDF and delivers (simulated)', async () => {
    const { workspace, key } = await sandbox();
    const res = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .set('Idempotency-Key', 'shop-order-1042-invoice')
      .send(invoiceBody({ external_order_id: 'order_1042' }));

    expect(res.status).toBe(202); // accepted for processing, not delivered
    expect(res.body.object).toBe('invoice');
    expect(res.body.number).toBe('SBX-RCT-000001');
    expect(res.body.amounts.total_minor).toBe(500000); // 500000 minor units = NGN 5,000.00
    expect(res.body.pdf.status).toBe('pending');
    expect(res.body.deliveries).toHaveLength(1);
    expect(res.body.deliveries[0].status).toBe('queued');
    expect(res.body.request_id).toBeTruthy();

    await drain(workspace.id);

    const get = await request(app()).get(`/api/v1/invoices/${res.body.id}`).set(auth(key));
    expect(get.status).toBe(200);
    expect(get.body.pdf.status).toBe('ready');
    expect(get.body.deliveries[0].status).toBe('sandbox_simulated');
    expect(get.body.deliveries[0].simulated).toBe(true);

    const doc = await prisma.issuedDocument.findFirstOrThrow({
      where: { workspaceId: workspace.id },
    });
    const pdf = await (
      getStorageProvider() as unknown as { readObject(k: string): Promise<Buffer> }
    ).readObject(doc.pdfStorageKey!);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('ignores any client-supplied total and rejects unknown fields (strict schema)', async () => {
    const { key } = await sandbox();
    const res = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .send(invoiceBody({ total_minor: 1, business_id: 'someone_else' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(Object.keys(res.body.error.fields).join()).toMatch(/_body|total_minor|business_id/);
  });

  it('calculates tax and discounts exactly (integer minor units, no float drift)', async () => {
    const { key, workspace } = await sandbox();
    const res = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .send(
        invoiceBody({
          document_type: 'invoice',
          payment: { status: 'unpaid' },
          items: [
            { description: 'A', quantity: 3, unit_amount_minor: 1999, tax_rate_percent: 7.5 },
            { description: 'B', quantity: '0.5', unit_amount_minor: 10000 },
          ],
          discount_minor: 1000,
        }),
      );
    expect(res.status).toBe(202);
    // subtotal 5997 + 5000 = 10997; minus 1000 discount = 9997 base; tax is 7.5% of A's discounted share only.
    expect(res.body.amounts.subtotal_minor).toBe(10997);
    expect(res.body.amounts.discount_minor).toBe(1000);
    expect(res.body.amounts.total_minor).toBe(
      res.body.amounts.subtotal_minor - 1000 + res.body.amounts.tax_minor,
    );
    expect(Number.isInteger(res.body.amounts.tax_minor)).toBe(true);
    await drain(workspace.id);
  });

  it('is idempotent: same key + same body => one invoice; concurrent duplicates => same result; different body => 409', async () => {
    const { key, workspace } = await sandbox();
    const body = invoiceBody({ external_order_id: 'order_idem' });
    const post = (b: unknown, k = 'idem-1') =>
      request(app())
        .post('/api/v1/invoices')
        .set(auth(key))
        .set('Idempotency-Key', k)
        .send(b as object);

    const first = await post(body);
    const second = await post(body);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await prisma.issuedDocument.count({ where: { workspaceId: workspace.id } })).toBe(1);

    const conflict = await post({ ...body, notes: 'different' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('idempotency_conflict');

    const concurrentBody = invoiceBody({ external_order_id: 'order_concurrent' });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => post(concurrentBody, 'idem-concurrent')),
    );
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(results.every((r) => r.status === 202)).toBe(true);
    expect(
      await prisma.issuedDocument.count({
        where: { workspaceId: workspace.id, externalOrderId: 'order_concurrent' },
      }),
    ).toBe(1);
    await drain(workspace.id);
    // one invoice => one delivery => one render job, regardless of how many duplicate requests arrived
    expect(
      await prisma.delivery.count({
        where: { workspaceId: workspace.id, invoiceId: first.body.id.replace('inv_', '') },
      }),
    ).toBe(1);
  });

  it.each([
    [
      'fractional minor units',
      { items: [{ description: 'x', quantity: 1, unit_amount_minor: 10.5 }] },
      400,
    ],
    ['negative amount', { items: [{ description: 'x', quantity: 1, unit_amount_minor: -5 }] }, 400],
    ['zero quantity', { items: [{ description: 'x', quantity: 0, unit_amount_minor: 100 }] }, 400],
    [
      'quantity with 4 decimals',
      { items: [{ description: 'x', quantity: '1.0001', unit_amount_minor: 100 }] },
      400,
    ],
    [
      'amount overflow',
      { items: [{ description: 'x', quantity: 1000000, unit_amount_minor: 100000000000 }] },
      422,
    ],
    ['unsupported currency', { currency: 'ZZZ' }, 422],
    [
      'too many items',
      {
        items: Array.from({ length: 101 }, () => ({
          description: 'x',
          quantity: 1,
          unit_amount_minor: 1,
        })),
      },
      400,
    ],
    [
      'oversized description',
      { items: [{ description: 'x'.repeat(201), quantity: 1, unit_amount_minor: 1 }] },
      400,
    ],
    [
      'malformed phone',
      { customer: { external_customer_id: 'c1', name: 'N', whatsapp_phone: '12345abc' } },
      422,
    ],
    ['unpaid receipt', { payment: { status: 'unpaid' } }, 422],
    ['receipt without payment reference', { payment: { status: 'paid' } }, 422],
    ['no channels', { channels: [] }, 400],
  ])('rejects %s without side effects', async (_name, override, status) => {
    const { key, workspace } = await sandbox();
    const res = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .send(invoiceBody(override));
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBeTruthy();
    expect(await prisma.issuedDocument.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it('requires recorded WhatsApp consent', async () => {
    const { key } = await sandbox();
    const res = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .send(invoiceBody({ consent: undefined }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('consent_required');
  });

  it('keeps the issue-time business snapshot when the profile later changes', async () => {
    const { key, workspace, user } = await sandbox();
    const a = await request(app()).post('/api/v1/invoices').set(auth(key)).send(invoiceBody());
    await drain(workspace.id);
    await prisma.businessProfile.update({
      where: { workspaceId: workspace.id },
      data: { displayName: 'Renamed Co', invoiceFooter: 'New footer' },
    });
    await prisma.workspace.update({ where: { id: workspace.id }, data: { name: 'Renamed Co' } });
    const b = await request(app()).post('/api/v1/invoices').set(auth(key)).send(invoiceBody());
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);

    const docs = await prisma.issuedDocument.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
    });
    const snap = (i: number) =>
      (docs[i]!.snapshot as { business: { name: string; footer?: string } }).business;
    expect(snap(0).name).toBe('Acme Stores');
    expect(snap(0).footer).toBe('Thank you for your business');
    expect(snap(1).name).toBe('Renamed Co');
    expect(snap(1).footer).toBe('New footer');
    void user;
  });

  it('delivers channels independently: an unconnected Telegram recipient fails honestly while WhatsApp succeeds', async () => {
    const { key, workspace } = await sandbox();
    const res = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .send(invoiceBody({ channels: ['whatsapp', 'telegram'] }));
    expect(res.status).toBe(202);
    const tg = res.body.deliveries.find((d: { channel: string }) => d.channel === 'telegram');
    expect(tg.status).toBe('failed');
    expect(tg.error_code).toBe('telegram_not_connected');
    await drain(workspace.id);
    const rows = await prisma.delivery.findMany({ where: { workspaceId: workspace.id } });
    expect(rows.find((d) => d.channel === 'WHATSAPP')!.status).toBe('SANDBOX_SIMULATED');
    expect(rows.find((d) => d.channel === 'TELEGRAM')!.status).toBe('FAILED');
    expect(rows.find((d) => d.channel === 'TELEGRAM')!.attemptCount).toBe(0); // nothing was "sent"
  });

  it('isolates tenants and environments: another business, or a live key, cannot read a sandbox invoice', async () => {
    const a = await sandbox();
    const b = await sandbox();
    const live = await makeKey(a.workspace.id, a.user.id, 'LIVE');
    const created = await request(app())
      .post('/api/v1/invoices')
      .set(auth(a.key))
      .send(invoiceBody());
    expect(
      (await request(app()).get(`/api/v1/invoices/${created.body.id}`).set(auth(a.key))).status,
    ).toBe(200);
    expect(
      (await request(app()).get(`/api/v1/invoices/${created.body.id}`).set(auth(b.key))).status,
    ).toBe(404);
    expect(
      (await request(app()).get(`/api/v1/invoices/${created.body.id}`).set(auth(live.key))).status,
    ).toBe(404);
    expect(
      (
        await request(app())
          .get(`/api/v1/invoices/inv_${'a'.repeat(25)}`)
          .set(auth(a.key))
      ).status,
    ).toBe(404);
  });
});
