# Environment variables

`.env.example` is the template (empty values only). Production fails fast on missing critical values. "Secret" means: never commit, never log.

## Required

| Variable                                                                                               | Used by  | Notes                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                             | all      | `production` enables strict checks                                                                                                                                                                                   |
| `NEXT_PUBLIC_APP_URL`                                                                                  | web, api | Public origin (links, CORS, webhook URLs)                                                                                                                                                                            |
| `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`                                                              | web      | Where the web app reaches the API (also the `/api/v1` rewrite target)                                                                                                                                                |
| `CORS_ORIGINS`                                                                                         | api      | Comma-separated allowed origins                                                                                                                                                                                      |
| `DATABASE_URL`, `DIRECT_DATABASE_URL`                                                                  | all      | Pooled / unpooled (migrations). Neon: add `connect_timeout=30`                                                                                                                                                       |
| `AUTH_SECRET`, `API_TOKEN_SECRET`                                                                      | web, api | Secret. 32+ chars. Session signing; web-to-API token                                                                                                                                                                 |
| `APP_ENCRYPTION_KEY`                                                                                   | web, api | Secret. 32+ chars. Encrypts provider credentials and webhook secrets                                                                                                                                                 |
| `OTP_HMAC_KEY`                                                                                         | api      | Secret. 32+ chars. **Required in production** (dev/test derive one)                                                                                                                                                  |
| `CRON_SECRET`                                                                                          | api      | Secret. 16+ chars. Guards `/api/v1/cron/*`                                                                                                                                                                           |
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`                                                | web, api | Account email. In production the web app throws instead of sending unless `resend` is configured; `EMAIL_PROVIDER=dev` (file sink) is an explicit opt-in meant for test builds only. Links are never printed to logs |
| `STORAGE_PROVIDER=b2`, `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET_NAME`, `B2_KEY_ID`, `B2_APPLICATION_KEY` | api      | Private bucket. `local` is for development only                                                                                                                                                                      |

## Optional or situational

| Variable                                                                                                  | Notes                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `WORKER_INLINE`                                                                                           | Run the outbox worker inside the API process (non-serverless). Default false                          |
| `ALLOW_LOCAL_WEBHOOK_TARGETS`                                                                             | Dev/test only; rejected at boot in production                                                         |
| `SANDBOX_RETENTION_DAYS`, `OTP_RETENTION_DAYS`, `DELIVERY_RETENTION_DAYS`, `WEBHOOK_EVENT_RETENTION_DAYS` | Retention (defaults 7 / 1 / 90 / 30)                                                                  |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`                                  | Telegram channel; secret authenticates Telegram's callbacks (fail-closed when unset)                  |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`                                                              | Sendnaro's own activation payments, only when billing is enabled. `sk_test_` never unlocks production |
| `META_WHATSAPP_API_VERSION`                                                                               | Graph API version (default `v20.0`)                                                                   |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                                                                 | First platform admin (12+ chars, no `#`)                                                              |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                                    | Sign in with Google (inactive until both set)                                                         |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                                                                    | Monitoring. Do not send OTPs or personal data                                                         |

## Deliberately not environment variables

- **WhatsApp credentials** (access token, phone number id, app secret, verify token, templates) are per business, entered in the console,
  and stored encrypted. There is no platform-level WhatsApp sender.
- **Merchant webhook secrets** are generated per endpoint and shown once.
- **No hidden master key, sandbox bypass or debug flag** exists in production code paths.

## Legacy (manual-invoicing endpoints only)

`PAYSTACK_WEBHOOK_SECRET`, `FLUTTERWAVE_*`, `WHATSAPP_PROVIDER` and `META_WHATSAPP_*` (platform-level), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_*`.
Not needed for the product API.
