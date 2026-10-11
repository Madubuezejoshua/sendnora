import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp, setupWorkspaceContext } from './setup.js';

describe('invoice lifecycle', () => {
  it('creates a draft, issues it, records a full payment, and generates a receipt', async () => {
    const app = buildTestApp();
    const { token } = await setupWorkspaceContext();

    const customerRes = await request(app)
      .post('/api/legacy/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INDIVIDUAL', name: 'Lifecycle Customer', email: 'lifecycle@example.com' });
    expect(customerRes.status).toBe(201);

    const createRes = await request(app)
      .post('/api/legacy/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.data.id,
        currency: 'NGN',
        taxMode: 'EXCLUSIVE',
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          {
            description: 'Website build',
            quantity: 1,
            unitPriceMinorUnits: 10000,
            taxRatePercent: 0,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('DRAFT');
    const invoiceId = createRes.body.data.id;

    const issueRes = await request(app)
      .post(`/api/legacy/v1/invoices/${invoiceId}/issue`)
      .set('Authorization', `Bearer ${token}`);
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.data.status).toBe('ISSUED');

    const editAfterIssueRes = await request(app)
      .patch(`/api/legacy/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'should be rejected' });
    expect(editAfterIssueRes.status).toBe(409);

    const paymentRes = await request(app)
      .post(`/api/legacy/v1/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountMinorUnits: 10000, method: 'BANK_TRANSFER', paidAt: new Date().toISOString() });
    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.data.receipt.amountMinorUnits).toBe(10000);

    const finalInvoiceRes = await request(app)
      .get(`/api/legacy/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(finalInvoiceRes.body.data.status).toBe('PAID');
    expect(finalInvoiceRes.body.data.amountPaidMinorUnits).toBe(10000);
  });

  it('rejects a payment larger than the outstanding balance', async () => {
    const app = buildTestApp();
    const { token } = await setupWorkspaceContext();

    const customerRes = await request(app)
      .post('/api/legacy/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INDIVIDUAL', name: 'Overpay Customer' });

    const invoiceRes = await request(app)
      .post('/api/legacy/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.data.id,
        currency: 'NGN',
        taxMode: 'EXCLUSIVE',
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          { description: 'Small item', quantity: 1, unitPriceMinorUnits: 1000, taxRatePercent: 0 },
        ],
      });
    await request(app)
      .post(`/api/legacy/v1/invoices/${invoiceRes.body.data.id}/issue`)
      .set('Authorization', `Bearer ${token}`);

    const overpayRes = await request(app)
      .post(`/api/legacy/v1/invoices/${invoiceRes.body.data.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountMinorUnits: 999999, method: 'CASH', paidAt: new Date().toISOString() });
    expect(overpayRes.status).toBe(400);
  });

  it('enforces the FREE plan invoice quota', async () => {
    const app = buildTestApp();
    const { token } = await setupWorkspaceContext({ planCode: 'FREE' });

    const customerRes = await request(app)
      .post('/api/legacy/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INDIVIDUAL', name: 'Quota Customer' });

    for (let i = 0; i < 5; i++) {
      const invoiceRes = await request(app)
        .post('/api/legacy/v1/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId: customerRes.body.data.id,
          currency: 'NGN',
          taxMode: 'EXCLUSIVE',
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          lineItems: [
            { description: `Item ${i}`, quantity: 1, unitPriceMinorUnits: 1000, taxRatePercent: 0 },
          ],
        });
      const issueRes = await request(app)
        .post(`/api/legacy/v1/invoices/${invoiceRes.body.data.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      expect(issueRes.status).toBe(200);
    }

    const sixthInvoiceRes = await request(app)
      .post('/api/legacy/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.data.id,
        currency: 'NGN',
        taxMode: 'EXCLUSIVE',
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          { description: 'Sixth item', quantity: 1, unitPriceMinorUnits: 1000, taxRatePercent: 0 },
        ],
      });
    const sixthIssueRes = await request(app)
      .post(`/api/legacy/v1/invoices/${sixthInvoiceRes.body.data.id}/issue`)
      .set('Authorization', `Bearer ${token}`);
    expect(sixthIssueRes.status).toBe(402);
    expect(sixthIssueRes.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });
});
