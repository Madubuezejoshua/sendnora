import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@sendnaro/database';
import { AppError, isSupportedCurrency } from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requirePlatformAdmin } from '../../middleware/authorize.js';
import { writeAuditLog } from '../../services/audit.service.js';
import { getBillingSettings, saveBillingSettings } from '../entitlement.js';
import { computeActivationRevenue } from './activation.service.js';
import { getActivationGateway } from './gateway.js';

/**
 * Platform-admin controls. Every route is guarded individually; admin rights come from the verified
 * session token (database-backed isPlatformAdmin), never from a profile field or request parameter.
 */
export const sendnaroAdminRouter = Router();
const guard = [requireAuth, requirePlatformAdmin];

const patchSchema = z
  .object({
    billingRequired: z.boolean().optional(),
    activationPriceMinor: z.number().int().min(1).max(1_000_000_000).optional(),
    activationCurrency: z.string().length(3).toUpperCase().optional(),
    /** Enabling billing changes who can send, so it needs an explicit confirmation. */
    confirm: z.boolean().optional(),
  })
  .strict();

async function readiness() {
  const gw = getActivationGateway();
  const settings = await getBillingSettings();
  const problems: string[] = [];
  if (!gw.isConfigured()) problems.push('Payment gateway secret key is not configured');
  if (!settings.activationPriceMinor) problems.push('Activation price is not set');
  return { gateway: gw.name, configured: gw.isConfigured(), mode: gw.isLiveMode() ? 'live' : 'test', ready: problems.length === 0, problems };
}

sendnaroAdminRouter.get('/admin/billing', ...guard, async (_req, res, next) => {
  try {
    const [settings, ready, revenue, payments, entitlements] = await Promise.all([
      getBillingSettings(),
      readiness(),
      computeActivationRevenue(),
      prisma.activationPayment.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { workspace: { select: { name: true } } } }),
      prisma.entitlement.findMany({ orderBy: { grantedAt: 'desc' }, take: 50, include: { workspace: { select: { name: true } } } }),
    ]);
    res.json({
      data: {
        settings,
        readiness: ready,
        revenue, // verified live-mode payments net of refunds, per currency; never summed across currencies
        payments: payments.map((p) => ({
          id: p.id, business: p.workspace.name, reference: p.reference, amountMinor: p.amountMinor, currency: p.currency,
          status: p.status, livemode: p.livemode, refundedMinor: p.refundedAmountMinor, createdAt: p.createdAt, verifiedAt: p.verifiedAt,
        })),
        entitlements: entitlements.map((e) => ({
          workspaceId: e.workspaceId, business: e.workspace.name, source: e.source, grantedAt: e.grantedAt, revokedAt: e.revokedAt, revokedReason: e.revokedReason, note: e.note,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.patch('/admin/billing', ...guard, async (req, res, next) => {
  try {
    const patch = patchSchema.parse(req.body);
    if (patch.activationCurrency && !isSupportedCurrency(patch.activationCurrency)) {
      throw new AppError('UNPROCESSABLE', 'Unsupported activation currency');
    }
    const before = await getBillingSettings();
    const { confirm, ...changes } = patch;

    if (changes.billingRequired === true && !before.billingRequired) {
      if (!confirm) {
        throw new AppError('UNPROCESSABLE', 'Enabling billing changes access for every business. Resend with confirm: true.');
      }
      // Fail safely: refuse to enable until the gateway and the price are ready.
      const effectivePrice = changes.activationPriceMinor ?? before.activationPriceMinor;
      const gw = getActivationGateway();
      if (!gw.isConfigured() || !effectivePrice) {
        throw new AppError('CONFLICT', 'billing_not_ready: configure the payment gateway key and the activation price before enabling billing');
      }
    }
    await saveBillingSettings(changes);
    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: 'billing.settings_changed',
      entityType: 'ApplicationSetting',
      metadata: { before, changes },
      ipAddress: req.ip,
    });
    res.json({ data: { settings: await getBillingSettings(), readiness: await readiness() } });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.get('/admin/businesses', ...guard, async (_req, res, next) => {
  try {
    const rows = await prisma.workspace.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, name: true, createdAt: true, suspendedAt: true, suspendedReason: true, entitlement: { select: { source: true, revokedAt: true } } },
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.post('/admin/businesses/:workspaceId/suspend', ...guard, async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 300) : 'Suspended by platform admin';
    await prisma.workspace.update({ where: { id: String(req.params.workspaceId) }, data: { suspendedAt: new Date(), suspendedReason: reason } });
    await writeAuditLog({ workspaceId: String(req.params.workspaceId), actorUserId: req.auth!.userId, action: 'business.suspended', entityType: 'Workspace', entityId: String(req.params.workspaceId), metadata: { reason } });
    res.json({ data: { suspended: true } });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.post('/admin/businesses/:workspaceId/unsuspend', ...guard, async (req, res, next) => {
  try {
    await prisma.workspace.update({ where: { id: String(req.params.workspaceId) }, data: { suspendedAt: null, suspendedReason: null } });
    await writeAuditLog({ workspaceId: String(req.params.workspaceId), actorUserId: req.auth!.userId, action: 'business.unsuspended', entityType: 'Workspace', entityId: String(req.params.workspaceId) });
    res.json({ data: { suspended: false } });
  } catch (err) {
    next(err);
  }
});

/** Owner-issued complimentary activation: recorded as COMPLIMENTARY, never as gateway revenue. */
sendnaroAdminRouter.post('/admin/entitlements/:workspaceId/complimentary', ...guard, async (req, res, next) => {
  try {
    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 300) : null;
    if (!note) throw new AppError('VALIDATION_ERROR', 'A note explaining the complimentary activation is required');
    const workspaceId = String(req.params.workspaceId);
    await prisma.entitlement.upsert({
      where: { workspaceId },
      create: { workspaceId, source: 'COMPLIMENTARY', grantedById: req.auth!.userId, note },
      update: { source: 'COMPLIMENTARY', grantedById: req.auth!.userId, note, revokedAt: null, revokedReason: null, grantedAt: new Date(), activationPaymentId: null },
    });
    await writeAuditLog({ workspaceId, actorUserId: req.auth!.userId, action: 'billing.complimentary_granted', entityType: 'Entitlement', entityId: workspaceId, metadata: { note } });
    res.json({ data: { granted: true } });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.post('/admin/entitlements/:workspaceId/revoke', ...guard, async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 300) : 'revoked_by_admin';
    const r = await prisma.entitlement.updateMany({ where: { workspaceId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    if (r.count === 0) throw new AppError('NOT_FOUND', 'No active entitlement for this business');
    await writeAuditLog({ workspaceId, actorUserId: req.auth!.userId, action: 'billing.entitlement_revoked', entityType: 'Entitlement', entityId: workspaceId, metadata: { reason } });
    res.json({ data: { revoked: true } });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.get('/admin/audit', ...guard, async (_req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { OR: [{ action: { startsWith: 'billing.' } }, { action: { startsWith: 'business.' } }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

sendnaroAdminRouter.get('/admin/overview', ...guard, async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [users, businesses, activeKeys, entitlements, byStatus, deadJobs] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count({ where: { deletedAt: null } }),
      prisma.apiKey.count({ where: { revokedAt: null } }),
      prisma.entitlement.groupBy({ by: ['source'], where: { revokedAt: null }, _count: true }),
      prisma.delivery.groupBy({ by: ['environment', 'status'], where: { createdAt: { gte: since } }, _count: true }),
      prisma.outboxEvent.count({ where: { status: 'DEAD' } }),
    ]);
    res.json({
      data: {
        users,
        businesses,
        activeKeys,
        entitlements: entitlements.map((e) => ({ source: e.source, count: e._count })),
        deliveriesLast7Days: byStatus.map((d) => ({ environment: d.environment.toLowerCase(), status: d.status.toLowerCase(), count: d._count })),
        deadJobs,
      },
    });
  } catch (err) {
    next(err);
  }
});
