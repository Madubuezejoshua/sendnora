import { Router } from 'express';
import { z } from 'zod';
import {
  createQuoteSchema,
  paginationQuerySchema,
  respondToQuoteSchema,
  sendQuoteSchema,
  updateQuoteSchema,
} from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { generateQuotePdfBuffer } from '../../services/pdf/pdf-request.service.js';
import * as quotesService from './quotes.service.js';

export const quotesRouter = Router();
quotesRouter.use(requireAuth, requireWorkspace);

quotesRouter.get(
  '/quotes',
  requirePermission('quote:read'),
  validateQuery(paginationQuerySchema.passthrough()),
  async (req, res, next) => {
    try {
      const query = {
        ...req.query,
        status: (req.query as Record<string, string>).status,
      } as Parameters<typeof quotesService.listQuotes>[1];
      res.json(await quotesService.listQuotes(req.workspace!.workspaceId, query));
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.get('/quotes/:quoteId', requirePermission('quote:read'), async (req, res, next) => {
  try {
    res.json({
      data: await quotesService.getQuote(req.workspace!.workspaceId, req.params.quoteId!),
    });
  } catch (err) {
    next(err);
  }
});

quotesRouter.post(
  '/quotes',
  requirePermission('quote:write'),
  validateBody(createQuoteSchema),
  async (req, res, next) => {
    try {
      const quote = await quotesService.createQuote(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.body,
      );
      res.status(201).json({ data: quote });
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.patch(
  '/quotes/:quoteId',
  requirePermission('quote:write'),
  validateBody(updateQuoteSchema),
  async (req, res, next) => {
    try {
      res.json({
        data: await quotesService.updateQuote(
          req.workspace!.workspaceId,
          req.params.quoteId!,
          req.body,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.post(
  '/quotes/:quoteId/send',
  requirePermission('quote:send'),
  validateBody(sendQuoteSchema),
  async (req, res, next) => {
    try {
      res.json({
        data: await quotesService.transitionQuoteStatus(
          req.workspace!.workspaceId,
          req.params.quoteId!,
          'SENT',
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.post(
  '/quotes/:quoteId/respond',
  requirePermission('quote:write'),
  validateBody(respondToQuoteSchema),
  async (req, res, next) => {
    try {
      const quote = await quotesService.transitionQuoteStatus(
        req.workspace!.workspaceId,
        req.params.quoteId!,
        req.body.decision,
        {
          rejectionReason: req.body.reason,
        },
      );
      res.json({ data: quote });
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.post(
  '/quotes/:quoteId/cancel',
  requirePermission('quote:write'),
  async (req, res, next) => {
    try {
      res.json({
        data: await quotesService.transitionQuoteStatus(
          req.workspace!.workspaceId,
          req.params.quoteId!,
          'CANCELLED',
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.get(
  '/quotes/:quoteId/pdf',
  requirePermission('quote:read'),
  async (req, res, next) => {
    try {
      const { buffer, filename } = await generateQuotePdfBuffer(
        req.workspace!.workspaceId,
        req.params.quoteId!,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.post(
  '/quotes/:quoteId/duplicate',
  requirePermission('quote:write'),
  async (req, res, next) => {
    try {
      const quote = await quotesService.duplicateQuote(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.params.quoteId!,
      );
      res.status(201).json({ data: quote });
    } catch (err) {
      next(err);
    }
  },
);

quotesRouter.post(
  '/quotes/:quoteId/convert',
  requirePermission('invoice:write'),
  validateBody(z.object({ dueDate: z.coerce.date() })),
  async (req, res, next) => {
    try {
      const invoice = await quotesService.convertQuoteToInvoice(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.params.quoteId!,
        req.body.dueDate,
      );
      res.status(201).json({ data: invoice });
    } catch (err) {
      next(err);
    }
  },
);
