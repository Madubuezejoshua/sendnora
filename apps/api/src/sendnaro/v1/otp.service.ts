import { prisma, type OtpChallenge } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';
import type { SnContext } from '../context.js';
import { assertCanSend } from '../entitlement.js';
import { parsePublicId, publicId } from '../ids.js';
import { enforce, RateLimitedError } from '../limits.js';
import { enqueue } from '../outbox.js';
import { codesMatch, computeOtpCode, newSeed } from '../otp/code.js';
import {
  assertChannelsReady,
  assertScenarioAllowed,
  publicDelivery,
  toE164,
} from '../recipients.js';
import { emitWebhookEvent } from '../webhooks/dispatch.js';

export const otpPolicy = {
  ttlSeconds: 10 * 60,
  codeLength: 6,
  maxAttempts: 5,
  maxResends: 3,
  resendCooldownSeconds: 30,
  perRecipientPerHour: 5,
  perTenantPerMinute: 120,
  perIpPerMinute: 60,
};

function maskPhone(e164: string): string {
  return `${e164.slice(0, 4)}${'*'.repeat(Math.max(0, e164.length - 7))}${e164.slice(-3)}`;
}

function presentChallenge(c: OtpChallenge, extra: Record<string, unknown> = {}) {
  return {
    id: publicId('otp', c.id),
    object: 'otp_challenge',
    status: c.status.toLowerCase(),
    purpose: c.purpose,
    phone: maskPhone(c.recipientPhone),
    customer_ref: c.customerRef ?? undefined,
    expires_at: c.expiresAt.toISOString(),
    attempts_remaining: Math.max(0, c.maxAttempts - c.attemptCount),
    resend_available_at: c.lastSentAt
      ? new Date(c.lastSentAt.getTime() + otpPolicy.resendCooldownSeconds * 1000).toISOString()
      : undefined,
    ...extra,
  };
}

async function loadChallenge(ctx: SnContext, publicChallengeId: string) {
  const id = parsePublicId('otp', publicChallengeId);
  const challenge = id
    ? await prisma.otpChallenge.findFirst({
        where: { id, workspaceId: ctx.workspaceId, environment: ctx.environment },
      })
    : null;
  if (!challenge) throw new AppError('NOT_FOUND', 'Challenge not found');
  return challenge;
}

export async function createChallenge(
  ctx: SnContext,
  body: { phone: string; purpose: string; customer_ref?: string; scenario?: string },
) {
  await assertCanSend(ctx.workspaceId, ctx.environment);
  const scenario = assertScenarioAllowed(ctx, body.scenario);
  await assertChannelsReady(ctx, ['whatsapp']);

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { countryCode: true },
  });
  const phone = toE164(body.phone, workspace.countryCode);

  // Shared, durable limits (Postgres). Order matters: cheap global guards first.
  const scope = `${ctx.workspaceId}:${ctx.environment}`;
  await enforce(`otp:t:${scope}`, otpPolicy.perTenantPerMinute, 60, 'verification requests');
  await enforce(
    `otp:ip:${scope}:${ctx.ip}`,
    otpPolicy.perIpPerMinute,
    60,
    'verification requests from this address',
  );
  await enforce(
    `otp:r:${scope}:${phone}`,
    otpPolicy.perRecipientPerHour,
    3600,
    'codes for this number',
  );
  const cd = await prisma.otpChallenge.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      recipientPhone: phone,
      purpose: body.purpose,
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (cd) {
    const waitMs = otpPolicy.resendCooldownSeconds * 1000 - (Date.now() - cd.createdAt.getTime());
    if (waitMs > 0) throw new RateLimitedError('codes for this number', Math.ceil(waitMs / 1000));
  }

  const expiresAt =
    scenario === 'expired_otp'
      ? new Date(Date.now() - 1000)
      : new Date(Date.now() + otpPolicy.ttlSeconds * 1000);

  const { challenge, delivery } = await prisma.$transaction(async (tx) => {
    // A new request invalidates every earlier pending code for this recipient + purpose.
    await tx.otpChallenge.updateMany({
      where: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        recipientPhone: phone,
        purpose: body.purpose,
        status: 'PENDING',
      },
      data: { status: 'SUPERSEDED' },
    });
    const challenge = await tx.otpChallenge.create({
      data: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        recipientPhone: phone,
        purpose: body.purpose,
        customerRef: body.customer_ref,
        seed: newSeed(),
        codeLength: otpPolicy.codeLength,
        maxAttempts: otpPolicy.maxAttempts,
        expiresAt,
        lastSentAt: new Date(),
      },
    });
    const delivery = await tx.delivery.create({
      data: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        kind: 'OTP',
        channel: 'WHATSAPP',
        toAddress: phone,
        templateKey: 'otp_authentication',
        otpChallengeId: challenge.id,
        otpVersion: challenge.version,
        scenario,
        requestId: ctx.requestId || null,
        apiKeyId: ctx.apiKeyId,
      },
    });
    await enqueue(tx, {
      type: 'delivery.send',
      payload: { deliveryId: delivery.id },
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      dedupeKey: `delivery:${delivery.id}:1`,
    });
    return { challenge, delivery };
  });

  return {
    status: 202,
    body: {
      ...presentChallenge(challenge),
      delivery: publicDelivery(delivery),
      request_id: ctx.requestId,
    },
  };
}

export async function resendChallenge(ctx: SnContext, publicChallengeId: string) {
  await assertCanSend(ctx.workspaceId, ctx.environment);
  await assertChannelsReady(ctx, ['whatsapp']);
  const current = await loadChallenge(ctx, publicChallengeId);
  if (current.status !== 'PENDING' || current.expiresAt <= new Date()) {
    throw new AppError('OTP_EXPIRED', 'This challenge can no longer be resent; create a new one');
  }
  if (current.resendCount >= otpPolicy.maxResends) {
    throw new AppError('OTP_LOCKED', 'Resend limit reached; create a new challenge');
  }
  if (current.lastSentAt) {
    const waitMs =
      otpPolicy.resendCooldownSeconds * 1000 - (Date.now() - current.lastSentAt.getTime());
    if (waitMs > 0) throw new RateLimitedError('resend requests', Math.ceil(waitMs / 1000));
  }
  await enforce(
    `otp:r:${ctx.workspaceId}:${ctx.environment}:${current.recipientPhone}`,
    otpPolicy.perRecipientPerHour,
    3600,
    'codes for this number',
  );

  // Version bump: the previous code stops working the moment the new one exists.
  const { challenge, delivery } = await prisma.$transaction(async (tx) => {
    const bumped = await tx.otpChallenge.updateMany({
      where: { id: current.id, status: 'PENDING', version: current.version },
      data: { version: { increment: 1 }, resendCount: { increment: 1 }, lastSentAt: new Date() },
    });
    if (bumped.count === 0) throw new AppError('CONFLICT', 'The challenge changed; retry');
    const challenge = await tx.otpChallenge.findUniqueOrThrow({ where: { id: current.id } });
    const delivery = await tx.delivery.create({
      data: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        kind: 'OTP',
        channel: 'WHATSAPP',
        toAddress: challenge.recipientPhone,
        templateKey: 'otp_authentication',
        otpChallengeId: challenge.id,
        otpVersion: challenge.version,
        requestId: ctx.requestId || null,
        apiKeyId: ctx.apiKeyId,
      },
    });
    await enqueue(tx, {
      type: 'delivery.send',
      payload: { deliveryId: delivery.id },
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      dedupeKey: `delivery:${delivery.id}:1`,
    });
    return { challenge, delivery };
  });
  return {
    status: 202,
    body: {
      ...presentChallenge(challenge),
      delivery: publicDelivery(delivery),
      request_id: ctx.requestId,
    },
  };
}

export async function verifyChallenge(
  ctx: SnContext,
  publicChallengeId: string,
  body: { code: string; phone: string; purpose: string },
) {
  await enforce(
    `otpv:ip:${ctx.workspaceId}:${ctx.environment}:${ctx.ip}`,
    otpPolicy.perIpPerMinute * 2,
    60,
    'verification attempts',
  );
  const id = parsePublicId('otp', publicChallengeId);
  if (!id) throw new AppError('NOT_FOUND', 'Challenge not found');

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { countryCode: true },
  });
  let phone: string;
  try {
    phone = toE164(body.phone, workspace.countryCode);
  } catch {
    throw new AppError('NOT_FOUND', 'Challenge not found'); // no oracle: wrong recipient looks like a missing challenge
  }

  // One atomic statement: it counts the attempt AND enforces tenant, environment, recipient, purpose,
  // status, expiry and the attempt cap. Two concurrent callers can never share one attempt slot.
  const now = new Date(); // passed as a parameter: never compare against the DB's timezone-dependent now()
  const rows = await prisma.$queryRaw<OtpChallenge[]>`
    UPDATE "OtpChallenge" SET "attemptCount" = "attemptCount" + 1
     WHERE "id" = ${id} AND "workspaceId" = ${ctx.workspaceId}
       AND "environment" = ${ctx.environment}::"ApiEnvironment"
       AND "recipientPhone" = ${phone} AND "purpose" = ${body.purpose}
       AND "status" = 'PENDING' AND "expiresAt" > (${now}::timestamptz AT TIME ZONE 'UTC') AND "attemptCount" < "maxAttempts"
    RETURNING *`;
  const row = rows[0];

  if (!row) {
    const c = await prisma.otpChallenge.findFirst({
      where: {
        id,
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        recipientPhone: phone,
        purpose: body.purpose,
      },
    });
    if (!c) throw new AppError('NOT_FOUND', 'Challenge not found');
    if (c.status === 'VERIFIED') throw new AppError('OTP_INVALID', 'This code was already used');
    if (c.status === 'LOCKED' || c.attemptCount >= c.maxAttempts) {
      throw new AppError('OTP_LOCKED', 'Too many incorrect attempts; request a new code');
    }
    if (c.status === 'SUPERSEDED')
      throw new AppError('OTP_EXPIRED', 'A newer code was requested; use the latest one');
    throw new AppError('OTP_EXPIRED', 'This code has expired; request a new one');
  }

  const expected = computeOtpCode(row.seed, row.version, row.codeLength);
  if (body.code.length !== row.codeLength || !codesMatch(expected, body.code)) {
    const remaining = row.maxAttempts - row.attemptCount;
    if (remaining <= 0) {
      await prisma.otpChallenge.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'LOCKED' },
      });
      throw new AppError('OTP_LOCKED', 'Too many incorrect attempts; request a new code');
    }
    throw new AppError(
      'OTP_INVALID',
      `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining`,
    );
  }

  // Single-use: only one concurrent winner can flip PENDING -> VERIFIED.
  const verified = await prisma.$transaction(async (tx) => {
    const flipped = await tx.otpChallenge.updateMany({
      where: { id: row.id, status: 'PENDING', version: row.version },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    });
    if (flipped.count === 0) return null;
    await emitWebhookEvent(tx, {
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      type: 'otp.verified',
      data: {
        challenge_id: publicId('otp', row.id),
        outcome: 'verified',
        purpose: row.purpose,
        customer_ref: row.customerRef ?? undefined,
      },
    });
    return tx.otpChallenge.findUniqueOrThrow({ where: { id: row.id } });
  });
  if (!verified) throw new AppError('OTP_INVALID', 'This code was already used');
  return {
    status: 200,
    body: {
      ...presentChallenge(verified, { verified_at: verified.verifiedAt?.toISOString() }),
      request_id: ctx.requestId,
    },
  };
}

/** Sandbox-only: the codes a simulated phone would have received. Unreachable with a live key. */
export async function sandboxInbox(ctx: SnContext, rawPhone?: string) {
  if (ctx.environment !== 'SANDBOX') {
    throw new AppError('SANDBOX_ONLY', 'The test inbox is only available with sandbox keys');
  }
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { countryCode: true },
  });
  const phone = rawPhone ? toE164(rawPhone, workspace.countryCode) : undefined;
  const challenges = await prisma.otpChallenge.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      environment: 'SANDBOX',
      status: 'PENDING',
      ...(phone ? { recipientPhone: phone } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return {
    object: 'sandbox_inbox',
    messages: challenges.map((c) => ({
      challenge_id: publicId('otp', c.id),
      phone: c.recipientPhone,
      purpose: c.purpose,
      code: computeOtpCode(c.seed, c.version, c.codeLength),
      expires_at: c.expiresAt.toISOString(),
    })),
  };
}
