import { z } from 'zod';
import { isSupportedCurrency } from '../constants/currencies.js';

export const currencyCodeSchema = z
  .string()
  .length(3)
  .refine((v) => isSupportedCurrency(v), { message: 'Unsupported currency code' })
  .transform((v) => v.toUpperCase());

export const moneyMinorUnitsSchema = z.number().int().min(0);

export const discountSchema = z
  .object({
    type: z.enum(['PERCENTAGE', 'FIXED']),
    value: z.number().min(0),
  })
  .refine((d) => (d.type === 'PERCENTAGE' ? d.value <= 100 : true), {
    message: 'Percentage discount cannot exceed 100',
  })
  .nullish();

export const addressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2, 'Use a 2-letter ISO country code'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const cuidSchema = z.string().min(20).max(40);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Strong password: min 12 chars, at least one letter and one number. Hashed with Argon2id server-side. */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');
