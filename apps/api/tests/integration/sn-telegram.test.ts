import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { app, auth, drain, invoiceBody, makeBusiness, makeKey } from './sn-helpers.js';

const SECRET = 'tg-secret-for-tests';
const botMessages: { chat_id: string | number; text?: string }[] = [];

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = '123:test';
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  botMessages.length = 0;
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.startsWith('https://api.telegram.org/')) return realFetch(url, init);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (u.endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'sendnaro_test_bot' } });
      botMessages.push(body);
      return Response.json({ ok: true, result: { message_id: botMessages.length } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

async function sandbox() {
  const biz = await makeBusiness();
  const { key } = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
  return { ...biz, key };
}
const linkToken = (key: string, body: Record<string, unknown> = {}) =>
  request(app()).post('/api/v1/telegram/link-tokens').set(auth(key)).send({ external_customer_id: 'customer_42', name: 'Test Customer', ...body });
const startSim = (key: string, token: string, chat = 'chat_1') =>
  request(app()).post('/api/v1/sandbox/telegram/start').set(auth(key)).send({ token, chat_id: chat });
const tokenOf = (url: string) => new URL(url).searchParams.get('start')!;

describe('Telegram linking and delivery', () => {
  it('issues an opaque deep link, links the right customer from a verified Start, then delivers an invoice', async () => {
    const { key, workspace } = await sandbox();
    const res = await linkToken(key);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=.{20,}$/);
    expect(res.body.url).not.toContain('customer_42'); // never a predictable id
    const stored = await prisma.telegramLinkToken.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect(stored.tokenHash).not.toContain(tokenOf(res.body.url)); // only a digest is stored

    expect((await startSim(key, tokenOf(res.body.url), 'chat_777')).status).toBe(200);
    const recipient = await prisma.recipient.findFirstOrThrow({ where: { workspaceId: workspace.id, externalCustomerId: 'customer_42' } });
    expect(recipient.telegramChatId).toBe('chat_777');

    const inv = await request(app()).post('/api/v1/invoices').set(auth(key)).send(invoiceBody({ channels: ['whatsapp', 'telegram'] }));
    expect(inv.status).toBe(202);
    await drain(workspace.id);
    const rows = await prisma.delivery.findMany({ where: { workspaceId: workspace.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((d) => d.status === 'SANDBOX_SIMULATED')).toBe(true); // two independent records, both simulated
    expect(rows.find((d) => d.channel === 'TELEGRAM')!.toAddress).toBe('chat_777');
  });

  it('rejects expired, replayed and tampered tokens', async () => {
    const { key, workspace } = await sandbox();
    const t1 = tokenOf((await linkToken(key)).body.url);
    await prisma.telegramLinkToken.updateMany({ where: { workspaceId: workspace.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await startSim(key, t1)).status).toBe(422); // expired

    const t2 = tokenOf((await linkToken(key)).body.url);
    expect((await startSim(key, t2)).status).toBe(200);
    const replay = await startSim(key, t2, 'chat_attacker');
    expect(replay.status).toBe(422); // replay of a used token
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: workspace.id } })).telegramChatId).toBe('chat_1');

    expect((await startSim(key, `${t2.slice(0, -2)}xx`)).status).toBe(422); // tampered
  });

  it('blocks cross-tenant linking: another business cannot consume a token it did not issue', async () => {
    const a = await sandbox();
    const b = await sandbox();
    const t = tokenOf((await linkToken(a.key)).body.url);
    expect((await startSim(b.key, t)).status).toBe(422);
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: a.workspace.id } })).telegramChatId).toBeNull();
  });

  it('refuses to silently re-link an already connected customer (account-takeover protection)', async () => {
    const { key } = await sandbox();
    await startSim(key, tokenOf((await linkToken(key)).body.url), 'chat_owner');
    const again = await linkToken(key);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_linked');
    const forced = await linkToken(key, { force_relink: true });
    expect(forced.status).toBe(201); // only the authenticated merchant can request a replacement
  });

  it('unlinks on request', async () => {
    const { key, workspace } = await sandbox();
    await startSim(key, tokenOf((await linkToken(key)).body.url), 'chat_9');
    expect((await request(app()).delete('/api/v1/telegram/links/customer_42').set(auth(key))).status).toBe(200);
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: workspace.id } })).telegramChatId).toBeNull();
  });

  it('real bot webhook: forged secret is rejected; a genuine Start links a LIVE customer; sandbox tokens cannot be consumed there', async () => {
    const biz = await makeBusiness();
    const live = await makeKey(biz.workspace.id, biz.user.id, 'LIVE');
    const sb = await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX');
    const update = (text: string, id = 424242) => ({ message: { text, chat: { id, type: 'private' } } });

    const liveLink = await linkToken(live.key); // no billing => allowed; bot token present via env
    expect(liveLink.status).toBe(201);
    const lt = tokenOf(liveLink.body.url);

    const forged = await request(app()).post('/api/v1/webhooks/telegram').set('X-Telegram-Bot-Api-Secret-Token', 'wrong').send(update(`/start ${lt}`));
    expect(forged.status).toBe(401);
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: biz.workspace.id, environment: 'LIVE' } })).telegramChatId).toBeNull();

    const sandboxToken = tokenOf((await linkToken(sb.key)).body.url);
    await request(app()).post('/api/v1/webhooks/telegram').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(update(`/start ${sandboxToken}`, 515151));
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: biz.workspace.id, environment: 'SANDBOX' } })).telegramChatId).toBeNull();

    const ok = await request(app()).post('/api/v1/webhooks/telegram').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(update(`/start ${lt}`));
    expect(ok.status).toBe(200);
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: biz.workspace.id, environment: 'LIVE' } })).telegramChatId).toBe('424242');
    expect(botMessages.some((m) => String(m.chat_id) === '424242' && /connected/i.test(m.text ?? ''))).toBe(true);

    // /stop is honoured
    await request(app()).post('/api/v1/webhooks/telegram').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(update('/stop', 424242));
    expect((await prisma.recipient.findFirstOrThrow({ where: { workspaceId: biz.workspace.id, environment: 'LIVE' } })).telegramChatId).toBeNull();
  });
});
