import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import * as dashboardService from './dashboard.service.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireWorkspace);

dashboardRouter.get('/dashboard', requirePermission('report:read'), async (req, res, next) => {
  try {
    res.json({ data: await dashboardService.getDashboardSummary(req.workspace!.workspaceId) });
  } catch (err) {
    next(err);
  }
});
