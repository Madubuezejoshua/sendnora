import { Router } from 'express';
import {
  createExpenseSchema,
  paginationQuerySchema,
  updateExpenseSchema,
} from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import * as expensesService from './expenses.service.js';

export const expensesRouter = Router();
expensesRouter.use(requireAuth, requireWorkspace);

expensesRouter.get(
  '/expenses',
  requirePermission('expense:read'),
  validateQuery(paginationQuerySchema.passthrough()),
  async (req, res, next) => {
    try {
      res.json(await expensesService.listExpenses(req.workspace!.workspaceId, req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

expensesRouter.get(
  '/expenses/:expenseId',
  requirePermission('expense:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await expensesService.getExpense(req.workspace!.workspaceId, req.params.expenseId!),
      });
    } catch (err) {
      next(err);
    }
  },
);

expensesRouter.post(
  '/expenses',
  requirePermission('expense:write'),
  validateBody(createExpenseSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        data: await expensesService.createExpense(
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

expensesRouter.patch(
  '/expenses/:expenseId',
  requirePermission('expense:write'),
  validateBody(updateExpenseSchema),
  async (req, res, next) => {
    try {
      res.json({
        data: await expensesService.updateExpense(
          req.workspace!.workspaceId,
          req.params.expenseId!,
          req.body,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

expensesRouter.delete(
  '/expenses/:expenseId',
  requirePermission('expense:write'),
  async (req, res, next) => {
    try {
      await expensesService.deleteExpense(req.workspace!.workspaceId, req.params.expenseId!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
