import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma, type ApiEnvironment } from '@sendnaro/database';
import { encryptSecret } from '@sendnaro/database/encryption';
import { AppError, isSupportedCurrency } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { writeAuditLog } from '../../services/audit.service.js';
import { FileValidationError, getStorageProvider, validateAndStoreUpload } from '../../services/storage/storage.service.js';
import { getActivationState } from '../billing/activation.service.js';
import { publicId, parsePublicId } from '../ids.js';
import { generateSecret, API_SCOPES } from '../keys.js';
import { deliveryPolicy } from '../delivery/engine.js';
import { SANDBOX_SCENARIOS } from '../delivery/sandbox.provider.js';
import { loadWhatsAppConnection, type WhatsAppConnectionConfig, type WhatsAppSecrets } from '../delivery/whatsapp.provider.js';
import { emitWebhookEvent, WEBHOOK_EVENT_TYPES } from '../webhooks/dispatch.js';
import { generateWebhookSecret } from '../webhooks/signing.js';
import { assertWebhookUrl } from '../webhooks/ssrf.js';
import { requireOwnerOrAdmin } from './guards.js';

/**
 * Session-authenticated endpoints behind the console. Every route carries its own guards (no
 * path-less router.use) and every query is scoped to req.workspace.workspaceId from the verified token.
 */
export const sendnaroConsoleRouter = Router();
const member = [requireAuth, requireWorkspace];
const manager = [requireAuth, requireWorkspace, requireOwnerOrAdmin];
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const envSchema = z.enum(['sandbox', 'live']).transform((v) => (v === 'live' ? 'LIVE' : 'SANDBOX') as ApiEnvironment);
const mask = (v: string) => (v.length > 4 ? `${'*'.repeat(Math.min(6, v.length - 4))}${v.slice(-4)}` : '****');

// ----------------------------------------------------------------------------------------------
// Overview / integration checklist
// ----------------------------------------------------------------------------------------------
sendnaroConsoleRouter.get('/overview', ...member, async (req, res, next) => {
  try {
    const workspaceId = req.workspace!.workspaceId;
    const [workspace, keys, connections, firstSandbox, firstLive, billing] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { businessProfile: true } }),
      prisma.apiKey.findMany({ where: { workspaceId, revokedAt: null }, select: { environment: true } }),
      prisma.channelConnection.findMany({ where: { workspaceId } }),
      prisma.delivery.findFirst({ where: { workspaceId, environment: 'SANDBOX' }, select: { id: true } }),
      prisma.delivery.findFirst({ where: { workspaceId, environment: 'LIVE' }, select: { id: true } }),
      getActivationState(workspaceId),
    ]);
    const profile = workspace.businessProfile;
    const wa = connections.find((c) => c.channel === 'WHATSAPP' && c.environment === 'LIVE');
    const env = parseApiEnv();
    res.json({
      data: {
        business: { name: profile?.displayName ?? workspace.name, role: req.workspace!.role },
        checklist: [
          { id: 'profile', label: 'Complete your business profile', done: Boolean(profile?.displayName && profile.contactEmail) },
          { id: 'sandbox_key', label: 'Create a sandbox API key', done: keys.some((k) => k.environment === 'SANDBOX') },
          { id: 'first_request', label: 'Send your first sandbox request', done: Boolean(firstSandbox) },
          { id: 'whatsapp', label: 'Connect your WhatsApp sender (live)', done: wa?.status === 'CONNECTED' },
          { id: 'live_key', label: 'Create a live API key', done: keys.some((k) => k.environment === 'LIVE') },
          { id: 'live_request', label: 'Send your first live request', done: Boolean(firstLive) },
        ],
        channels: {
          whatsapp: { status: wa?.status ?? 'NOT_CONNECTED' },
          telegram: { botConfigured: Boolean(env.TELEGRAM_BOT_TOKEN), botUsername: env.TELEGRAM_BOT_USERNAME ?? null },
        },
        billing,
        apiBaseUrl: env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ''),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------------------------
// Business profile & settings
// ----------------------------------------------------------------------------------------------
const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    legalName: z.string().trim().max(160).optional().nullable(),
    contactEmail: z.string().trim().email().max(200).optional().nullable(),
    contactPhone: z.string().trim().max(32).optional().nullable(),
    website: z.string().trim().url().max(200).optional().nullable(),
    addressText: z.string().trim().max(400).optional().nullable(),
    invoiceFooter: z.string().trim().max(300).optional().nullable(),
    taxIdNumber: z.string().trim().max(60).optional().nullable(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
    defaultCurrency: z.string().length(3).toUpperCase().optional(),
    timezone: z.string().trim().min(1).max(60).optional(),
    allowedLinkOrigins: z
      .array(z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, 'must be a hostname such as example.com'))
      .max(20)
      .optional(),
  })
  .strict();

sendnaroConsoleRouter.get('/business', ...member, async (req, res, next) => {
  try {
    const w = await prisma.workspace.findUniqueOrThrow({
      where: { id: req.workspace!.workspaceId },
      include: { businessProfile: { include: { logo: true } } },
    });
    const p = w.businessProfile;
    res.json({
      data: {
        displayName: p?.displayName ?? w.name,
        legalName: p?.legalName ?? null,
        contactEmail: p?.contactEmail ?? null,
        contactPhone: p?.contactPhone ?? null,
        website: p?.website ?? null,
        addressText: p?.addressText ?? null,
        invoiceFooter: p?.invoiceFooter ?? null,
        taxIdNumber: p?.taxIdNumber ?? null,
        brandColor: w.brandColor,
        defaultCurrency: w.defaultCurrency,
        timezone: w.timezone,
        allowedLinkOrigins: p?.allowedLinkOrigins ?? [],
        hasLogo: Boolean(p?.logo),
      },
    });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.put('/business', ...manager, async (req, res, next) => {
  try {
    const body = profileSchema.parse(req.body);
    if (body.defaultCurrency && !isSupportedCurrency(body.defaultCurrency)) {
      throw new AppError('UNPROCESSABLE', 'Unsupported currency');
    }
    const workspaceId = req.workspace!.workspaceId;
    const { brandColor, defaultCurrency, timezone, ...profile } = body;
    await prisma.$transaction([
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { name: body.displayName, ...(brandColor !== undefined ? { brandColor } : {}), ...(defaultCurrency ? { defaultCurrency } : {}), ...(timezone ? { timezone } : {}) },
      }),
      prisma.businessProfile.upsert({ where: { workspaceId }, create: { workspaceId, ...profile }, update: profile }),
    ]);
    await writeAuditLog({ workspaceId, actorUserId: req.auth!.userId, action: 'business.profile_updated', entityType: 'BusinessProfile', entityId: workspaceId });
    res.json({ data: { saved: true } }); // issued documents keep their snapshot; only NEW documents use these values
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.post('/business/logo', ...manager, logoUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('VALIDATION_ERROR', 'A logo image is required');
    const workspaceId = req.workspace!.workspaceId;
    const asset = await validateAndStoreUpload({
      workspaceId, kind: 'LOGO', buffer: req.file.buffer, declaredMimeType: req.file.mimetype,
      originalFilename: req.file.originalname, uploadedById: req.auth!.userId,
    });
    if (!['image/png', 'image/jpeg'].includes(asset.mimeType)) {
      throw new AppError('UNPROCESSABLE', 'Logos for PDFs must be PNG or JPEG');
    }
    await prisma.businessProfile.upsert({
      where: { workspaceId },
      create: { workspaceId, displayName: (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).name, logoFileAssetId: asset.id },
      update: { logoFileAssetId: asset.id },
    });
    res.json({ data: { saved: true } });
  } catch (err) {
    next(err instanceof FileValidationError ? new AppError('VALIDATION_ERROR', err.message) : err);
  }
});

// ----------------------------------------------------------------------------------------------
// API keys
// ----------------------------------------------------------------------------------------------
const createKeySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    environment: envSchema,
    scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length).optional(),
    rateLimitPerMinute: z.number().int().min(10).max(5000).optional(),
  })
  .strict();

function presentKey(k: { id: string; name: string; prefix: string; lastFour: string | null; environment: ApiEnvironment; scopes: string[]; rateLimitPerMinute: number; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }) {
  return {
    id: k.id,
    name: k.name,
    environment: k.environment.toLowerCase(),
    display: `${k.prefix}…${k.lastFour ?? ''}`,
    scopes: k.scopes,
    rateLimitPerMinute: k.rateLimitPerMinute,
    lastUsedAt: k.lastUsedAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  };
}

sendnaroConsoleRouter.get('/keys', ...member, async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { workspaceId: req.workspace!.workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, lastFour: true, environment: true, scopes: true, rateLimitPerMinute: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
    res.json({ data: keys.map(presentKey) });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.post('/keys', ...manager, async (req, res, next) => {
  try {
    const body = createKeySchema.parse(req.body);
    const secret = generateSecret(body.environment);
    const record = await prisma.apiKey.create({
      data: {
        workspaceId: req.workspace!.workspaceId,
        createdById: req.auth!.userId,
        name: body.name,
        environment: body.environment,
        prefix: secret.prefix,
        lastFour: secret.lastFour,
        hashedKey: secret.hash,
        scopes: body.scopes ?? [...API_SCOPES],
        rateLimitPerMinute: body.rateLimitPerMinute ?? 120,
      },
    });
    await writeAuditLog({ workspaceId: record.workspaceId, actorUserId: req.auth!.userId, action: 'apikey.created', entityType: 'ApiKey', entityId: record.id, metadata: { environment: body.environment } });
    // The only time the full secret is ever returned.
    res.status(201).json({ data: { ...presentKey(record), secret: secret.key } });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.post('/keys/:keyId/rotate', ...manager, async (req, res, next) => {
  try {
    const old = await prisma.apiKey.findFirst({ where: { id: String(req.params.keyId), workspaceId: req.workspace!.workspaceId, revokedAt: null } });
    if (!old) throw new AppError('NOT_FOUND', 'Key not found');
    const secret = generateSecret(old.environment);
    const [created] = await prisma.$transaction([
      prisma.apiKey.create({
        data: {
          workspaceId: old.workspaceId, createdById: req.auth!.userId, name: old.name, environment: old.environment,
          prefix: secret.prefix, lastFour: secret.lastFour, hashedKey: secret.hash, scopes: old.scopes,
          rateLimitPerMinute: old.rateLimitPerMinute, rotatedFromId: old.id,
        },
      }),
      prisma.apiKey.update({ where: { id: old.id }, data: { revokedAt: new Date() } }), // old key stops working immediately
    ]);
    await writeAuditLog({ workspaceId: old.workspaceId, actorUserId: req.auth!.userId, action: 'apikey.rotated', entityType: 'ApiKey', entityId: old.id });
    res.status(201).json({ data: { ...presentKey(created), secret: secret.key } });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.delete('/keys/:keyId', ...manager, async (req, res, next) => {
  try {
    const r = await prisma.apiKey.updateMany({
      where: { id: String(req.params.keyId), workspaceId: req.workspace!.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (r.count === 0) throw new AppError('NOT_FOUND', 'Key not found');
    await writeAuditLog({ workspaceId: req.workspace!.workspaceId, actorUserId: req.auth!.userId, action: 'apikey.revoked', entityType: 'ApiKey', entityId: String(req.params.keyId) });
    res.json({ data: { revoked: true } });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------------------------
// Deliveries / request history
// ----------------------------------------------------------------------------------------------
function presentDeliveryRow(d: { id: string; kind: string; channel: string; status: string; environment: string; simulated: boolean; toAddress: string; templateKey: string; lastErrorCode: string | null; lastErrorMessage: string | null; attemptCount: number; createdAt: Date; sentAt: Date | null; deliveredAt: Date | null; invoice?: { number: string; externalOrderId: string } | null }) {
  return {
    id: publicId('delivery', d.id),
    kind: d.kind.toLowerCase(),
    channel: d.channel.toLowerCase(),
    status: d.status.toLowerCase(),
    environment: d.environment.toLowerCase(),
    simulated: d.simulated,
    to: d.toAddress === 'unlinked' ? 'not connected' : mask(d.toAddress),
    template: d.templateKey,
    error: d.lastErrorCode ? { code: d.lastErrorCode, message: d.lastErrorMessage } : null,
    attempts: d.attemptCount,
    invoiceNumber: d.invoice?.number ?? null,
    externalOrderId: d.invoice?.externalOrderId ?? null,
    createdAt: d.createdAt,
    sentAt: d.sentAt,
    deliveredAt: d.deliveredAt,
  };
}

const listQuery = z.object({
  environment: envSchema.optional(),
  status: z.string().toUpperCase().optional(),
  channel: z.enum(['whatsapp', 'telegram']).optional(),
  kind: z.enum(['invoice', 'otp', 'notification']).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

sendnaroConsoleRouter.get('/deliveries', ...member, async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const search = q.q;
    const rows = await prisma.delivery.findMany({
      where: {
        workspaceId: req.workspace!.workspaceId,
        ...(q.environment ? { environment: q.environment } : {}),
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.channel ? { channel: q.channel.toUpperCase() as never } : {}),
        ...(q.kind ? { kind: q.kind.toUpperCase() as never } : {}),
        ...(search
          ? { OR: [{ id: { contains: parsePublicId('delivery', search) ?? search } }, { invoice: { number: { contains: search, mode: 'insensitive' } } }, { invoice: { externalOrderId: { contains: search, mode: 'insensitive' } } }] }
          : {}),
      },
      include: { invoice: { select: { number: true, externalOrderId: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    res.json({ data: page.map(presentDeliveryRow), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.get('/deliveries/:deliveryId', ...member, async (req, res, next) => {
  try {
    const raw = parsePublicId('delivery', String(req.params.deliveryId)) ?? String(req.params.deliveryId);
    const d = await prisma.delivery.findFirst({
      where: { id: raw, workspaceId: req.workspace!.workspaceId },
      include: { attempts: { orderBy: { attemptNo: 'asc' } }, invoice: { select: { id: true, number: true, externalOrderId: true } } },
    });
    if (!d) throw new AppError('NOT_FOUND', 'Delivery not found');
    res.json({
      data: {
        ...presentDeliveryRow(d),
        invoiceId: d.invoice ? publicId('invoice', d.invoice.id) : null,
        attemptLog: d.attempts.map((a) => ({ attempt: a.attemptNo, outcome: a.outcome, errorCode: a.errorCode, message: a.errorMessage, at: a.startedAt })),
        nextAttemptAt: d.nextAttemptAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Human download of an issued document: tenant-scoped, short-lived signed link. */
sendnaroConsoleRouter.get('/documents/:invoiceId/pdf-link', ...member, async (req, res, next) => {
  try {
    const id = parsePublicId('invoice', String(req.params.invoiceId));
    const doc = id ? await prisma.issuedDocument.findFirst({ where: { id, workspaceId: req.workspace!.workspaceId } }) : null;
    if (!doc?.pdfStorageKey) throw new AppError('NOT_FOUND', 'Document not found or not generated yet');
    res.json({ data: { url: await getStorageProvider().getSignedDownloadUrl(doc.pdfStorageKey, 300), expiresInSeconds: 300 } });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.get('/sandbox/scenarios', ...member, (_req, res) => {
  res.json({ data: SANDBOX_SCENARIOS, retryBaseMs: deliveryPolicy.retryBaseMs });
});

// ----------------------------------------------------------------------------------------------
// Channels (WhatsApp sender; Telegram uses the shared Sendnaro bot)
// ----------------------------------------------------------------------------------------------
const whatsappSchema = z
  .object({
    phoneNumberId: z.string().trim().regex(/^\d{6,20}$/),
    wabaId: z.string().trim().regex(/^\d{6,20}$/).optional(),
    accessToken: z.string().trim().min(20).max(1000),
    appSecret: z.string().trim().min(16).max(200),
    verifyToken: z.string().trim().min(12).max(100),
    apiVersion: z.string().regex(/^v\d+\.\d+$/).optional(),
    templates: z
      .object({
        otp: z.object({ name: z.string().min(1).max(100), language: z.string().min(2).max(10) }).optional(),
        invoice: z.object({ name: z.string().min(1).max(100), language: z.string().min(2).max(10) }).optional(),
        notification: z.object({ name: z.string().min(1).max(100), language: z.string().min(2).max(10) }).optional(),
      })
      .default({}),
  })
  .strict();

sendnaroConsoleRouter.get('/channels', ...member, async (req, res, next) => {
  try {
    const rows = await prisma.channelConnection.findMany({ where: { workspaceId: req.workspace!.workspaceId } });
    const env = parseApiEnv();
    res.json({
      data: {
        whatsapp: rows.filter((r) => r.channel === 'WHATSAPP').map((r) => ({
          id: r.id, environment: r.environment.toLowerCase(), status: r.status, lastError: r.lastError, lastCheckedAt: r.lastCheckedAt,
          config: r.config, // identifiers and template names only; secrets are never returned
          callbackUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/v1/webhooks/whatsapp/${r.id}`,
        })),
        telegram: { sharedBot: true, configured: Boolean(env.TELEGRAM_BOT_TOKEN), botUsername: env.TELEGRAM_BOT_USERNAME ?? null },
        sandbox: 'Sandbox uses simulated channels and needs no setup.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Verifies the credentials with a read-only Graph API call; never sends a message. */
async function checkWhatsAppCredentials(config: WhatsAppConnectionConfig, secrets: WhatsAppSecrets): Promise<{ ok: boolean; error?: string }> {
  try {
    const version = config.apiVersion ?? parseApiEnv().META_WHATSAPP_API_VERSION;
    const res = await fetch(`https://graph.facebook.com/${version}/${config.phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${secrets.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `Meta rejected the credentials (HTTP ${res.status})` };
  } catch {
    return { ok: false, error: 'Could not reach Meta to verify the credentials' };
  }
}

sendnaroConsoleRouter.put('/channels/whatsapp', ...manager, async (req, res, next) => {
  try {
    const body = whatsappSchema.parse(req.body);
    const workspaceId = req.workspace!.workspaceId;
    const config: WhatsAppConnectionConfig = { phoneNumberId: body.phoneNumberId, wabaId: body.wabaId, apiVersion: body.apiVersion, templates: body.templates };
    const secrets: WhatsAppSecrets = { accessToken: body.accessToken, appSecret: body.appSecret, verifyToken: body.verifyToken };
    const check = await checkWhatsAppCredentials(config, secrets);
    const ciphertext = encryptSecret(JSON.stringify(secrets), parseApiEnv().APP_ENCRYPTION_KEY);
    const row = await prisma.channelConnection.upsert({
      where: { workspaceId_environment_channel: { workspaceId, environment: 'LIVE', channel: 'WHATSAPP' } },
      create: { workspaceId, environment: 'LIVE', channel: 'WHATSAPP', status: check.ok ? 'CONNECTED' : 'ERROR', config: config as never, secretCiphertext: ciphertext, lastCheckedAt: new Date(), lastError: check.error ?? null },
      update: { status: check.ok ? 'CONNECTED' : 'ERROR', config: config as never, secretCiphertext: ciphertext, lastCheckedAt: new Date(), lastError: check.error ?? null },
    });
    await writeAuditLog({ workspaceId, actorUserId: req.auth!.userId, action: 'channel.whatsapp_configured', entityType: 'ChannelConnection', entityId: row.id, metadata: { status: row.status } });
    res.json({ data: { id: row.id, status: row.status, error: check.error ?? null } });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.delete('/channels/whatsapp', ...manager, async (req, res, next) => {
  try {
    const workspaceId = req.workspace!.workspaceId;
    await prisma.channelConnection.updateMany({
      where: { workspaceId, environment: 'LIVE', channel: 'WHATSAPP' },
      data: { status: 'NOT_CONNECTED', secretCiphertext: null, lastError: null },
    });
    await writeAuditLog({ workspaceId, actorUserId: req.auth!.userId, action: 'channel.whatsapp_disconnected', entityType: 'ChannelConnection' });
    res.json({ data: { disconnected: true } });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------------------------
// Outgoing webhooks
// ----------------------------------------------------------------------------------------------
const endpointSchema = z
  .object({
    environment: envSchema,
    url: z.string().trim().url().max(500),
    events: z.array(z.enum([...WEBHOOK_EVENT_TYPES, '*'] as [string, ...string[]])).max(10).default(['*']),
  })
  .strict();

sendnaroConsoleRouter.get('/webhooks', ...member, async (req, res, next) => {
  try {
    const rows = await prisma.merchantWebhookEndpoint.findMany({
      where: { workspaceId: req.workspace!.workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 10, include: { event: { select: { type: true } }, attempts: { orderBy: { attemptNo: 'desc' }, take: 1 } } } },
    });
    res.json({
      data: rows.map((e) => ({
        id: publicId('webhookEndpoint', e.id), environment: e.environment.toLowerCase(), url: e.url, events: e.events, active: e.active, lastSuccessAt: e.lastSuccessAt,
        recent: e.deliveries.map((d) => ({ event: d.event.type, status: d.status.toLowerCase(), attempts: d.attemptCount, lastStatus: d.lastStatus, lastError: d.lastError, at: d.createdAt })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.post('/webhooks', ...manager, async (req, res, next) => {
  try {
    const body = endpointSchema.parse(req.body);
    const allowLocal = parseApiEnv().ALLOW_LOCAL_WEBHOOK_TARGETS && body.environment === 'SANDBOX';
    await assertWebhookUrl(body.url, allowLocal); // SSRF check at registration; re-checked at every connect
    const secret = generateWebhookSecret();
    const row = await prisma.merchantWebhookEndpoint.create({
      data: {
        workspaceId: req.workspace!.workspaceId, environment: body.environment, url: body.url, events: body.events,
        secretCiphertext: encryptSecret(secret, parseApiEnv().APP_ENCRYPTION_KEY),
      },
    });
    await writeAuditLog({ workspaceId: row.workspaceId, actorUserId: req.auth!.userId, action: 'webhook.created', entityType: 'MerchantWebhookEndpoint', entityId: row.id });
    res.status(201).json({ data: { id: publicId('webhookEndpoint', row.id), url: row.url, environment: body.environment.toLowerCase(), secret } }); // secret shown once
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.delete('/webhooks/:endpointId', ...manager, async (req, res, next) => {
  try {
    const id = parsePublicId('webhookEndpoint', String(req.params.endpointId));
    const r = id ? await prisma.merchantWebhookEndpoint.deleteMany({ where: { id, workspaceId: req.workspace!.workspaceId } }) : { count: 0 };
    if (r.count === 0) throw new AppError('NOT_FOUND', 'Endpoint not found');
    res.json({ data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

sendnaroConsoleRouter.post('/webhooks/:endpointId/test', ...manager, async (req, res, next) => {
  try {
    const id = parsePublicId('webhookEndpoint', String(req.params.endpointId));
    const endpoint = id ? await prisma.merchantWebhookEndpoint.findFirst({ where: { id, workspaceId: req.workspace!.workspaceId } }) : null;
    if (!endpoint) throw new AppError('NOT_FOUND', 'Endpoint not found');
    await prisma.$transaction((tx) =>
      emitWebhookEvent(tx, { workspaceId: endpoint.workspaceId, environment: endpoint.environment, type: 'delivery.sent', onlyEndpointId: endpoint.id, data: { delivery_id: 'dlv_test_event', channel: 'whatsapp', kind: 'notification', status: 'sandbox_simulated', simulated: true, test: true } }),
    );
    res.json({ data: { queued: true } });
  } catch (err) {
    next(err);
  }
});

export { loadWhatsAppConnection };
