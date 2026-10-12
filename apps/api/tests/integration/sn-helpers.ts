import http from 'node:http';
import { prisma, type ApiEnvironment } from '@sendnaro/database';
import { encryptSecret } from '@sendnaro/database/encryption';
import { API_SCOPES, generateSecret } from '../../src/sendnaro/keys.js';
import { drainOutbox } from '../../src/sendnaro/jobs.js';
import { buildTestApp, createTestUser, createTestWorkspace, getTestEnv } from './setup.js';

export const app = () => buildTestApp();

/** A fresh, isolated business (tenant) with an owner. */
export async function makeBusiness(name = 'Acme Stores') {
  const user = await createTestUser();
  const workspace = await createTestWorkspace(user.id, { name });
  await prisma.businessProfile.update({
    where: { workspaceId: workspace.id },
    data: {
      displayName: name,
      contactEmail: 'billing@acme.test',
      addressText: '1 Marina Road\nLagos',
      invoiceFooter: 'Thank you for your business',
      allowedLinkOrigins: ['acme.test'],
    },
  });
  return { user, workspace };
}

export async function makeKey(
  workspaceId: string,
  userId: string,
  environment: ApiEnvironment,
  scopes: readonly string[] = API_SCOPES,
) {
  const s = generateSecret(environment);
  const record = await prisma.apiKey.create({
    data: {
      workspaceId,
      createdById: userId,
      name: `${environment} key`,
      environment,
      prefix: s.prefix,
      lastFour: s.lastFour,
      hashedKey: s.hash,
      scopes: [...scopes],
    },
  });
  return { key: s.key, record };
}

export const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

/** Runs every due job for ONE business (jobs scheduled in the future are pulled forward). */
export async function drain(workspaceId: string, rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await prisma.outboxEvent.updateMany({
      where: { workspaceId, status: 'PENDING', runAt: { gt: new Date() } },
      data: { runAt: new Date() },
    });
    const { processed } = await drainOutbox({ workspaceId, maxRounds: 5 });
    if (processed === 0) break;
  }
}

export function invoiceBody(overrides: Record<string, unknown> = {}) {
  return {
    external_order_id: `order_${Math.random().toString(36).slice(2, 10)}`,
    document_type: 'receipt',
    payment: { status: 'paid', reference: 'merchant_payment_1' },
    customer: {
      external_customer_id: 'customer_42',
      name: 'Test Customer',
      whatsapp_phone: '+2348012345678',
    },
    currency: 'NGN',
    items: [{ description: 'Sample purchase', quantity: 1, unit_amount_minor: 500000 }],
    channels: ['whatsapp'],
    consent: { whatsapp_transactional: true },
    ...overrides,
  };
}

/** A real local HTTP receiver for outgoing webhooks (sandbox endpoints may target localhost in tests). */
export async function startReceiver(statusFor: (n: number) => number = () => 200) {
  const received: { raw: string; headers: http.IncomingHttpHeaders }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ raw: Buffer.concat(chunks).toString('utf8'), headers: req.headers });
      res.statusCode = statusFor(received.length);
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export async function addWebhookEndpoint(
  workspaceId: string,
  environment: ApiEnvironment,
  url: string,
  secret = 'whsec_testsecret',
) {
  const row = await prisma.merchantWebhookEndpoint.create({
    data: {
      workspaceId,
      environment,
      url,
      events: ['*'],
      secretCiphertext: encryptSecret(secret, getTestEnv().APP_ENCRYPTION_KEY),
    },
  });
  return { row, secret };
}

/** Live sends need a connected sender. Credentials here are fixtures; no real provider is ever called. */
export async function connectWhatsApp(workspaceId: string) {
  return prisma.channelConnection.upsert({
    where: {
      workspaceId_environment_channel: { workspaceId, environment: 'LIVE', channel: 'WHATSAPP' },
    },
    create: {
      workspaceId,
      environment: 'LIVE',
      channel: 'WHATSAPP',
      status: 'CONNECTED',
      config: {
        phoneNumberId: '1234567890',
        templates: {
          otp: { name: 'otp', language: 'en' },
          invoice: { name: 'inv', language: 'en' },
          notification: { name: 'note', language: 'en' },
        },
      },
      secretCiphertext: encryptSecret(
        JSON.stringify({
          accessToken: 't'.repeat(30),
          appSecret: 's'.repeat(20),
          verifyToken: 'v'.repeat(14),
        }),
        getTestEnv().APP_ENCRYPTION_KEY,
      ),
    },
    update: { status: 'CONNECTED' },
  });
}

/** Session token as apps/web would mint it after Auth.js validated a session. */
export async function sessionToken(userId: string, workspaceId?: string, isPlatformAdmin = false) {
  const { mintToken } = await import('./setup.js');
  return mintToken(userId, workspaceId, isPlatformAdmin);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
