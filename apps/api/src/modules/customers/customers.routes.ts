import { Router } from 'express';
import multer from 'multer';
import {
  AppError,
  createCustomerSchema,
  paginationQuerySchema,
  updateCustomerSchema,
} from '@invoicetap/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { CsvParseError } from '../../services/csv.service.js';
import { createTelegramLink } from '../../services/telegram/telegram.service.js';
import * as customersService from './customers.service.js';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

export const customersRouter = Router();
customersRouter.use(requireAuth, requireWorkspace);

customersRouter.get(
  '/customers',
  requirePermission('customer:read'),
  validateQuery(paginationQuerySchema.extend({}).passthrough()),
  async (req, res, next) => {
    try {
      const query = {
        ...req.query,
        status: (req.query as Record<string, string>).status,
      } as Parameters<typeof customersService.listCustomers>[1];
      res.json(await customersService.listCustomers(req.workspace!.workspaceId, query));
    } catch (err) {
      next(err);
    }
  },
);

// Registered before the /:customerId routes below — otherwise Express would
// match "export"/"import" as a :customerId value.
customersRouter.get(
  '/customers/export',
  requirePermission('customer:read'),
  async (req, res, next) => {
    try {
      const csv = await customersService.exportCustomersCsv(req.workspace!.workspaceId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/customers/import',
  requirePermission('customer:write'),
  csvUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('VALIDATION_ERROR', 'No CSV file uploaded');
      const summary = await customersService.importCustomersFromCsv(
        req.workspace!.workspaceId,
        req.file.buffer,
      );
      res.json({ data: summary });
    } catch (err) {
      if (err instanceof CsvParseError) {
        next(new AppError('VALIDATION_ERROR', err.message));
        return;
      }
      next(err);
    }
  },
);

customersRouter.get(
  '/customers/:customerId',
  requirePermission('customer:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await customersService.getCustomer(
          req.workspace!.workspaceId,
          req.params.customerId!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/customers/:customerId/statement',
  requirePermission('customer:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await customersService.getCustomerStatementSummary(
          req.workspace!.workspaceId,
          req.params.customerId!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/customers',
  requirePermission('customer:write'),
  validateBody(createCustomerSchema),
  async (req, res, next) => {
    try {
      const customer = await customersService.createCustomer(req.workspace!.workspaceId, req.body);
      res.status(201).json({ data: customer });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.patch(
  '/customers/:customerId',
  requirePermission('customer:write'),
  validateBody(updateCustomerSchema),
  async (req, res, next) => {
    try {
      const customer = await customersService.updateCustomer(
        req.workspace!.workspaceId,
        req.params.customerId!,
        req.body,
      );
      res.json({ data: customer });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/customers/:customerId/archive',
  requirePermission('customer:delete'),
  async (req, res, next) => {
    try {
      res.json({
        data: await customersService.archiveCustomer(
          req.workspace!.workspaceId,
          req.params.customerId!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/customers/:customerId/restore',
  requirePermission('customer:write'),
  async (req, res, next) => {
    try {
      res.json({
        data: await customersService.restoreCustomer(
          req.workspace!.workspaceId,
          req.params.customerId!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/customers/:customerId/telegram-link',
  requirePermission('customer:write'),
  async (req, res, next) => {
    try {
      res.json({
        data: await createTelegramLink(req.workspace!.workspaceId, req.params.customerId!),
      });
    } catch (err) {
      next(err);
    }
  },
);
