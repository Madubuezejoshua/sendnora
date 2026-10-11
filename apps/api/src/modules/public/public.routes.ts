import { Router } from 'express';
import { z } from 'zod';
import { assertQuoteTransition } from '@invoicetap/shared';
import { prisma } from '@invoicetap/database';
import { parseApiEnv } from '@invoicetap/config/env';
import { validateBody } from '../../middleware/validate.js';
import { publicDocumentRateLimit } from '../../middleware/rate-limit.js';
import * as invoicesService from '../invoices/invoices.service.js';
import * as quotesService from '../quotes/quotes.service.js';
import * as receiptsService from '../receipts/receipts.service.js';
import * as paymentsService from '../payments/payments.service.js';
import {
  generateInvoicePdfBuffer,
  generateQuotePdfBuffer,
  generateReceiptPdfBuffer,
} from '../../services/pdf/pdf-request.service.js';

/**
 * Unauthenticated, token-scoped document views. Never accepts an internal
 * database id — only the random `publicToken` — so links can be shared and
 * revoked independently of any session. See packages/shared/src/utils/tokens.ts.
 */
export const publicRouter = Router();
publicRouter.use('/public', publicDocumentRateLimit);

publicRouter.get('/public/invoices/:token', async (req, res, next) => {
  try {
    const invoice = await invoicesService.getInvoiceByPublicToken(req.params.token!);
    await invoicesService.markInvoiceViewed(req.params.token!);
    res.json({ data: invoice });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/public/quotes/:token', async (req, res, next) => {
  try {
    const quote = await quotesService.getQuoteByPublicToken(req.params.token!);
    if (quote.status === 'SENT') {
      await prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'VIEWED', viewedAt: new Date() },
      });
    }
    res.json({ data: quote });
  } catch (err) {
    next(err);
  }
});

publicRouter.post(
  '/public/quotes/:token/respond',
  validateBody(
    z.object({
      decision: z.enum(['ACCEPTED', 'REJECTED']),
      reason: z.string().max(1000).optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      const quote = await quotesService.getQuoteByPublicToken(req.params.token!);
      assertQuoteTransition(quote.status, req.body.decision);
      const updated = await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: req.body.decision,
          respondedAt: new Date(),
          rejectionReason: req.body.decision === 'REJECTED' ? req.body.reason : undefined,
        },
      });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

publicRouter.get('/public/receipts/:token', async (req, res, next) => {
  try {
    res.json({ data: await receiptsService.getReceiptByPublicToken(req.params.token!) });
  } catch (err) {
    next(err);
  }
});

publicRouter.post(
  '/public/invoices/:token/pay',
  validateBody(z.object({ provider: z.enum(['PAYSTACK', 'FLUTTERWAVE']) })),
  async (req, res, next) => {
    try {
      const invoice = await invoicesService.getInvoiceByPublicToken(req.params.token!);
      const env = parseApiEnv();
      const result = await paymentsService.initializePaymentForInvoice(
        invoice.workspaceId,
        invoice.id,
        req.body.provider,
        env.NEXT_PUBLIC_APP_URL,
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

publicRouter.get('/public/invoices/:token/pdf', async (req, res, next) => {
  try {
    const invoice = await invoicesService.getInvoiceByPublicToken(req.params.token!);
    const { buffer, filename } = await generateInvoicePdfBuffer(invoice.workspaceId, invoice.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/public/quotes/:token/pdf', async (req, res, next) => {
  try {
    const quote = await quotesService.getQuoteByPublicToken(req.params.token!);
    const { buffer, filename } = await generateQuotePdfBuffer(quote.workspaceId, quote.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/public/receipts/:token/pdf', async (req, res, next) => {
  try {
    const receipt = await receiptsService.getReceiptByPublicToken(req.params.token!);
    const { buffer, filename } = await generateReceiptPdfBuffer(receipt.workspaceId, receipt.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/** Lightweight existence check used by the receipt QR-code verification page. */
publicRouter.get('/public/receipts/:token/verify', async (req, res) => {
  try {
    const receipt = await receiptsService.getReceiptByPublicToken(req.params.token!);
    res.json({
      data: {
        valid: receipt.status === 'ISSUED',
        number: receipt.number,
        amountMinorUnits: receipt.amountMinorUnits,
        currency: receipt.currency,
        paidAt: receipt.paidAt,
      },
    });
  } catch {
    res.json({ data: { valid: false } });
  }
});
