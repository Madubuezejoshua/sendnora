import { z } from 'zod';
import { addressSchema, currencyCodeSchema, emailSchema } from './common.js';

export const customerTypeSchema = z.enum(['INDIVIDUAL', 'BUSINESS']);

export const createCustomerSchema = z.object({
  type: customerTypeSchema.default('INDIVIDUAL'),
  name: z.string().trim().min(1).max(150),
  email: emailSchema.optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  whatsappPhone: z.string().max(30).optional().or(z.literal('')),
  taxIdNumber: z.string().max(60).optional(),
  currency: currencyCodeSchema.optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();

export const customerListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
});
