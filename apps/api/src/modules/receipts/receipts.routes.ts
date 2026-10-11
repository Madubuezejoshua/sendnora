import { Router } from 'express';
import { z } from 'zod';
import { paginationQuerySchema } from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { generateReceiptPdfBuffer } from '../../services/pdf/pdf-request.service.js';
import * as receiptsService from './receipts.service.js';

export const receiptsRouter = Router();
receiptsRouter.use(requireAuth, requireWorkspace);

receiptsRouter.get(
  '/receipts',
  requirePermission('receipt:read'),
  validateQuery(paginationQuerySchema),
  async (req, res, next) => {
    try {
      res.json(await receiptsService.listReceipts(req.workspace!.workspaceId, req.query as never));
    } catch (err) {
      next(err);
    }
  },
);

receiptsRouter.get(
  '/receipts/:receiptId',
  requirePermission('receipt:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await receiptsService.getReceipt(req.workspace!.workspaceId, req.params.receiptId!),
      });
    } catch (err) {
      next(err);
    }
  },
);

receiptsRouter.get(
  '/receipts/:receiptId/pdf',
  requirePermission('receipt:read'),
  async (req, res, next) => {
    try {
      const { buffer, filename } = await generateReceiptPdfBuffer(
        req.workspace!.workspaceId,
        req.params.receiptId!,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

receiptsRouter.post(
  '/receipts/:receiptId/void',
  requirePermission('payment:refund'),
  validateBody(z.object({ reason: z.string().min(1).max(1000) })),
  async (req, res, next) => {
    try {
      res.json({
        data: await receiptsService.voidReceipt(
          req.workspace!.workspaceId,
          req.params.receiptId!,
          req.body.reason,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);
