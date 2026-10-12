import { z } from 'zod';

/**
 * Request schemas for the public v1 API. All are `.strict()`: unknown fields are rejected, so a caller
 * can never smuggle in a client-computed total, a business_id or any other server-owned value.
 */
const shortText = (max: number) => z.string().trim().min(1).max(max);
const reference = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\x21-\x7e ]+$/, 'must be printable ASCII');

export const CHANNELS = ['whatsapp', 'telegram'] as const;
export const channelsSchema = z.array(z.enum(CHANNELS)).min(1).max(2);

export const OTP_PURPOSES = [
  'login',
  'phone_verification',
  'transaction_confirmation',
  'account_recovery',
] as const;

const quantitySchema = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine(
    (v) => /^\d{1,7}(\.\d{1,3})?$/.test(v),
    'must be a positive decimal with at most 3 decimal places',
  )
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 1_000_000,
    'must be greater than 0 and at most 1,000,000',
  );

export const invoiceItemSchema = z
  .object({
    description: shortText(200),
    quantity: quantitySchema,
    // Integer minor units only. Floats and negatives are rejected by the schema itself.
    unit_amount_minor: z.number().int().min(0).max(100_000_000_000),
    tax_rate_percent: z.number().min(0).max(100).optional(),
  })
  .strict();

export const customerSchema = z
  .object({
    external_customer_id: reference,
    name: shortText(120),
    whatsapp_phone: z.string().trim().min(5).max(32).optional(),
    email: z.string().trim().email().max(200).optional(),
  })
  .strict();

export const createInvoiceSchema = z
  .object({
    external_order_id: reference,
    document_type: z.enum(['invoice', 'receipt']),
    payment: z
      .object({ status: z.enum(['paid', 'unpaid']), reference: shortText(120).optional() })
      .strict(),
    customer: customerSchema,
    currency: z.string().trim().length(3).toUpperCase(),
    tax_mode: z.enum(['exclusive', 'inclusive']).default('exclusive'),
    items: z.array(invoiceItemSchema).min(1).max(100),
    discount_minor: z.number().int().min(0).max(100_000_000_000).optional(),
    due_date: z.string().date().optional(),
    notes: z.string().trim().max(500).optional(),
    channels: channelsSchema,
    consent: z.object({ whatsapp_transactional: z.boolean().optional() }).strict().optional(),
    /** Sandbox only. Rejected with sandbox_only on a live key. */
    scenario: z.string().max(40).optional(),
  })
  .strict();
export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>;

export const createOtpSchema = z
  .object({
    phone: z.string().trim().min(5).max(32),
    purpose: z.enum(OTP_PURPOSES),
    customer_ref: reference.optional(),
    scenario: z.string().max(40).optional(),
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, 'must be 4 to 8 digits'),
    phone: z.string().trim().min(5).max(32),
    purpose: z.enum(OTP_PURPOSES),
  })
  .strict();

export const NOTIFICATION_TYPES = [
  'order_confirmation',
  'payment_confirmation',
  'shipping_update',
  'general_update',
] as const;

export const createNotificationSchema = z
  .object({
    type: z.enum(NOTIFICATION_TYPES),
    customer: customerSchema,
    channels: channelsSchema,
    fields: z
      .object({
        order_reference: reference.optional(),
        amount_minor: z.number().int().min(0).max(100_000_000_000).optional(),
        currency: z.string().trim().length(3).toUpperCase().optional(),
        message: z.string().trim().min(1).max(300).optional(),
      })
      .strict()
      .default({}),
    link: z
      .object({ url: z.string().url().max(500) })
      .strict()
      .optional(),
    consent: z.object({ whatsapp_transactional: z.boolean().optional() }).strict().optional(),
    scenario: z.string().max(40).optional(),
  })
  .strict();

export const createLinkTokenSchema = z
  .object({
    external_customer_id: reference,
    name: shortText(120).optional(),
    /** Replace an existing Telegram connection (merchant-authenticated; the old chat is told). */
    force_relink: z.boolean().optional(),
  })
  .strict();
