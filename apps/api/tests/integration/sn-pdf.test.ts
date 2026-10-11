import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { app, auth, drain, invoiceBody, makeBusiness, makeKey } from './sn-helpers.js';
import { getStorageProvider } from '../../src/services/storage/storage.service.js';

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    // Runs in different fonts arrive as separate items; join them without inventing spaces inside a word.
    text += (await page.getTextContent()).items.map((it) => ('str' in it ? it.str + (it.hasEOL ? ' ' : '') : '')).join('') + '\n';
  }
  return text.normalize('NFC').replace(/\s+/g, ' ');
}

describe('generated documents', () => {
  it('contain the issue-time business, customer, items, totals, payment status and the sandbox watermark', async () => {
    const biz = await makeBusiness('Acme Stores');
    const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    const res = await request(app()).post('/api/v1/invoices').set(auth(key)).send(
      invoiceBody({
        items: [
          { description: 'Standing desk', quantity: 2, unit_amount_minor: 1250000, tax_rate_percent: 7.5 },
          { description: 'Cable kit', quantity: 1, unit_amount_minor: 450050 },
        ],
        customer: { external_customer_id: 'c1', name: 'José Ọláwálé', whatsapp_phone: '+2348012345678' },
        payment: { status: 'paid', reference: 'PAY-REF-778' },
      }),
    );
    await drain(biz.workspace.id);
    const doc = await prisma.issuedDocument.findFirstOrThrow({ where: { id: res.body.id.replace('inv_', '') } });
    const pdf = await (getStorageProvider() as unknown as { readObject(k: string): Promise<Buffer> }).readObject(doc.pdfStorageKey!);
    const text = await pdfText(pdf);
    const evidence = path.resolve(process.cwd(), '../../test-evidence');
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'sandbox-receipt.pdf'), pdf);
    fs.writeFileSync(path.join(evidence, 'sandbox-receipt.txt'), text);

    for (const expected of ['RECEIPT', doc.number, 'Acme Stores', '1 Marina Road', 'José Ọláwálé', 'Standing desk', 'Cable kit', 'PAID', 'PAY-REF-778', 'Thank you for your business', 'Delivered with Sendnaro']) {
      expect(text, `missing "${expected}"`).toContain(expected);
    }
    // 2 x 12,500.00 + 4,500.50 = 29,500.50 ; 7.5% tax on the first line = 1,875.00 ; total 31,375.50
    expect(text).toContain('NGN 29,500.50');
    expect(text).toContain('NGN 1,875.00');
    expect(text).toContain('NGN 31,375.50');
    expect(text).toContain('SANDBOX - NOT A REAL TRANSACTION');

  });

  it('an unpaid invoice never says paid and shows a balance due', async () => {
    const biz = await makeBusiness();
    const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    const res = await request(app()).post('/api/v1/invoices').set(auth(key)).send(
      invoiceBody({ document_type: 'invoice', payment: { status: 'unpaid' }, due_date: '2026-12-31' }),
    );
    await drain(biz.workspace.id);
    const doc = await prisma.issuedDocument.findFirstOrThrow({ where: { id: res.body.id.replace('inv_', '') } });
    const text = await pdfText(await (getStorageProvider() as unknown as { readObject(k: string): Promise<Buffer> }).readObject(doc.pdfStorageKey!));
    expect(text).toContain('INVOICE');
    expect(text).toContain('UNPAID');
    expect(text).toContain('Balance due');
    expect(text).not.toMatch(/\bPAID\b(?! *$)(?<!UN)PAID/);
    expect(text).not.toContain('Amount paid');
  });
});
