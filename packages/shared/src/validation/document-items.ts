import { z } from 'zod';
import { discountSchema } from './common.js';

/** Shared line-item shape for quotes and invoices. */
export const documentLineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000),
  unitPriceMinorUnits: z.number().int().min(0),
  taxRateId: z.string().optional(),
  taxRatePercent: z.number().min(0).max(100).default(0),
  discount: discountSchema,
});
export type DocumentLineItemInput = z.infer<typeof documentLineItemSchema>;

export const taxModeSchema = z.enum(['EXCLUSIVE', 'INCLUSIVE']);
