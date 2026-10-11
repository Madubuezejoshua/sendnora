import { Router } from 'express';
import { createRecurringInvoiceSchema, paginationQuerySchema } from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import * as recurringService from './recurring-invoices.service.js';

export const recurringInvoicesRouter = Router();
recurringInvoicesRouter.use(requireAuth, requireWorkspace);

recurringInvoicesRouter.get(
  '/recurring-invoices',
  requirePermission('invoice:read'),
  validateQuery(paginationQuerySchema),
  async (req, res, next) => {
    try {
      res.json(
        await recurringService.listRecurringInvoices(
          req.workspace!.workspaceId,
          req.query as never,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

recurringInvoicesRouter.get(
  '/recurring-invoices/:id',
  requirePermission('invoice:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await recurringService.getRecurringInvoice(
          req.workspace!.workspaceId,
          req.params.id!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

recurringInvoicesRouter.post(
  '/recurring-invoices',
  requirePermission('invoice:write'),
  validateBody(createRecurringInvoiceSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        data: await recurringService.createRecurringInvoice(
          req.workspace!.workspaceId,
          req.auth!.userId,
          req.body,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

recurringInvoicesRouter.post(
  '/recurring-invoices/:id/pause',
  requirePermission('invoice:write'),
  async (req, res, next) => {
    try {
      res.json({
        data: await recurringService.pauseRecurringInvoice(
          req.workspace!.workspaceId,
          req.params.id!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

recurringInvoicesRouter.post(
  '/recurring-invoices/:id/resume',
  requirePermission('invoice:write'),
  async (req, res, next) => {
    try {
      res.json({
        data: await recurringService.resumeRecurringInvoice(
          req.workspace!.workspaceId,
          req.params.id!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);
