import { prisma, Prisma, type ApiEnvironment } from '@invoicetap/database';
import { decryptSecret } from '@invoicetap/database/encryption';
import { parseApiEnv } from '@invoicetap/config/env';
import { enqueue, registerJob, RetryLater } from '../outbox.js';
import { publicId } from '../ids.js';
import { SIGNATURE_HEADER, signPayload } from './signing.js';
import { safeRequest } from './ssrf.js';

export const WEBHOOK_EVENT_TYPES = [
  'invoice.generated',
  'invoice.failed',
  'delivery.sent',
  'delivery.delivered',
  'delivery.failed',
  'otp.verified',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Retry ladder for merchant callbacks. A failing callback NEVER re-sends the customer message. */
export const webhookRetryPolicy = {
  maxAttempts: 8,
  delaysMs: [30_000, 120_000, 600_000, 1_800_000, 3_600_000, 10_800_000, 21_600_000],
  timeoutMs: 10_000,
};

/**
 * Records an event and one delivery per subscribed endpoint, plus the outbox jobs, inside the caller's
 * transaction. `data` must be sanitized (ids and outcomes only): never an OTP code, secret or message body.
 */
export async function emitWebhookEvent(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    environment: ApiEnvironment;
    type: WebhookEventType;
    data: Record<string, unknown>;
    /** Limit to one endpoint (the console's "send test event"). */
    onlyEndpointId?: string;
  },
): Promise<void> {
  const endpoints = await tx.merchantWebhookEndpoint.findMany({
    where: {
      workspaceId: input.workspaceId,
      environment: input.environment,
      active: true,
      ...(input.onlyEndpointId ? { id: input.onlyEndpointId } : {}),
    },
  });
  const subscribed = endpoints.filter(
    (e) => e.events.length === 0 || e.events.includes('*') || e.events.includes(input.type),
  );
  if (subscribed.length === 0) return;

  const event = await tx.merchantWebhookEvent.create({
    data: {
      workspaceId: input.workspaceId,
      environment: input.environment,
      type: input.type,
      data: input.data as Prisma.InputJsonValue,
    },
  });
  for (const endpoint of subscribed) {
    const delivery = await tx.merchantWebhookDelivery.create({
      data: { eventId: event.id, endpointId: endpoint.id },
    });
    await enqueue(tx, {
      type: 'webhook.deliver',
      payload: { deliveryId: delivery.id },
      workspaceId: input.workspaceId,
      environment: input.environment,
      dedupeKey: `webhook:${delivery.id}:1`,
    });
  }
}

export function buildWebhookBody(event: {
  id: string;
  type: string;
  environment: ApiEnvironment;
  createdAt: Date;
  data: unknown;
}): string {
  return JSON.stringify({
    id: publicId('webhookEvent', event.id),
    object: 'event',
    type: event.type,
    created: Math.floor(event.createdAt.getTime() / 1000),
    livemode: event.environment === 'LIVE',
    data: event.data,
  });
}

export async function deliverWebhook(deliveryId: string): Promise<void> {
  const env = parseApiEnv();
  const delivery = await prisma.merchantWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { event: true, endpoint: true },
  });
  if (!delivery || delivery.status === 'SUCCEEDED' || delivery.status === 'FAILED') return;
  if (!delivery.endpoint.active) {
    await prisma.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', lastError: 'endpoint_disabled' },
    });
    return;
  }

  const rawBody = buildWebhookBody({ ...delivery.event });
  const secret = decryptSecret(delivery.endpoint.secretCiphertext, env.APP_ENCRYPTION_KEY);
  const attemptNo = delivery.attemptCount + 1;
  const started = Date.now();
  let responseStatus: number | undefined;
  let error: string | undefined;

  try {
    const res = await safeRequest(delivery.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Sendnaro-Webhooks/1',
        [SIGNATURE_HEADER]: signPayload(secret, rawBody),
        'Sendnaro-Event-Id': publicId('webhookEvent', delivery.event.id),
      },
      body: rawBody,
      timeoutMs: webhookRetryPolicy.timeoutMs,
      allowLocal: env.ALLOW_LOCAL_WEBHOOK_TARGETS && delivery.endpoint.environment === 'SANDBOX',
    });
    responseStatus = res.status;
    if (res.status < 200 || res.status >= 300) error = `http_${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 120) : 'request_failed';
  }

  const succeeded = !error;
  const exhausted = !succeeded && attemptNo >= webhookRetryPolicy.maxAttempts;
  await prisma.$transaction([
    prisma.merchantWebhookAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNo,
        responseStatus,
        error,
        durationMs: Date.now() - started,
      },
    }),
    prisma.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attemptCount: attemptNo,
        lastStatus: responseStatus,
        lastError: error ?? null,
        status: succeeded ? 'SUCCEEDED' : exhausted ? 'FAILED' : 'RETRYING',
      },
    }),
    ...(succeeded
      ? [
          prisma.merchantWebhookEndpoint.update({
            where: { id: delivery.endpointId },
            data: { lastSuccessAt: new Date() },
          }),
        ]
      : []),
  ]);

  if (!succeeded && !exhausted) {
    const delays = webhookRetryPolicy.delaysMs;
    throw new RetryLater(delays[Math.min(attemptNo - 1, delays.length - 1)]!, error);
  }
}

registerJob('webhook.deliver', async (payload) => {
  await deliverWebhook(String(payload.deliveryId));
});
