import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@sendnaro/database';
import { buildTestApp, setupWorkspaceContext } from './setup.js';
import { sendTelegramToCustomer } from '../../src/services/telegram/telegram.service.js';

const SECRET = 'test-telegram-secret';
const sentMessages: { chat_id: string | number; text: string }[] = [];

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = '123:test';
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  sentMessages.length = 0;
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.startsWith('https://api.telegram.org/')) return realFetch(url, init);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (u.endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'testbot' } });
      sentMessages.push(body);
      return Response.json({ ok: true, result: { message_id: sentMessages.length } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

describe('telegram channel', () => {
  it('links a customer via the deep link, delivers a message, and honours /stop', async () => {
    const app = buildTestApp();
    const { workspace, token } = await setupWorkspaceContext();
    const customer = await prisma.customer.create({
      data: { workspaceId: workspace.id, name: 'Ada', email: 'ada@example.com' },
    });
    const chatId = Math.floor(Math.random() * 1e9) + 1e9;

    // 1. not linked yet → nothing is sent
    expect(
      await sendTelegramToCustomer({
        workspaceId: workspace.id,
        customerId: customer.id,
        text: 'hi',
      }),
    ).toEqual({ sent: false, reason: 'not_linked' });

    // 2. staff generates the one-time deep link
    const linkRes = await request(app)
      .post(`/api/legacy/v1/customers/${customer.id}/telegram-link`)
      .set('Authorization', `Bearer ${token}`);
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.data.url).toMatch(/^https:\/\/t\.me\/testbot\?start=.+/);
    const linkToken = new URL(linkRes.body.data.url).searchParams.get('start');

    // 3. webhook must be authenticated
    const update = (text: string) => ({ message: { text, chat: { id: chatId, type: 'private' } } });
    const bad = await request(app)
      .post('/api/v1/webhooks/telegram')
      .send(update(`/start ${linkToken}`));
    expect(bad.status).toBe(401);

    // 4. customer taps the link → chat is stored, token is burned
    const start = await request(app)
      .post('/api/v1/webhooks/telegram')
      .set('X-Telegram-Bot-Api-Secret-Token', SECRET)
      .send(update(`/start ${linkToken}`));
    expect(start.status).toBe(200);
    const linked = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(linked.telegramChatId).toBe(String(chatId));
    expect(linked.telegramLinkToken).toBeNull();
    expect(sentMessages.at(-1)?.text).toContain('Hi Ada');

    // 5. now delivery works and is recorded
    expect(
      await sendTelegramToCustomer({
        workspaceId: workspace.id,
        customerId: customer.id,
        text: 'Invoice ready',
      }),
    ).toEqual({ sent: true });
    const delivery = await prisma.messageDelivery.findFirstOrThrow({
      where: { workspaceId: workspace.id, channel: 'TELEGRAM' },
    });
    expect(delivery.status).toBe('SENT');

    // 6. /stop opts out
    await request(app)
      .post('/api/v1/webhooks/telegram')
      .set('X-Telegram-Bot-Api-Secret-Token', SECRET)
      .send(update('/stop'));
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).telegramChatId,
    ).toBeNull();
  });

  it('cannot link a customer in another workspace', async () => {
    const app = buildTestApp();
    const a = await setupWorkspaceContext();
    const b = await setupWorkspaceContext();
    const customerB = await prisma.customer.create({
      data: { workspaceId: b.workspace.id, name: 'Bob' },
    });
    const res = await request(app)
      .post(`/api/legacy/v1/customers/${customerB.id}/telegram-link`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(404);
  });
});
