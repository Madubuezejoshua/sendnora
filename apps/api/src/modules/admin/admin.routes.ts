import { Router } from 'express';
import { z } from 'zod';
import { PLAN_CODES, paginationQuerySchema } from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requirePlatformAdmin } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { writeAuditLog } from '../../services/audit.service.js';
import * as adminService from './admin.service.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requirePlatformAdmin);

adminRouter.get('/admin/stats', async (_req, res, next) => {
  try {
    res.json({ data: await adminService.getPlatformStats() });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/users', validateQuery(paginationQuerySchema), async (req, res, next) => {
  try {
    res.json(await adminService.listUsers(req.query as never));
  } catch (err) {
    next(err);
  }
});

adminRouter.get(
  '/admin/workspaces',
  validateQuery(paginationQuerySchema),
  async (req, res, next) => {
    try {
      res.json(await adminService.listWorkspacesAdmin(req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/admin/workspaces/:workspaceId/subscription',
  validateBody(
    z.object({
      planCode: z.enum(PLAN_CODES),
      status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']),
    }),
  ),
  async (req, res, next) => {
    try {
      const subscription = await adminService.overrideSubscription(
        req.params.workspaceId!,
        req.body.planCode,
        req.body.status,
      );
      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: 'admin.subscription_override',
        entityType: 'Workspace',
        entityId: req.params.workspaceId,
        metadata: req.body,
      });
      res.json({ data: subscription });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/admin/webhook-events',
  validateQuery(
    paginationQuerySchema.extend({
      status: z.string().optional(),
      provider: z.string().optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      res.json(await adminService.listWebhookEvents(req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/admin/failed-jobs', async (_req, res, next) => {
  try {
    res.json({ data: await adminService.listFailedRecurringInvoices() });
  } catch (err) {
    next(err);
  }
});

adminRouter.get(
  '/admin/support-tickets',
  validateQuery(paginationQuerySchema.extend({ status: z.string().optional() })),
  async (req, res, next) => {
    try {
      res.json(await adminService.listSupportTicketsAdmin(req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/admin/contact-submissions',
  validateQuery(paginationQuerySchema),
  async (req, res, next) => {
    try {
      res.json(await adminService.listContactSubmissions(req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/admin/audit-logs',
  validateQuery(paginationQuerySchema.extend({ workspaceId: z.string().optional() })),
  async (req, res, next) => {
    try {
      res.json(await adminService.listAuditLogs(req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/admin/email-logs',
  validateQuery(paginationQuerySchema),
  async (req, res, next) => {
    try {
      res.json(await adminService.listEmailLogs(req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/admin/feature-flags', async (_req, res, next) => {
  try {
    res.json({ data: await adminService.listFeatureFlags() });
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  '/admin/feature-flags/:key',
  validateBody(
    z.object({
      enabled: z.boolean(),
      description: z.string().optional(),
      rolloutPercentage: z.number().min(0).max(100).optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      const flag = await adminService.upsertFeatureFlag(
        req.params.key!,
        req.body.enabled,
        req.body.description,
        req.body.rolloutPercentage,
      );
      res.json({ data: flag });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/admin/system-health', async (_req, res, next) => {
  try {
    res.json({ data: await adminService.getSystemHealth() });
  } catch (err) {
    next(err);
  }
});
