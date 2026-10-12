import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import yaml from 'js-yaml';
import request from 'supertest';
import { app, auth, drain, invoiceBody, makeBusiness, makeKey } from './sn-helpers.js';
import { sendnaroV1Router } from '../../src/sendnaro/v1/routes.js';

const spec = yaml.load(fs.readFileSync(path.resolve(process.cwd(), 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
};

function documentedRoutes(): string[] {
  const out: string[] = [];
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) {
      if (['get', 'post', 'delete', 'put', 'patch'].includes(method)) {
        out.push(`${method.toUpperCase()} ${p.replace(/\{([^}]+)\}/g, ':$1')}`);
      }
    }
  }
  return out.sort();
}

function implementedRoutes(): string[] {
  const out: string[] = [];
  for (const layer of (
    sendnaroV1Router as unknown as {
      stack: { route?: { path: string; methods: Record<string, boolean> } }[];
    }
  ).stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods))
      out.push(`${method.toUpperCase()} ${layer.route.path}`);
  }
  return out.sort();
}

// OpenAPI path parameter names are snake_case in the document and camelCase in code: compare shapes only.
const normalise = (r: string) => r.replace(/:[A-Za-z_]+/g, ':id');

const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
const validator = (name: string) =>
  ajv.compile({ $ref: `#/components/schemas/${name}`, components: spec.components } as never);

describe('OpenAPI document matches the implementation', () => {
  it('documents exactly the routes that are mounted (no more, no fewer)', () => {
    expect(documentedRoutes().map(normalise)).toEqual(implementedRoutes().map(normalise));
  });

  it('real responses satisfy the published schemas', async () => {
    const biz = await makeBusiness();
    const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    const check = (schema: string, body: unknown) => {
      const v = validator(schema);
      expect(v(body), `${schema}: ${JSON.stringify(v.errors)} for ${JSON.stringify(body)}`).toBe(
        true,
      );
    };

    const inv = await request(app())
      .post('/api/v1/invoices')
      .set(auth(key))
      .send(invoiceBody({ channels: ['whatsapp', 'telegram'] }));
    expect(inv.status).toBe(202);
    check('Invoice', inv.body);
    await drain(biz.workspace.id);
    const got = await request(app()).get(`/api/v1/invoices/${inv.body.id}`).set(auth(key));
    check('Invoice', got.body);
    expect(got.body.pdf.url).toBeTruthy();

    const delivery = await request(app())
      .get(`/api/v1/deliveries/${inv.body.deliveries[0].id}`)
      .set(auth(key));
    check('Delivery', delivery.body);

    const otp = await request(app())
      .post('/api/v1/otp/challenges')
      .set(auth(key))
      .send({ phone: '+2348012345678', purpose: 'login' });
    check('OtpChallenge', otp.body);
    const code = (await request(app()).get('/api/v1/sandbox/otp-inbox').set(auth(key))).body
      .messages[0].code;
    const verified = await request(app())
      .post(`/api/v1/otp/challenges/${otp.body.id}/verify`)
      .set(auth(key))
      .send({ code, phone: '+2348012345678', purpose: 'login' });
    check('OtpChallenge', verified.body);

    const note = await request(app())
      .post('/api/v1/notifications')
      .set(auth(key))
      .send({
        type: 'order_confirmation',
        customer: { external_customer_id: 'c9', name: 'Ada', whatsapp_phone: '+2348012345678' },
        channels: ['whatsapp'],
        fields: { order_reference: 'X1' },
        consent: { whatsapp_transactional: true },
      });
    check('Notification', note.body);

    const link = await request(app())
      .post('/api/v1/telegram/link-tokens')
      .set(auth(key))
      .send({ external_customer_id: 'c9' });
    check('LinkToken', link.body);

    for (const r of [
      await request(app()).get('/api/v1/ping'),
      await request(app()).post('/api/v1/invoices').set(auth(key)).send({}),
      await request(app()).get('/api/v1/invoices/inv_nope').set(auth(key)),
    ]) {
      check('Error', r.body);
    }
  });
});
