import { z } from 'zod';
import { currencyCodeSchema, discountSchema } from './common.js';
import { documentLineItemSchema, taxModeSchema } from './document-items.js';
import { PAYMENT_METHODS } from '../constants/document-status.js';

export const createInvoiceSchema = z.object({
  customerId: z.string().min(1),
  currency: currencyCodeSchema,
  taxMode: taxModeSchema.default('EXCLUSIVE'),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  lineItems: z.array(documentLineItemSchema).min(1, 'Add at least one line item'),
  documentDiscount: discountSchema,
  shippingMinorUnits: z.number().int().min(0).default(0),
  additionalFeesMinorUnits: z.number().int().min(0).default(0),
  depositRequiredMinorUnits: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
  paymentInstructions: z.string().max(2000).optional(),
  sourceQuoteId: z.string().optional(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = createInvoiceSchema.partial();

export const recordPaymentSchema = z.object({
  amountMinorUnits: z.number().int().positive(),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.coerce.date().default(() => new Date()),
  reference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const createCreditNoteSchema = z.object({
  amountMinorUnits: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
});

export const sendInvoiceSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']),
});

export const createRecurringInvoiceSchema = z.object({
  customerId: z.string().min(1),
  currency: currencyCodeSchema,
  taxMode: taxModeSchema.default('EXCLUSIVE'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM']),
  customIntervalDays: z.number().int().min(1).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  autoIssue: z.boolean().default(false),
  dueInDays: z.number().int().min(0).default(14),
  lineItems: z.array(documentLineItemSchema).min(1),
  documentDiscount: discountSchema,
  shippingMinorUnits: z.number().int().min(0).default(0),
  additionalFeesMinorUnits: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
});
export type CreateRecurringInvoiceInput = z.infer<typeof createRecurringInvoiceSchema>;
