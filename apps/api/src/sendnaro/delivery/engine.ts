import { prisma, Prisma, type Delivery, type DeliveryStatus } from '@invoicetap/database';
import { AppError } from '@invoicetap/shared';
import { logger } from '../../config/logger.js';
import { getStorageProvider } from '../../services/storage/storage.service.js';
import { assertCanSend } from '../entitlement.js';
import { backoffMs, enqueue, registerJob, RetryLater } from '../outbox.js';
import { publicId } from '../ids.js';
import { computeOtpCode } from '../otp/code.js';
import { emitWebhookEvent, type WebhookEventType } from '../webhooks/dispatch.js';
import {
  getLiveProviderOverride,
  type ChannelProvider,
  type ProviderOutcome,
  type SendRequest,
} from './provider.js';
import { sandboxProvider } from './sandbox.provider.js';
import { telegramProvider } from './telegram.provider.js';
import { whatsappProvider } from './whatsapp.provider.js';

export const deliveryPolicy = {
  maxAttempts: 6,
  retryBaseMs: 2_000,
  retryCapMs: 15 * 60_000,
  /** How long to wait for a late provider receipt after an ambiguous timeout before giving up. */
  reconcileGraceMs: 10 * 60_000,
  /** Sandbox: delay before the simulated provider receipt arrives. */
  sandboxReceiptDelayMs: 3_000,
  pdfUrlTtlSeconds: 15 * 60,
};

// Forward-only ranking so late or duplicated provider receipts can never move a delivery backwards.
const RANK: Partial<Record<DeliveryStatus, number>> = {
  QUEUED: 0,
  PROCESSING: 1,
  RETRYING: 1,
  PROVIDER_ACCEPTED: 2,
  SANDBOX_SIMULATED: 2,
  SENT: 3,
  DELIVERED: 4,
  READ: 5,
};
const TERMINAL: DeliveryStatus[] = ['FAILED', 'EXPIRED', 'BLOCKED'];
const SETTLED: DeliveryStatus[] = [...TERMINAL, 'PROVIDER_ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'SANDBOX_SIMULATED'];

function deliveryEventData(d: Delivery, extra: Record<string, unknown> = {}) {
  return {
    delivery_id: publicId('delivery', d.id),
    channel: d.channel.toLowerCase(),
    kind: d.kind.toLowerCase(),
    status: d.status.toLowerCase(),
    simulated: d.simulated,
    invoice_id: d.invoiceId ? publicId('invoice', d.invoiceId) : undefined,
    challenge_id: d.otpChallengeId ? publicId('otp', d.otpChallengeId) : undefined,
    error_code: d.lastErrorCode ?? undefined,
    ...extra,
  };
}

async function finish(
  deliveryId: string,
  data: Prisma.DeliveryUpdateInput,
  event?: WebhookEventType,
  guard: Prisma.DeliveryWhereInput = {},
): Promise<Delivery | null> {
  return prisma.$transaction(async (tx) => {
    const res = await tx.delivery.updateMany({
      where: { id: deliveryId, ...guard },
      data: data as Prisma.DeliveryUpdateManyMutationInput,
    });
    if (res.count === 0) return null;
    const updated = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    if (event) {
      await emitWebhookEvent(tx, {
        workspaceId: updated.workspaceId,
        environment: updated.environment,
        type: event,
        data: deliveryEventData(updated),
      });
    }
    return updated;
  });
}

export function resolveProvider(delivery: Delivery): ChannelProvider {
  if (delivery.environment === 'SANDBOX') return sandboxProvider;
  const override = getLiveProviderOverride();
  if (override) return { name: 'test-transport', send: async (r) => override(r) };
  return delivery.channel === 'WHATSAPP' ? whatsappProvider : telegramProvider;
}

async function buildRequest(delivery: Delivery, attemptNo: number): Promise<SendRequest | { skip: DeliveryStatus; code: string }> {
  const base: SendRequest = {
    deliveryId: delivery.id,
    workspaceId: delivery.workspaceId,
    environment: delivery.environment,
    channel: delivery.channel,
    kind: delivery.kind,
    toAddress: delivery.toAddress,
    templateKey: delivery.templateKey,
    attemptNo,
    scenario: delivery.environment === 'SANDBOX' ? delivery.scenario : null, // scenarios are inert outside the sandbox
  };

  if (delivery.kind === 'OTP') {
    const ch = delivery.otpChallengeId
      ? await prisma.otpChallenge.findUnique({ where: { id: delivery.otpChallengeId } })
      : null;
    if (!ch || ch.status !== 'PENDING' || ch.version !== delivery.otpVersion || ch.expiresAt <= new Date()) {
      return { skip: 'EXPIRED', code: 'otp_expired_before_send' };
    }
    return { ...base, otpCode: computeOtpCode(ch.seed, ch.version, ch.codeLength) };
  }

  if (delivery.kind === 'INVOICE') {
    const inv = delivery.invoiceId
      ? await prisma.issuedDocument.findUnique({ where: { id: delivery.invoiceId } })
      : null;
    if (!inv?.pdfStorageKey) return { skip: 'FAILED', code: 'pdf_unavailable' };
    const url = await getStorageProvider().getSignedDownloadUrl(inv.pdfStorageKey, deliveryPolicy.pdfUrlTtlSeconds);
    const payload = (delivery.payload ?? {}) as { caption?: string };
    return {
      ...base,
      document: { url, filename: `${inv.number}.pdf`, caption: payload.caption ?? `Your ${inv.documentType.toLowerCase()} ${inv.number}` },
      text: payload.caption,
    };
  }

  const payload = (delivery.payload ?? {}) as { text?: string };
  return { ...base, text: payload.text ?? '' };
}

/** Everything that must still be true at SEND time, not just at request time. */
async function recheckAuthorization(delivery: Delivery): Promise<{ code: string } | null> {
  try {
    await assertCanSend(delivery.workspaceId, delivery.environment);
  } catch (err) {
    if (err instanceof AppError) return { code: err.code.toLowerCase() };
    throw err;
  }
  if (delivery.apiKeyId) {
    const key = await prisma.apiKey.findUnique({ where: { id: delivery.apiKeyId }, select: { revokedAt: true } });
    if (!key || key.revokedAt) return { code: 'key_revoked' };
  }
  return null;
}

export async function processDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return;
  // Idempotent under at-least-once job delivery: only unsent deliveries are processed.
  if (delivery.status !== 'QUEUED' && delivery.status !== 'RETRYING' && delivery.status !== 'PROCESSING') return;

  // A crash AFTER the provider call started leaves an unfinished attempt. We cannot know whether the
  // provider accepted it, so we do not resend; we wait for a receipt, then give up (see reconcile).
  const unfinished = await prisma.deliveryAttempt.findFirst({
    where: { deliveryId, finishedAt: null },
    orderBy: { attemptNo: 'desc' },
  });
  if (unfinished) {
    await prisma.deliveryAttempt.update({
      where: { id: unfinished.id },
      data: { outcome: 'ambiguous', errorCode: 'worker_interrupted', finishedAt: new Date() },
    });
    await scheduleReconcile(delivery);
    return;
  }

  const blocked = await recheckAuthorization(delivery);
  if (blocked) {
    await finish(
      deliveryId,
      { status: 'BLOCKED', lastErrorCode: blocked.code, lastErrorMessage: 'Blocked before sending', failedAt: new Date() },
      'delivery.failed',
      { status: { in: ['QUEUED', 'RETRYING', 'PROCESSING'] } },
    );
    return;
  }

  const attemptNo = delivery.attemptCount + 1;
  const request = await buildRequest(delivery, attemptNo);
  if ('skip' in request) {
    await finish(
      deliveryId,
      {
        status: request.skip,
        lastErrorCode: request.code,
        lastErrorMessage: 'Not sent',
        failedAt: new Date(),
      },
      'delivery.failed',
    );
    return;
  }

  const attempt = await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: 'PROCESSING', attemptCount: attemptNo } });
    return tx.deliveryAttempt.create({ data: { deliveryId, attemptNo, outcome: 'started' } });
  });

  let outcome: ProviderOutcome;
  try {
    outcome = await resolveProvider(delivery).send(request);
  } catch (err) {
    logger.error({ err, deliveryId }, 'Provider adapter threw');
    outcome = { kind: 'ambiguous', code: 'adapter_error', message: 'Provider call failed unexpectedly' };
  }
  await handleOutcome(delivery, attempt.id, attemptNo, outcome);
}

async function handleOutcome(delivery: Delivery, attemptId: string, attemptNo: number, outcome: ProviderOutcome) {
  const finishAttempt = (data: Prisma.DeliveryAttemptUpdateInput) =>
    prisma.deliveryAttempt.update({ where: { id: attemptId }, data: { ...data, finishedAt: new Date() } });

  switch (outcome.kind) {
    case 'accepted': {
      await finishAttempt({ outcome: 'accepted' });
      const status: DeliveryStatus = outcome.simulated || delivery.environment === 'SANDBOX'
        ? 'SANDBOX_SIMULATED'
        : delivery.channel === 'TELEGRAM'
          ? 'SENT'
          : 'PROVIDER_ACCEPTED';
      await finish(
        delivery.id,
        {
          status,
          simulated: delivery.environment === 'SANDBOX',
          providerMessageId: outcome.providerMessageId,
          sentAt: new Date(),
          nextAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        'delivery.sent',
      );
      if (delivery.environment === 'SANDBOX') await scheduleSandboxReceipts(delivery);
      return;
    }
    case 'transient':
    case 'throttled': {
      await finishAttempt({
        outcome: outcome.kind === 'throttled' ? 'throttled' : 'transient_failure',
        errorCode: outcome.code,
        errorMessage: outcome.message,
        retryAfterSeconds: outcome.kind === 'throttled' ? outcome.retryAfterSeconds : outcome.retryAfterSeconds,
      });
      if (attemptNo >= deliveryPolicy.maxAttempts) {
        await finish(
          delivery.id,
          { status: 'FAILED', lastErrorCode: 'max_retries_exceeded', lastErrorMessage: outcome.message, failedAt: new Date() },
          'delivery.failed',
        );
        return;
      }
      const retryAfter = outcome.kind === 'throttled' ? outcome.retryAfterSeconds * 1000 : outcome.retryAfterSeconds ? outcome.retryAfterSeconds * 1000 : 0;
      const delayMs = Math.max(retryAfter, backoffMs(attemptNo, deliveryPolicy.retryBaseMs, deliveryPolicy.retryCapMs));
      const next = new Date(Date.now() + delayMs);
      await prisma.$transaction(async (tx) => {
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: 'RETRYING', nextAttemptAt: next, lastErrorCode: outcome.code, lastErrorMessage: outcome.message },
        });
        await enqueue(tx, {
          type: 'delivery.send',
          payload: { deliveryId: delivery.id },
          workspaceId: delivery.workspaceId,
          environment: delivery.environment,
          runAt: next,
          dedupeKey: `delivery:${delivery.id}:${attemptNo + 1}`,
        });
      });
      return;
    }
    case 'permanent': {
      await finishAttempt({ outcome: 'permanent_failure', errorCode: outcome.code, errorMessage: outcome.message });
      await finish(
        delivery.id,
        { status: 'FAILED', lastErrorCode: outcome.code, lastErrorMessage: outcome.message, failedAt: new Date() },
        'delivery.failed',
      );
      return;
    }
    case 'ambiguous': {
      await finishAttempt({ outcome: 'ambiguous', errorCode: outcome.code, errorMessage: outcome.message });
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: 'RETRYING', lastErrorCode: 'provider_timeout_unconfirmed', lastErrorMessage: outcome.message },
      });
      await scheduleReconcile(delivery);
      if (delivery.environment === 'SANDBOX' && delivery.scenario === 'ambiguous_timeout') {
        // The provider did accept it; the receipt shows up late.
        await enqueue(prisma, {
          type: 'sandbox.receipt',
          payload: { deliveryId: delivery.id, status: 'delivered', times: 1 },
          workspaceId: delivery.workspaceId,
          environment: 'SANDBOX',
          runAt: new Date(Date.now() + deliveryPolicy.sandboxReceiptDelayMs),
          dedupeKey: `sbx-receipt:${delivery.id}:ambiguous`,
        });
      }
      return;
    }
  }
}

async function scheduleReconcile(delivery: Delivery) {
  await enqueue(prisma, {
    type: 'delivery.reconcile',
    payload: { deliveryId: delivery.id },
    workspaceId: delivery.workspaceId,
    environment: delivery.environment,
    runAt: new Date(Date.now() + deliveryPolicy.reconcileGraceMs),
    dedupeKey: `delivery:${delivery.id}:reconcile`,
  });
}

async function scheduleSandboxReceipts(delivery: Delivery) {
  const scenario = delivery.scenario ?? 'success';
  const wantsReceipt = ['delayed_callback', 'duplicate_callback'].includes(scenario);
  if (!wantsReceipt) return;
  const delay = scenario === 'delayed_callback' ? deliveryPolicy.sandboxReceiptDelayMs : 0;
  await enqueue(prisma, {
    type: 'sandbox.receipt',
    payload: { deliveryId: delivery.id, status: 'delivered', times: scenario === 'duplicate_callback' ? 2 : 1 },
    workspaceId: delivery.workspaceId,
    environment: 'SANDBOX',
    runAt: new Date(Date.now() + delay),
    dedupeKey: `sbx-receipt:${delivery.id}`,
  });
}

/** After the grace window an ambiguous delivery with no receipt is failed, never re-sent. */
export async function reconcileDelivery(deliveryId: string): Promise<void> {
  await finish(
    deliveryId,
    {
      status: 'FAILED',
      lastErrorCode: 'provider_timeout_unconfirmed',
      lastErrorMessage: 'No provider confirmation received; the message was not re-sent to avoid a duplicate',
      failedAt: new Date(),
    },
    'delivery.failed',
    { status: 'RETRYING', lastErrorCode: 'provider_timeout_unconfirmed' },
  );
}

export type ProviderReceipt = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Applies a (verified) provider status receipt. Safe against duplicates (unique event key) and
 * out-of-order delivery (forward-only ranking). Returns false when the receipt changed nothing.
 */
export async function applyProviderReceipt(input: {
  provider: string;
  externalId: string; // provider message id
  status: ProviderReceipt;
  errorCode?: string;
  /** Receipts from a tenant's own channel may only touch that tenant's deliveries. */
  workspaceId?: string;
  environment?: 'LIVE' | 'SANDBOX';
}): Promise<boolean> {
  try {
    await prisma.providerStatusEvent.create({
      data: { provider: input.provider, externalId: input.externalId, status: input.status },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false; // duplicate callback
    throw err;
  }

  const simId = input.externalId.startsWith('sim_') ? input.externalId.slice(4) : undefined;
  const delivery = await prisma.delivery.findFirst({
    where: {
      OR: [{ providerMessageId: input.externalId }, ...(simId ? [{ id: simId, environment: 'SANDBOX' as const }] : [])],
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.environment ? { environment: input.environment } : {}),
    },
  });
  if (!delivery) return false;

  if (input.status === 'failed') {
    if ((RANK[delivery.status] ?? 0) >= RANK.DELIVERED!) return false; // a late "failed" never undoes a delivery
    const res = await finish(
      delivery.id,
      { status: 'FAILED', lastErrorCode: input.errorCode ?? 'provider_reported_failure', lastErrorMessage: 'Provider reported the message failed', failedAt: new Date() },
      'delivery.failed',
      { status: { notIn: [...TERMINAL, 'DELIVERED', 'READ'] } },
    );
    return Boolean(res);
  }

  const target: DeliveryStatus = input.status === 'delivered' ? 'DELIVERED' : input.status === 'read' ? 'READ' : 'SENT';
  const targetRank = RANK[target]!;
  // Allowed from any lower rank, and from an unconfirmed-timeout failure (the receipt proves it went out).
  const lowerStatuses = (Object.keys(RANK) as DeliveryStatus[]).filter((s) => RANK[s]! < targetRank);
  const res = await finish(
    delivery.id,
    {
      status: target,
      ...(target === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(target === 'READ' ? { readAt: new Date(), deliveredAt: delivery.deliveredAt ?? new Date() } : {}),
      ...(delivery.providerMessageId ? {} : { providerMessageId: input.externalId }),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    target === 'DELIVERED' ? 'delivery.delivered' : undefined,
    {
      OR: [
        { status: { in: lowerStatuses } },
        { status: 'FAILED', lastErrorCode: 'provider_timeout_unconfirmed' },
      ],
    },
  );
  return Boolean(res);
}

registerJob('delivery.send', async (payload) => {
  await processDelivery(String(payload.deliveryId));
});
registerJob('delivery.reconcile', async (payload) => {
  await reconcileDelivery(String(payload.deliveryId));
});
registerJob('sandbox.receipt', async (payload) => {
  const times = Number(payload.times ?? 1);
  for (let i = 0; i < times; i += 1) {
    await applyProviderReceipt({
      provider: 'sandbox',
      externalId: `sim_${String(payload.deliveryId)}`,
      status: payload.status as ProviderReceipt,
    });
  }
});

export { SETTLED, TERMINAL };
