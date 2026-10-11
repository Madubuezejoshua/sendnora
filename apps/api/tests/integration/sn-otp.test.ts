import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { encryptSecret } from '@sendnaro/database/encryption';
import { app, auth, drain, makeBusiness, makeKey } from './sn-helpers.js';
import { otpPolicy } from '../../src/sendnaro/v1/otp.service.js';
import { setLiveProviderOverride } from '../../src/sendnaro/delivery/provider.js';
import { getTestEnv } from './setup.js';

const PHONE = '+2348012345678';
const stdPolicy = { ...otpPolicy };

afterEach(() => {
  Object.assign(otpPolicy, stdPolicy);
  setLiveProviderOverride(null);
});

async function sandbox() {
  const biz = await makeBusiness();
  const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
  return { ...biz, key };
}

const create = (key: string, body: Record<string, unknown> = {}) =>
  request(app()).post('/api/v1/otp/challenges').set(auth(key)).send({ phone: PHONE, purpose: 'login', customer_ref: 'cust_1', ...body });
const inbox = async (key: string, phone = PHONE) =>
  (await request(app()).get('/api/v1/sandbox/otp-inbox').query({ phone }).set(auth(key))).body.messages as [{ challenge_id: string; code: string }, ...{ challenge_id: string; code: string }[]];
const verify = (key: string, id: string, code: string, extra: Record<string, unknown> = {}) =>
  request(app()).post(`/api/v1/otp/challenges/${id}/verify`).set(auth(key)).send({ code, phone: PHONE, purpose: 'login', ...extra });

describe('WhatsApp OTP challenges', () => {
  it('creates a challenge, exposes the code only in the sandbox inbox, and verifies exactly once', async () => {
    const { key, workspace } = await sandbox();
    const res = await create(key);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    expect(JSON.stringify(res.body)).not.toMatch(/"code"/); // the API response never carries the code
    expect(res.body.phone).not.toContain('8012345678'); // recipient is masked

    await drain(workspace.id);
    const [{ code }] = await inbox(key);
    expect(code).toMatch(/^\d{6}$/);

    const ok = await verify(key, res.body.id, code);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('verified');

    const again = await verify(key, res.body.id, code);
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('otp_invalid'); // single use
  });

  it('handles wrong codes, attempt exhaustion and locks the challenge', async () => {
    const { key } = await sandbox();
    const res = await create(key);
    const [{ code }] = await inbox(key);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 1; i <= 4; i += 1) {
      const r = await verify(key, res.body.id, wrong);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('otp_invalid');
      expect(r.body.error.message).toContain(`${5 - i} attempt`);
    }
    const last = await verify(key, res.body.id, wrong);
    expect(last.body.error.code).toBe('otp_locked');
    // Even the correct code is refused once the attempt budget is spent.
    const afterLock = await verify(key, res.body.id, code);
    expect(afterLock.status).toBe(422);
    expect(afterLock.body.error.code).toBe('otp_locked');
  });

  it('rejects an expired code', async () => {
    const { key, workspace } = await sandbox();
    const res = await create(key);
    await prisma.otpChallenge.updateMany({ where: { workspaceId: workspace.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await verify(key, res.body.id, '123456');
    expect(r.body.error.code).toBe('otp_expired');
  });

  it('sandbox scenario expired_otp: never sent, delivery marked expired, verify says expired', async () => {
    const { key, workspace } = await sandbox();
    const res = await create(key, { scenario: 'expired_otp' });
    expect(res.status).toBe(202);
    await drain(workspace.id);
    const d = await prisma.delivery.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect(d.status).toBe('EXPIRED');
    expect(d.attemptCount).toBe(0);
    expect((await verify(key, res.body.id, '123456')).body.error.code).toBe('otp_expired');
  });

  it('enforces the resend cooldown and the per-recipient hourly cap (durable limits)', async () => {
    const { key } = await sandbox();
    expect((await create(key)).status).toBe(202);
    const cooled = await create(key);
    expect(cooled.status).toBe(429);
    expect(cooled.body.error.code).toBe('rate_limited');
    expect(Number(cooled.headers['retry-after'])).toBeGreaterThan(0);

    otpPolicy.resendCooldownSeconds = 0; // isolate the hourly cap
    otpPolicy.perRecipientPerHour = 3;
    const other = '+2348099900011';
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) codes.push((await create(key, { phone: other })).status);
    expect(codes).toEqual([202, 202, 202, 429]);
  });

  it('resend bumps the version: the old code stops working, the new one works', async () => {
    const { key, workspace } = await sandbox();
    const res = await create(key);
    await drain(workspace.id);
    const [{ code: v1 }] = await inbox(key);
    await prisma.otpChallenge.updateMany({ where: { workspaceId: workspace.id }, data: { lastSentAt: new Date(Date.now() - 60_000) } });

    const resend = await request(app()).post(`/api/v1/otp/challenges/${res.body.id}/resend`).set(auth(key));
    expect(resend.status).toBe(202);
    const [{ code: v2 }] = await inbox(key);
    expect(v2).not.toBe(v1);

    expect((await verify(key, res.body.id, v1)).body.error.code).toBe('otp_invalid');
    expect((await verify(key, res.body.id, v2)).status).toBe(200);
  });

  it('a new challenge for the same recipient + purpose supersedes the previous one', async () => {
    const { key, workspace } = await sandbox();
    const first = await create(key);
    otpPolicy.resendCooldownSeconds = 0;
    const second = await create(key);
    expect(second.status).toBe(202);
    const [{ code }] = await inbox(key);
    const stale = await verify(key, first.body.id, code);
    expect(stale.status).toBe(422);
    expect(stale.body.error.code).toBe('otp_expired');
    expect((await verify(key, second.body.id, code)).status).toBe(200);
    void workspace;
  });

  it('allows exactly one winner under concurrent verification of the correct code', async () => {
    const { key } = await sandbox();
    const res = await create(key);
    const [{ code }] = await inbox(key);
    const results = await Promise.all(Array.from({ length: 8 }, () => verify(key, res.body.id, code)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 422).length).toBe(7);
  });

  it('cannot be verified by another business, another environment, another recipient or another purpose', async () => {
    const a = await sandbox();
    const b = await sandbox();
    const liveKey = await makeKey(a.workspace.id, a.user.id, 'LIVE');
    const res = await create(a.key);
    const [{ code }] = await inbox(a.key);

    expect((await verify(b.key, res.body.id, code)).status).toBe(404); // other tenant
    expect((await verify(liveKey.key, res.body.id, code)).status).toBe(404); // same tenant, other environment
    expect((await verify(a.key, res.body.id, code, { phone: '+2348099900000' })).status).toBe(404); // other recipient
    expect((await verify(a.key, res.body.id, code, { purpose: 'account_recovery' })).status).toBe(404); // other purpose
    expect((await verify(a.key, res.body.id, code)).status).toBe(200); // the rightful caller still can
  });

  it('keeps live OTP secrets out of responses, history, queue payloads and webhooks', async () => {
    const biz = await makeBusiness();
    const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    await prisma.channelConnection.create({
      data: {
        workspaceId: biz.workspace.id, environment: 'LIVE', channel: 'WHATSAPP', status: 'CONNECTED',
        config: { phoneNumberId: '1234567890', templates: { otp: { name: 'otp', language: 'en' } } },
        secretCiphertext: encryptSecret(JSON.stringify({ accessToken: 't'.repeat(30), appSecret: 's'.repeat(20), verifyToken: 'v'.repeat(14) }), getTestEnv().APP_ENCRYPTION_KEY),
      },
    });
    let seenCode = '';
    setLiveProviderOverride((req) => {
      seenCode = req.otpCode ?? '';
      return { kind: 'accepted', providerMessageId: 'wamid.TEST' };
    });

    const res = await create(live.key);
    expect(res.status).toBe(202);
    await drain(biz.workspace.id);
    expect(seenCode).toMatch(/^\d{6}$/); // the provider boundary DID receive it...

    const everything = JSON.stringify([
      res.body,
      await prisma.delivery.findMany({ where: { workspaceId: biz.workspace.id } }),
      await prisma.outboxEvent.findMany({ where: { workspaceId: biz.workspace.id } }),
      await prisma.deliveryAttempt.findMany(),
      await prisma.merchantWebhookEvent.findMany({ where: { workspaceId: biz.workspace.id } }),
      (await request(app()).get(`/api/v1/deliveries/${(await prisma.delivery.findFirstOrThrow({ where: { workspaceId: biz.workspace.id } })).id.replace(/^/, 'dlv_')}`).set(auth(live.key))).body,
    ]);
    expect(everything).not.toContain(seenCode); // ...but it is stored nowhere
  });

  it('sandbox-only controls are inert for live keys', async () => {
    const biz = await makeBusiness();
    const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    const scenario = await create(live.key, { scenario: 'success' });
    expect(scenario.status).toBe(403);
    expect(scenario.body.error.code).toBe('sandbox_only');
    const inboxRes = await request(app()).get('/api/v1/sandbox/otp-inbox').set(auth(live.key));
    expect(inboxRes.status).toBe(403);
    expect(inboxRes.body.error.code).toBe('sandbox_only');
  });

  it('rejects a malformed phone number', async () => {
    const { key } = await sandbox();
    const res = await create(key, { phone: 'not-a-phone' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid_phone');
  });
});
