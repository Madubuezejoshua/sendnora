import { Router } from 'express';
import multer from 'multer';
import {
  AppError,
  createCategorySchema,
  createProductSchema,
  createTaxRateSchema,
  paginationQuerySchema,
  updateProductSchema,
} from '@invoicetap/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { CsvParseError } from '../../services/csv.service.js';
import * as productsService from './products.service.js';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

export const productsRouter = Router();
productsRouter.use(requireAuth, requireWorkspace);

productsRouter.get(
  '/products',
  requirePermission('product:read'),
  validateQuery(paginationQuerySchema.passthrough()),
  async (req, res, next) => {
    try {
      const query = {
        ...req.query,
        status: (req.query as Record<string, string>).status,
      } as Parameters<typeof productsService.listProducts>[1];
      res.json(await productsService.listProducts(req.workspace!.workspaceId, query));
    } catch (err) {
      next(err);
    }
  },
);

// Registered before /:productId below — otherwise Express would match
// "export"/"import" as a :productId value.
productsRouter.get(
  '/products/export',
  requirePermission('product:read'),
  async (req, res, next) => {
    try {
      const csv = await productsService.exportProductsCsv(req.workspace!.workspaceId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  '/products/import',
  requirePermission('product:write'),
  csvUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('VALIDATION_ERROR', 'No CSV file uploaded');
      const summary = await productsService.importProductsFromCsv(
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

productsRouter.get(
  '/products/:productId',
  requirePermission('product:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await productsService.getProduct(req.workspace!.workspaceId, req.params.productId!),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  '/products',
  requirePermission('product:write'),
  validateBody(createProductSchema),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json({ data: await productsService.createProduct(req.workspace!.workspaceId, req.body) });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.patch(
  '/products/:productId',
  requirePermission('product:write'),
  validateBody(updateProductSchema),
  async (req, res, next) => {
    try {
      res.json({
        data: await productsService.updateProduct(
          req.workspace!.workspaceId,
          req.params.productId!,
          req.body,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  '/products/:productId/archive',
  requirePermission('product:delete'),
  async (req, res, next) => {
    try {
      res.json({
        data: await productsService.archiveProduct(
          req.workspace!.workspaceId,
          req.params.productId!,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.get('/categories', requirePermission('product:read'), async (req, res, next) => {
  try {
    res.json({ data: await productsService.listCategories(req.workspace!.workspaceId) });
  } catch (err) {
    next(err);
  }
});

productsRouter.post(
  '/categories',
  requirePermission('product:write'),
  validateBody(createCategorySchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        data: await productsService.createCategory(req.workspace!.workspaceId, req.body.name),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.get('/tax-rates', requirePermission('product:read'), async (req, res, next) => {
  try {
    res.json({ data: await productsService.listTaxRates(req.workspace!.workspaceId) });
  } catch (err) {
    next(err);
  }
});

productsRouter.post(
  '/tax-rates',
  requirePermission('product:write'),
  validateBody(createTaxRateSchema),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json({ data: await productsService.createTaxRate(req.workspace!.workspaceId, req.body) });
    } catch (err) {
      next(err);
    }
  },
);
