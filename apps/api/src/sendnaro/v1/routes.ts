import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { prisma } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';
import { requireApiKey } from '../auth.js';
import { parsePublicId, publicId } from '../ids.js';
import { drainOutbox } from '../jobs.js';
import { kickAfterAccept } from '../kick.js';
import { consumeLinkToken } from './telegram.service.js';
import { v1ErrorHandler, v1NotFound } from './errors.js';
import {
  createInvoiceSchema,
  createLinkTokenSchema,
  createNotificationSchema,
  createOtpSchema,
  verifyOtpSchema,
} from './schemas.js';
import * as invoices from './invoices.service.js';
import * as notifications from './notifications.service.js';
import * as otp from './otp.service.js';
import * as telegram from './telegram.service.js';

/**
 * Public, versioned, API-key authenticated surface. Every handler gets its tenant and environment from
 * the key (req.sn); nothing in the body, query or headers can select a different business.
 */
export const sendnaroV1Router = Router();

sendnaroV1Router.use(kickAfterAccept);

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const idempotencyKey = (req: Request) => {
  const v = req.headers['idempotency-key'];
  return typeof v === 'string' ? v : undefined;
};

function reply(res: Response, r: { status: number; body: unknown; replayed?: boolean }) {
  if (r.replayed) res.setHeader('Idempotent-Replayed', 'true');
  res.status(r.status).json(r.body);
}

sendnaroV1Router.get('/ping', requireApiKey(null), wrap(async (req, res) => {
  res.json({
    object: 'ping',
    environment: req.sn!.environment.toLowerCase(),
    scopes: req.sn!.scopes,
    request_id: req.sn!.requestId,
  });
}));

// ----- Invoices -----
sendnaroV1Router.post('/invoices', requireApiKey('invoices:create'), wrap(async (req, res) => {
  const body = createInvoiceSchema.parse(req.body);
  reply(res, await invoices.createInvoice(req.sn!, body, idempotencyKey(req)));
}));

sendnaroV1Router.get('/invoices/:invoiceId', requireApiKey('invoices:read'), wrap(async (req, res) => {
  res.json(await invoices.getInvoice(req.sn!, String(req.params.invoiceId)));
}));

// ----- OTP -----
sendnaroV1Router.post('/otp/challenges', requireApiKey('otp:create'), wrap(async (req, res) => {
  const r = await otp.createChallenge(req.sn!, createOtpSchema.parse(req.body));
  reply(res, r);
}));

sendnaroV1Router.post('/otp/challenges/:challengeId/resend', requireApiKey('otp:create'), wrap(async (req, res) => {
  reply(res, await otp.resendChallenge(req.sn!, String(req.params.challengeId)));
}));

sendnaroV1Router.post('/otp/challenges/:challengeId/verify', requireApiKey('otp:verify'), wrap(async (req, res) => {
  reply(res, await otp.verifyChallenge(req.sn!, String(req.params.challengeId), verifyOtpSchema.parse(req.body)));
}));

// ----- Notifications -----
sendnaroV1Router.post('/notifications', requireApiKey('notifications:send'), wrap(async (req, res) => {
  reply(res, await notifications.createNotification(req.sn!, createNotificationSchema.parse(req.body), idempotencyKey(req)));
}));

// ----- Deliveries -----
function presentDelivery(d: Awaited<ReturnType<typeof loadDelivery>>) {
  return {
    id: publicId('delivery', d.id),
    object: 'delivery',
    kind: d.kind.toLowerCase(),
    channel: d.channel.toLowerCase(),
    status: d.status.toLowerCase(),
    simulated: d.simulated,
    environment: d.environment.toLowerCase(),
    invoice_id: d.invoiceId ? publicId('invoice', d.invoiceId) : undefined,
    challenge_id: d.otpChallengeId ? publicId('otp', d.otpChallengeId) : undefined,
    error: d.lastErrorCode ? { code: d.lastErrorCode, message: d.lastErrorMessage ?? undefined } : undefined,
    attempts: d.attempts.map((a) => ({
      attempt: a.attemptNo,
      outcome: a.outcome,
      error_code: a.errorCode ?? undefined,
      at: a.startedAt.toISOString(),
    })),
    next_attempt_at: d.nextAttemptAt?.toISOString(),
    created_at: d.createdAt.toISOString(),
    sent_at: d.sentAt?.toISOString(),
    delivered_at: d.deliveredAt?.toISOString(),
    read_at: d.readAt?.toISOString(),
    failed_at: d.failedAt?.toISOString(),
  };
}

async function loadDelivery(ctx: NonNullable<Request['sn']>, publicDeliveryId: string) {
  const id = parsePublicId('delivery', publicDeliveryId);
  const d = id
    ? await prisma.delivery.findFirst({
        where: { id, workspaceId: ctx.workspaceId, environment: ctx.environment },
        include: { attempts: { orderBy: { attemptNo: 'asc' } } },
      })
    : null;
  if (!d) throw new AppError('NOT_FOUND', 'Delivery not found');
  return d;
}

sendnaroV1Router.get('/deliveries/:deliveryId', requireApiKey('deliveries:read'), wrap(async (req, res) => {
  res.json({ ...presentDelivery(await loadDelivery(req.sn!, String(req.params.deliveryId))), request_id: req.sn!.requestId });
}));

// ----- Telegram -----
sendnaroV1Router.post('/telegram/link-tokens', requireApiKey('telegram:link'), wrap(async (req, res) => {
  reply(res, await telegram.createLinkToken(req.sn!, createLinkTokenSchema.parse(req.body)));
}));

sendnaroV1Router.delete('/telegram/links/:externalCustomerId', requireApiKey('telegram:link'), wrap(async (req, res) => {
  reply(res, await telegram.unlinkRecipient(req.sn!, String(req.params.externalCustomerId)));
}));

// ----- Sandbox helpers (inert for live keys) -----
sendnaroV1Router.get('/sandbox/otp-inbox', requireApiKey('otp:create'), wrap(async (req, res) => {
  res.json(await otp.sandboxInbox(req.sn!, typeof req.query.phone === 'string' ? req.query.phone : undefined));
}));

sendnaroV1Router.post('/sandbox/telegram/start', requireApiKey('telegram:link'), wrap(async (req, res) => {
  if (req.sn!.environment !== 'SANDBOX') {
    throw new AppError('SANDBOX_ONLY', 'The Telegram start simulator is only available with sandbox keys');
  }
  const { token, chat_id } = (req.body ?? {}) as { token?: string; chat_id?: string };
  if (!token) throw new AppError('VALIDATION_ERROR', 'token is required');
  const result = await consumeLinkToken({ token, chatId: chat_id ?? `sandbox_chat_${Date.now()}`, environment: 'SANDBOX', workspaceId: req.sn!.workspaceId });
  if (!result.ok) throw new AppError('UNPROCESSABLE', `Link token rejected: ${result.reason}`);
  res.json({ linked: true, request_id: req.sn!.requestId });
}));

/**
 * Sandbox only: run this business's queued sandbox jobs right now. On serverless deployments there is no
 * always-on worker, so the playground calls this to make the asynchronous pipeline visible. With
 * `fast_forward` it also pulls delayed jobs (retries, delayed receipts) forward instead of waiting.
 */
sendnaroV1Router.post('/sandbox/process-queue', requireApiKey('deliveries:read'), wrap(async (req, res) => {
  if (req.sn!.environment !== 'SANDBOX') {
    throw new AppError('SANDBOX_ONLY', 'Queue processing on demand is only available with sandbox keys');
  }
  const { workspaceId } = req.sn!;
  if ((req.body as { fast_forward?: boolean } | undefined)?.fast_forward) {
    await prisma.outboxEvent.updateMany({
      where: { workspaceId, environment: 'SANDBOX', status: 'PENDING', runAt: { gt: new Date() } },
      data: { runAt: new Date() },
    });
  }
  let processed = 0;
  for (let i = 0; i < 6; i += 1) {
    const r = await drainOutbox({ workspaceId, environment: 'SANDBOX', maxRounds: 5 });
    processed += r.processed;
    if (r.processed === 0) break;
    if ((req.body as { fast_forward?: boolean } | undefined)?.fast_forward) {
      await prisma.outboxEvent.updateMany({ where: { workspaceId, environment: 'SANDBOX', status: 'PENDING', runAt: { gt: new Date() } }, data: { runAt: new Date() } });
    }
  }
  res.json({ object: 'queue_run', processed, request_id: req.sn!.requestId });
}));

sendnaroV1Router.use(v1NotFound);
sendnaroV1Router.use(v1ErrorHandler);
