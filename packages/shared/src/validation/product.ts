import { z } from 'zod';
import { currencyCodeSchema } from './common.js';

export const productKindSchema = z.enum(['PRODUCT', 'SERVICE']);

export const createProductSchema = z.object({
  kind: productKindSchema.default('SERVICE'),
  name: z.string().trim().min(1).max(150),
  description: z.string().max(2000).optional(),
  sku: z.string().max(60).optional(),
  unit: z.string().max(30).default('unit'),
  unitPriceMinorUnits: z.number().int().min(0),
  currency: currencyCodeSchema,
  taxRateId: z.string().optional(),
  categoryId: z.string().optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();

export const createTaxRateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  ratePercent: z.number().min(0).max(100),
  isDefault: z.boolean().default(false),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
});
