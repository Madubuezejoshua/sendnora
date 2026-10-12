/**
 * Centralized environment variable validation.
 *
 * Every process (API, web, cron scripts) must call the relevant `parse*Env`
 * function at startup. Production boots MUST fail fast and loudly when a
 * required variable is missing — never fall back to a silent default for
 * anything security- or money-related.
 */
import { z } from 'zod';

/** Variables required by the Express API (apps/api). */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // Public-facing URLs, used for CORS, links in emails/PDFs, and redirects.
  NEXT_PUBLIC_APP_URL: z.string().url(),
  API_INTERNAL_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().min(1), // comma-separated list

  // Database
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  // Auth / trust boundary between Next.js (Auth.js) and Express.
  // Both processes must share AUTH_SECRET and API_TOKEN_SECRET — see ARCHITECTURE.md.
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  API_TOKEN_SECRET: z.string().min(32, 'API_TOKEN_SECRET must be at least 32 characters'),

  // Encrypts workspace-stored provider credentials (Paystack/Flutterwave secret keys) at rest.
  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be at least 32 characters'),

  // Cron endpoints (recurring invoices, reminders, overdue sweep) require this bearer secret.
  CRON_SECRET: z.string().min(16),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),

  // Email
  EMAIL_PROVIDER: z.enum(['resend', 'dev']).default('dev'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),

  // Google OAuth (prepared, inactive until both are set)
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(['b2', 'local']).default('local'),
  B2_ENDPOINT: z.string().optional(),
  B2_REGION: z.string().optional(),
  B2_BUCKET_NAME: z.string().optional(),
  B2_KEY_ID: z.string().optional(),
  B2_APPLICATION_KEY: z.string().optional(),

  // Paystack
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

  // Flutterwave
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_SECRET_HASH: z.string().optional(),

  // Meta WhatsApp Cloud API
  WHATSAPP_PROVIDER: z.enum(['click-to-chat', 'meta-cloud-api']).default('click-to-chat'),
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_WHATSAPP_APP_SECRET: z.string().optional(),
  META_WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_API_VERSION: z.string().default('v20.0'),

  // Telegram bot (optional; inactive without a token)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Sendnaro pipeline
  // Keys the OTP codes (HMAC). Required in production; dev/test derive one from APP_ENCRYPTION_KEY.
  OTP_HMAC_KEY: z.string().min(32).optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  // Run the outbox worker loop inside the API process (Docker/Railway/local). Serverless uses the cron drain endpoint.
  WORKER_INLINE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Dev/test only: lets SANDBOX webhook endpoints target localhost so a local receiver can be used.
  ALLOW_LOCAL_WEBHOOK_TARGETS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Optional monitoring
  SENTRY_DSN: z.string().optional(),

  // Optional web push
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

let cachedApiEnv: ApiEnv | undefined;

export function parseApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  if (cachedApiEnv) return cachedApiEnv;
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:\n' + result.error.toString());
    throw new Error('Invalid environment configuration. See stderr for details.');
  }

  const env = result.data;

  if (env.NODE_ENV === 'production') {
    assertProductionInvariants(env);
  }

  cachedApiEnv = env;
  return env;
}

/**
 * Production must fail fast rather than silently degrading. Missing
 * provider credentials are fine in dev, but production must not boot with
 * a storage/email/WhatsApp provider selected that has no credentials
 * configured for it.
 */
function assertProductionInvariants(env: ApiEnv): void {
  const problems: string[] = [];
  if (!env.OTP_HMAC_KEY) problems.push('OTP_HMAC_KEY is required in production.');
  if (env.STORAGE_PROVIDER === 'local')
    problems.push(
      'STORAGE_PROVIDER=local is for development only; production needs private B2 storage so customer documents are never on a local disk.',
    );
  if (env.ALLOW_LOCAL_WEBHOOK_TARGETS)
    problems.push('ALLOW_LOCAL_WEBHOOK_TARGETS must not be enabled in production.');

  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    problems.push('EMAIL_PROVIDER=resend requires RESEND_API_KEY.');
  }
  if (env.STORAGE_PROVIDER === 'b2') {
    const required = [env.B2_ENDPOINT, env.B2_BUCKET_NAME, env.B2_KEY_ID, env.B2_APPLICATION_KEY];
    if (required.some((v) => !v)) {
      problems.push(
        'STORAGE_PROVIDER=b2 requires B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID and B2_APPLICATION_KEY.',
      );
    }
  }
  if (env.WHATSAPP_PROVIDER === 'meta-cloud-api') {
    const required = [
      env.META_WHATSAPP_ACCESS_TOKEN,
      env.META_WHATSAPP_PHONE_NUMBER_ID,
      env.META_WHATSAPP_APP_SECRET,
      env.META_WHATSAPP_VERIFY_TOKEN,
    ];
    if (required.some((v) => !v)) {
      problems.push('WHATSAPP_PROVIDER=meta-cloud-api requires all META_WHATSAPP_* variables.');
    }
  }

  if (problems.length > 0) {
    throw new Error(
      'Production environment misconfiguration:\n' + problems.map((p) => `  - ${p}`).join('\n'),
    );
  }
}

/** Variables required by the Next.js web app server runtime (apps/web). */
export const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  API_INTERNAL_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32),
  API_TOKEN_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

let cachedWebEnv: WebEnv | undefined;

export function parseWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  if (cachedWebEnv) return cachedWebEnv;
  const result = webEnvSchema.safeParse(source);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid web environment configuration:\n' + result.error.toString());
    throw new Error('Invalid web environment configuration. See stderr for details.');
  }
  cachedWebEnv = result.data;
  return cachedWebEnv;
}
