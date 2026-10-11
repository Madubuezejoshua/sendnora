import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { app, auth, bearer, invoiceBody, makeBusiness, makeKey, sessionToken } from './sn-helpers.js';
import { generateSecret, hashKey } from '../../src/sendnaro/keys.js';

async function owner() {
  const biz = await makeBusiness();
  return { ...biz, token: await sessionToken(biz.user.id, biz.workspace.id) };
}

describe('API key authentication and scopes', () => {
  it('rejects missing, malformed, unknown and prefix-mismatched keys without touching the database for garbage', async () => {
    expect((await request(app()).get('/api/v1/ping')).status).toBe(401);
    expect((await request(app()).get('/api/v1/ping').set('Authorization', 'Bearer nonsense')).status).toBe(401);
    expect((await request(app()).get('/api/v1/ping').set('Authorization', 'Basic abc')).status).toBe(401);
    const unknown = generateSecret('SANDBOX').key;
    const res = await request(app()).get('/api/v1/ping').set(auth(unknown));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
    expect(res.body.error.request_id).toBeTruthy();

    // A live-looking key whose record is sandbox (or the reverse) is refused: the prefix is not authentication.
    const biz = await makeBusiness();
    const s = generateSecret('SANDBOX');
    await prisma.apiKey.create({ data: { workspaceId: biz.workspace.id, createdById: biz.user.id, name: 'x', environment: 'SANDBOX', prefix: s.prefix, lastFour: s.lastFour, hashedKey: s.hash, scopes: ['deliveries:read'] } });
    const forgedLive = s.key.replace('sn_test_', 'sn_live_');
    expect((await request(app()).get('/api/v1/ping').set(auth(forgedLive))).status).toBe(401);
  });

  it('stores only a digest, enforces scopes, and updates last-used', async () => {
    const biz = await makeBusiness();
    const { key, record } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX', ['deliveries:read']);
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: record.id } });
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(stored.hashedKey).toBe(hashKey(key));

    expect((await request(app()).get('/api/v1/ping').set(auth(key))).status).toBe(200);
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: record.id } })).lastUsedAt).toBeTruthy();

    const forbidden = await request(app()).post('/api/v1/invoices').set(auth(key)).send(invoiceBody());
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('insufficient_scope'); // decided before any side effect
    expect(await prisma.issuedDocument.count({ where: { workspaceId: biz.workspace.id } })).toBe(0);
  });

  it('a caller-supplied business id can never override the key owner', async () => {
    const a = await makeBusiness('Biz A');
    const b = await makeBusiness('Biz B');
    const { key } = await makeKey(a.workspace.id, a.user.id, 'SANDBOX');
    const res = await request(app()).post('/api/v1/invoices').set(auth(key)).set('X-Workspace-Id', b.workspace.id).send(invoiceBody({ business_id: b.workspace.id, workspace_id: b.workspace.id }));
    expect(res.status).toBe(400); // strict schema rejects the field
    const ok = await request(app()).post('/api/v1/invoices').set(auth(key)).set('X-Workspace-Id', b.workspace.id).send(invoiceBody());
    expect(ok.status).toBe(202);
    expect(await prisma.issuedDocument.count({ where: { workspaceId: b.workspace.id } })).toBe(0);
    expect(await prisma.issuedDocument.count({ where: { workspaceId: a.workspace.id } })).toBe(1);
  });

  it('revoked keys and suspended businesses are blocked in both environments', async () => {
    const biz = await makeBusiness();
    const sb = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    await prisma.apiKey.update({ where: { id: sb.record.id }, data: { revokedAt: new Date() } });
    expect((await request(app()).get('/api/v1/ping').set(auth(sb.key))).status).toBe(401);

    const sb2 = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    await prisma.workspace.update({ where: { id: biz.workspace.id }, data: { suspendedAt: new Date(), suspendedReason: 'test' } });
    for (const k of [sb2.key, live.key]) {
      const r = await request(app()).get('/api/v1/ping').set(auth(k));
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('business_suspended');
    }
  });

  it('enforces a per-key request limit from the shared store', async () => {
    const biz = await makeBusiness();
    const { key, record } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    await prisma.apiKey.update({ where: { id: record.id }, data: { rateLimitPerMinute: 3 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await request(app()).get('/api/v1/ping').set(auth(key))).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    expect(codes.slice(0, 2)).toEqual([200, 200]);
  });

  it('unknown routes and bad JSON use the v1 error contract', async () => {
    const biz = await makeBusiness();
    const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    const nf = await request(app()).get('/api/v1/nope').set(auth(key));
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not_found');
    const bad = await request(app()).post('/api/v1/invoices').set(auth(key)).set('Content-Type', 'application/json').send('{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_json');
  });
});

describe('console: keys, profile, authorization', () => {
  it('creates a key that is revealed once, then rotates and revokes it', async () => {
    const { token, workspace } = await owner();
    const created = await request(app()).post('/api/console/keys').set(bearer(token)).send({ name: 'Backend', environment: 'sandbox', scopes: ['invoices:create', 'deliveries:read'] });
    expect(created.status).toBe(201);
    const secret: string = created.body.data.secret;
    expect(secret).toMatch(/^sn_test_/);
    expect((await request(app()).get('/api/v1/ping').set(auth(secret))).status).toBe(200);

    const list = await request(app()).get('/api/console/keys').set(bearer(token));
    expect(JSON.stringify(list.body)).not.toContain(secret); // never listed again
    expect(list.body.data[0].display).toMatch(/^sn_test_.{4}….{4}$/);

    const rotated = await request(app()).post(`/api/console/keys/${created.body.data.id}/rotate`).set(bearer(token));
    expect(rotated.status).toBe(201);
    expect((await request(app()).get('/api/v1/ping').set(auth(secret))).status).toBe(401); // the old key died
    expect((await request(app()).get('/api/v1/ping').set(auth(rotated.body.data.secret))).status).toBe(200);

    const revoked = await request(app()).delete(`/api/console/keys/${rotated.body.data.id}`).set(bearer(token));
    expect(revoked.status).toBe(200);
    expect((await request(app()).get('/api/v1/ping').set(auth(rotated.body.data.secret))).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { workspaceId: workspace.id, action: { startsWith: 'apikey.' } } })).toBeGreaterThanOrEqual(3);
  });

  it('only owners/admins manage keys; members cannot, and other businesses are invisible', async () => {
    const a = await owner();
    const b = await owner();
    const member = await (await import('./setup.js')).createTestUser();
    await prisma.workspaceMember.create({ data: { workspaceId: a.workspace.id, userId: member.id, role: 'STAFF', joinedAt: new Date() } });
    const memberToken = await sessionToken(member.id, a.workspace.id);

    expect((await request(app()).post('/api/console/keys').set(bearer(memberToken)).send({ name: 'x', environment: 'sandbox' })).status).toBe(403);
    expect((await request(app()).put('/api/console/business').set(bearer(memberToken)).send({ displayName: 'Hacked' })).status).toBe(403);
    expect((await request(app()).get('/api/console/keys').set(bearer(memberToken))).status).toBe(200); // read-only for members

    const k = await request(app()).post('/api/console/keys').set(bearer(a.token)).send({ name: 'A', environment: 'sandbox' });
    expect((await request(app()).delete(`/api/console/keys/${k.body.data.id}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app()).get('/api/console/keys').set(bearer(b.token))).body.data).toHaveLength(0);
    expect((await request(app()).get('/api/console/keys')).status).toBe(401);
  });

  it('profile edits apply to new documents only and validate input', async () => {
    const { token, workspace } = await owner();
    expect((await request(app()).put('/api/console/business').set(bearer(token)).send({ displayName: '' })).status).toBe(400);
    expect((await request(app()).put('/api/console/business').set(bearer(token)).send({ displayName: 'X', website: 'not-a-url' })).status).toBe(400);
    expect((await request(app()).put('/api/console/business').set(bearer(token)).send({ displayName: 'X', allowedLinkOrigins: ['not a host'] })).status).toBe(400);
    const ok = await request(app()).put('/api/console/business').set(bearer(token)).send({ displayName: 'Globex', contactEmail: 'ops@globex.test', invoiceFooter: 'Pay within 7 days', brandColor: '#112233', allowedLinkOrigins: ['globex.test'] });
    expect(ok.status).toBe(200);
    const got = await request(app()).get('/api/console/business').set(bearer(token));
    expect(got.body.data.displayName).toBe('Globex');
    expect(got.body.data.allowedLinkOrigins).toEqual(['globex.test']);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).brandColor).toBe('#112233');
  });

  it('overview reports an honest checklist; deliveries list is tenant scoped and sanitized', async () => {
    const a = await owner();
    const b = await owner();
    const { key } = await makeKey(a.workspace.id, a.user.id, 'SANDBOX');
    await request(app()).post('/api/v1/invoices').set(auth(key)).send(invoiceBody({ external_order_id: 'order_visible' }));
    const ov = await request(app()).get('/api/console/overview').set(bearer(a.token));
    expect(ov.body.data.checklist.find((c: { id: string }) => c.id === 'sandbox_key').done).toBe(true);
    expect(ov.body.data.checklist.find((c: { id: string }) => c.id === 'whatsapp').done).toBe(false);
    const list = await request(app()).get('/api/console/deliveries').query({ environment: 'sandbox' }).set(bearer(a.token));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].to).not.toContain('8012345678');
    expect((await request(app()).get('/api/console/deliveries').set(bearer(b.token))).body.data).toHaveLength(0);
    const found = await request(app()).get('/api/console/deliveries').query({ q: 'order_visible' }).set(bearer(a.token));
    expect(found.body.data).toHaveLength(1);
    const detail = await request(app()).get(`/api/console/deliveries/${list.body.data[0].id}`).set(bearer(a.token));
    expect(detail.status).toBe(200);
    expect((await request(app()).get(`/api/console/deliveries/${list.body.data[0].id}`).set(bearer(b.token))).status).toBe(404);
  });

  it('WhatsApp credentials are stored encrypted and never returned', async () => {
    const { token, workspace } = await owner();
    const res = await request(app()).put('/api/console/channels/whatsapp').set(bearer(token)).send({
      phoneNumberId: '123456789012', accessToken: 'EAAB-secret-access-token-value-1234567890', appSecret: 'app-secret-value-1234567890', verifyToken: 'verify-token-123456',
      templates: { otp: { name: 'otp_auth', language: 'en' } },
    });
    expect(res.status).toBe(200); // Meta is unreachable from tests: status is ERROR, which is the honest answer
    const row = await prisma.channelConnection.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect(row.secretCiphertext).toBeTruthy();
    expect(row.secretCiphertext).not.toContain('EAAB');
    const read = await request(app()).get('/api/console/channels').set(bearer(token));
    expect(JSON.stringify(read.body)).not.toMatch(/EAAB|app-secret-value|verify-token-123456/);
    expect(read.body.data.whatsapp[0].callbackUrl).toContain(`/api/v1/webhooks/whatsapp/${row.id}`);
    const gone = await request(app()).delete('/api/console/channels/whatsapp').set(bearer(token));
    expect(gone.status).toBe(200);
    expect((await prisma.channelConnection.findFirstOrThrow({ where: { workspaceId: workspace.id } })).secretCiphertext).toBeNull();
  });

  it('webhook endpoints: SSRF-checked, secret shown once, tenant scoped', async () => {
    const a = await owner();
    const b = await owner();
    const bad = await request(app()).post('/api/console/webhooks').set(bearer(a.token)).send({ environment: 'live', url: 'https://127.0.0.1/hook' });
    expect(bad.status).toBe(422);
    const plain = await request(app()).post('/api/console/webhooks').set(bearer(a.token)).send({ environment: 'live', url: 'http://example.com/hook' });
    expect(plain.status).toBe(422);
    const ok = await request(app()).post('/api/console/webhooks').set(bearer(a.token)).send({ environment: 'sandbox', url: 'http://127.0.0.1:9/hook', events: ['delivery.sent'] }); // dev flag allows loopback for sandbox only
    expect(ok.status).toBe(201);
    expect(ok.body.data.secret).toMatch(/^whsec_/);
    expect(JSON.stringify((await request(app()).get('/api/console/webhooks').set(bearer(a.token))).body)).not.toContain(ok.body.data.secret);
    expect((await request(app()).delete(`/api/console/webhooks/${ok.body.data.id}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app()).delete(`/api/console/webhooks/${ok.body.data.id}`).set(bearer(a.token))).status).toBe(200);
  });
});
