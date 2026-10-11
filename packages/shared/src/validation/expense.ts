import { z } from 'zod';
import { currencyCodeSchema } from './common.js';
import { PAYMENT_METHODS } from '../constants/document-status.js';

export const createExpenseSchema = z.object({
  vendor: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(80),
  amountMinorUnits: z.number().int().positive(),
  currency: currencyCodeSchema,
  incurredAt: z.coerce.date(),
  taxAmountMinorUnits: z.number().int().min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  description: z.string().max(1000).optional(),
  isRecurring: z.boolean().default(false),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
