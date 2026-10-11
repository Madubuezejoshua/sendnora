import { Router } from 'express';
import {
  createInvoiceSchema,
  createCreditNoteSchema,
  paginationQuerySchema,
  recordPaymentSchema,
  sendInvoiceSchema,
  updateInvoiceSchema,
  voidInvoiceSchema,
} from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { writeAuditLog } from '../../services/audit.service.js';
import { generateInvoicePdfBuffer } from '../../services/pdf/pdf-request.service.js';
import { sendInvoiceViaTelegram } from './invoice-telegram.service.js';
import * as invoicesService from './invoices.service.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireWorkspace);

invoicesRouter.get(
  '/invoices',
  requirePermission('invoice:read'),
  validateQuery(paginationQuerySchema.passthrough()),
  async (req, res, next) => {
    try {
      const query = {
        ...req.query,
        status: (req.query as Record<string, string>).status,
      } as Parameters<typeof invoicesService.listInvoices>[1];
      res.json(await invoicesService.listInvoices(req.workspace!.workspaceId, query));
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.get(
  '/invoices/:invoiceId',
  requirePermission('invoice:read'),
  async (req, res, next) => {
    try {
      res.json({
        data: await invoicesService.getInvoice(req.workspace!.workspaceId, req.params.invoiceId!),
      });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices',
  requirePermission('invoice:write'),
  validateBody(createInvoiceSchema),
  async (req, res, next) => {
    try {
      const invoice = await invoicesService.createInvoice(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.body,
      );
      res.status(201).json({ data: invoice });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.patch(
  '/invoices/:invoiceId',
  requirePermission('invoice:write'),
  validateBody(updateInvoiceSchema),
  async (req, res, next) => {
    try {
      res.json({
        data: await invoicesService.updateInvoice(
          req.workspace!.workspaceId,
          req.params.invoiceId!,
          req.body,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices/:invoiceId/issue',
  requirePermission('invoice:issue'),
  async (req, res, next) => {
    try {
      const invoice = await invoicesService.issueInvoice(
        req.workspace!.workspaceId,
        req.params.invoiceId!,
      );
      await writeAuditLog({
        workspaceId: req.workspace!.workspaceId,
        actorUserId: req.auth!.userId,
        action: 'invoice.issued',
        entityType: 'Invoice',
        entityId: invoice.id,
      });
      res.json({ data: invoice });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices/:invoiceId/send',
  requirePermission('invoice:write'),
  validateBody(sendInvoiceSchema),
  async (req, res, next) => {
    try {
      // Actual email/WhatsApp dispatch is orchestrated by apps/web using the email/whatsapp services;
      // this endpoint records the SENT transition when applicable.
      res.json({
        data: await invoicesService.sendInvoice(req.workspace!.workspaceId, req.params.invoiceId!),
      });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices/:invoiceId/send-telegram',
  requirePermission('invoice:write'),
  async (req, res, next) => {
    try {
      res.json({
        data: await sendInvoiceViaTelegram(req.workspace!.workspaceId, req.params.invoiceId!),
      });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices/:invoiceId/payments',
  requirePermission('payment:record'),
  validateBody(recordPaymentSchema),
  async (req, res, next) => {
    try {
      const result = await invoicesService.recordPayment(
        req.workspace!.workspaceId,
        req.params.invoiceId!,
        req.body,
        {
          recordedById: req.auth!.userId,
        },
      );
      await writeAuditLog({
        workspaceId: req.workspace!.workspaceId,
        actorUserId: req.auth!.userId,
        action: 'invoice.payment_recorded',
        entityType: 'Invoice',
        entityId: req.params.invoiceId,
        metadata: { amountMinorUnits: req.body.amountMinorUnits },
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices/:invoiceId/void',
  requirePermission('invoice:void'),
  validateBody(voidInvoiceSchema),
  async (req, res, next) => {
    try {
      const invoice = await invoicesService.voidInvoice(
        req.workspace!.workspaceId,
        req.params.invoiceId!,
        req.body.reason,
      );
      await writeAuditLog({
        workspaceId: req.workspace!.workspaceId,
        actorUserId: req.auth!.userId,
        action: 'invoice.voided',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { reason: req.body.reason },
      });
      res.json({ data: invoice });
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.get(
  '/invoices/:invoiceId/pdf',
  requirePermission('invoice:read'),
  async (req, res, next) => {
    try {
      const { buffer, filename } = await generateInvoicePdfBuffer(
        req.workspace!.workspaceId,
        req.params.invoiceId!,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

invoicesRouter.post(
  '/invoices/:invoiceId/credit-notes',
  requirePermission('invoice:void'),
  validateBody(createCreditNoteSchema),
  async (req, res, next) => {
    try {
      const note = await invoicesService.createCreditNote(
        req.workspace!.workspaceId,
        req.params.invoiceId!,
        req.auth!.userId,
        req.body.amountMinorUnits,
        req.body.reason,
      );
      res.status(201).json({ data: note });
    } catch (err) {
      next(err);
    }
  },
);
