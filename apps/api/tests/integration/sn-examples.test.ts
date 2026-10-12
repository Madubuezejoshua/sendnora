import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Server } from 'node:http';
import path from 'node:path';
import { prisma } from '@sendnaro/database';
import { app, drain, makeBusiness, makeKey } from './sn-helpers.js';
import { configFromEnv, sendnaro, SendnaroError } from '../../../../examples/node/client.js';
import { createReceiptForPaidOrder } from '../../../../examples/node/create-invoice.js';
import {
  confirmPhoneVerification,
  readSandboxInbox,
  startPhoneVerification,
} from '../../../../examples/node/otp.js';
import {
  createTelegramLink,
  simulateTelegramStart,
  unlinkTelegram,
} from '../../../../examples/node/telegram.js';
import {
  getDelivery,
  sendOrderConfirmation,
} from '../../../../examples/node/deliveries-and-notifications.js';
import {
  handleSendnaroWebhook,
  verifySendnaroSignature,
} from '../../../../examples/node/verify-webhook.js';
import { signPayload } from '../../src/sendnaro/webhooks/signing.js';

const run = promisify(execFile); // async: the server under test lives in this same process

/** Runs the exact files published in /docs against a real HTTP server, so the documentation cannot drift. */
let server: Server;
let baseUrl: string;
let workspaceId: string;
let key: string;

beforeAll(async () => {
  const biz = await makeBusiness();
  workspaceId = biz.workspace.id;
  key = (await makeKey(biz.workspace.id, biz.user.id, 'SANDBOX')).key;
  await new Promise<void>((resolve) => {
    server = app().listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const cfg = () => ({ apiKey: key, baseUrl });

describe('published examples run against the real API', () => {
  it('curl: examples/curl/create-invoice.sh', async () => {
    const script = path.resolve(process.cwd(), '../../examples/curl/create-invoice.sh');
    const env = { ...process.env, SENDNARO_API_KEY: key, SENDNARO_BASE_URL: baseUrl };
    const body = JSON.parse((await run('bash', [script], { env })).stdout);
    expect(body.object).toBe('invoice');
    expect(body.amounts.total_minor).toBe(500000);
    expect(body.deliveries[0].channel).toBe('whatsapp');
    // the example's Idempotency-Key is stable: running it twice yields the same invoice
    const again = JSON.parse((await run('bash', [script], { env })).stdout);
    expect(again.id).toBe(body.id);
  });

  it('node: create a receipt for a paid order, then read the delivery', async () => {
    const r = await createReceiptForPaidOrder(cfg(), {
      id: 'order_node_1',
      paymentReference: 'pay_1',
      customerId: 'cust_n1',
      customerName: 'Node Customer',
      whatsappPhone: '+2348012345678',
      currency: 'NGN',
      items: [{ description: 'Widget', quantity: 2, unitAmountMinor: 150000 }],
    });
    expect(r.httpStatus).toBe(202);
    await drain(workspaceId);
    const d = await getDelivery(cfg(), r.deliveries[0]!.id);
    expect(d.status).toBe('sandbox_simulated');
  });

  it('node: OTP start -> read sandbox inbox -> confirm; wrong code is reported, not thrown', async () => {
    const phone = '+2348023456789';
    const { challengeId } = await startPhoneVerification(cfg(), phone, 'user_1');
    const [msg] = await readSandboxInbox(cfg(), phone);
    expect(msg!.challenge_id).toBe(challengeId);
    const wrong = await confirmPhoneVerification(
      cfg(),
      challengeId,
      phone,
      msg!.code === '000000' ? '111111' : '000000',
    );
    expect(wrong).toMatchObject({ verified: false, reason: 'otp_invalid' });
    expect(await confirmPhoneVerification(cfg(), challengeId, phone, msg!.code)).toEqual({
      verified: true,
    });
  });

  it('node: Telegram link -> simulated Start -> unlink', async () => {
    const link = await createTelegramLink(cfg(), 'cust_tg', 'Telegram Customer');
    expect(link.url).toMatch(/^https:\/\/t\.me\//);
    await simulateTelegramStart(cfg(), new URL(link.url).searchParams.get('start')!);
    expect(
      (
        await prisma.recipient.findFirstOrThrow({
          where: { workspaceId, externalCustomerId: 'cust_tg' },
        })
      ).telegramChatId,
    ).toBe('sandbox_chat_1');
    await unlinkTelegram(cfg(), 'cust_tg');
    expect(
      (
        await prisma.recipient.findFirstOrThrow({
          where: { workspaceId, externalCustomerId: 'cust_tg' },
        })
      ).telegramChatId,
    ).toBeNull();
  });

  it('node: notification and error handling (SendnaroError carries code and request id)', async () => {
    const deliveries = await sendOrderConfirmation(
      cfg(),
      'cust_n2',
      'Ada',
      '+2348012345678',
      'A-100',
    );
    expect(deliveries[0]!.channel).toBe('whatsapp');
    await expect(
      sendnaro(cfg(), 'GET', '/deliveries/dlv_doesnotexistdoesnotexist'),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    try {
      await sendnaro({ apiKey: 'sn_test_' + 'x'.repeat(43), baseUrl }, 'GET', '/ping');
    } catch (err) {
      expect(err).toBeInstanceOf(SendnaroError);
      expect((err as SendnaroError).requestId).toBeTruthy();
    }
    expect(() => configFromEnv()).toThrow(/SENDNARO_API_KEY/);
  });

  it('node: webhook verification example accepts good signatures and rejects replays/tampering', () => {
    const secret = 'whsec_example';
    const raw = Buffer.from(
      JSON.stringify({ id: 'evt_abc', type: 'delivery.delivered', data: {} }),
    );
    const header = signPayload(secret, raw.toString('utf8'));
    expect(verifySendnaroSignature(secret, raw, header)).toBe(true);
    expect(handleSendnaroWebhook(secret, raw, header)).toBe(200);
    expect(handleSendnaroWebhook(secret, raw, header)).toBe(200); // duplicate delivery is absorbed
    expect(handleSendnaroWebhook(secret, Buffer.from('{"tampered":1}'), header)).toBe(401);
    expect(
      verifySendnaroSignature(secret, raw, signPayload(secret, raw.toString('utf8'), 1_000_000)),
    ).toBe(false);
  });
});
