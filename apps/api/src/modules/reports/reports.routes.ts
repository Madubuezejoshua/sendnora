import { Router } from 'express';
import { z } from 'zod';
import { currencyCodeSchema } from '@invoicetap/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateQuery } from '../../middleware/validate.js';
import * as reportsService from './reports.service.js';
import type { ReportDateRange } from './reports.service.js';

const reportQuerySchema = z.object({
  currency: currencyCodeSchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function resolveRange(query: { from?: Date; to?: Date }): ReportDateRange {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export const reportsRouter = Router();
reportsRouter.use(
  '/reports',
  requireAuth,
  requireWorkspace,
  requirePermission('report:read'),
  validateQuery(reportQuerySchema),
);

reportsRouter.get('/reports/revenue-by-period', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.revenueByPeriod(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/revenue-by-customer', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.revenueByCustomer(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/revenue-by-product', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.revenueByProduct(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/outstanding-invoices', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.outstandingInvoices(req.workspace!.workspaceId, q.currency),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/overdue-ageing', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({ data: await reportsService.overdueAgeing(req.workspace!.workspaceId, q.currency) });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/payment-methods', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.paymentMethodBreakdown(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/tax-summary', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.taxSummary(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/discount-summary', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.discountSummary(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/expenses', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.expenseSummary(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/profit-estimate', async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    res.json({
      data: await reportsService.profitEstimate(
        req.workspace!.workspaceId,
        q.currency,
        resolveRange(q),
      ),
    });
  } catch (err) {
    next(err);
  }
});
