import { z } from 'zod';
import { currencyCodeSchema, discountSchema } from './common.js';
import { documentLineItemSchema, taxModeSchema } from './document-items.js';

export const createQuoteSchema = z.object({
  customerId: z.string().min(1),
  currency: currencyCodeSchema,
  taxMode: taxModeSchema.default('EXCLUSIVE'),
  issueDate: z.coerce.date(),
  expiryDate: z.coerce.date().optional(),
  lineItems: z.array(documentLineItemSchema).min(1, 'Add at least one line item'),
  documentDiscount: discountSchema,
  shippingMinorUnits: z.number().int().min(0).default(0),
  additionalFeesMinorUnits: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(4000).optional(),
  internalNotes: z.string().max(2000).optional(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const updateQuoteSchema = createQuoteSchema.partial();

export const sendQuoteSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']),
});

export const respondToQuoteSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  reason: z.string().max(1000).optional(),
});
