# Security

## Reporting a vulnerability

Email **security@sendnaro.com** (update this address after rebranding —
see HANDOVER.md) with a description, reproduction steps, and impact
assessment. Please do not open a public GitHub issue for security reports.
We aim to acknowledge reports within 2 business days.

This project has no bug bounty program at this time.

## Controls implemented

**Authentication & sessions**

- Passwords hashed with Argon2id (`@node-rs/argon2`, OWASP-recommended
  parameters — see `packages/database/src/password.ts`).
- Database-backed sessions (Auth.js + Prisma adapter) so "log out other
  sessions" actually revokes access, not just the local cookie.
- Login attempts recorded in `LoginEvent` (success/failure, IP, user
  agent) for login-history display and future anomaly detection.
- Password reset tokens are single-use, expiring, and stored **hashed**
  (`PasswordResetToken.tokenHash`) — a database leak doesn't yield usable
  tokens.
- Optional TOTP two-factor authentication with encrypted-at-rest secrets
  and single-use recovery codes (hashed, like reset tokens).
- Rate limiting on all API traffic (`express-rate-limit`), with a tighter
  limit on the public contact form.

**Trust boundary (apps/web ↔ apps/api)**

- apps/web never forwards its session cookie to apps/api. It mints a
  short-lived (5 min), signed JWT per server-side request instead. Full
  design: ARCHITECTURE.md § "The trust boundary".
- apps/api re-derives workspace membership from the database on every
  request rather than trusting a token claim indefinitely.

**Multi-tenancy**

- Every tenant-owned table carries `workspaceId`. Every query in
  `apps/api` filters by `req.workspace.workspaceId`, sourced only from the
  verified token + a fresh `WorkspaceMember` lookup — never from a route
  param, query string, or request body. See
  `apps/api/tests/integration/tenant-isolation.test.ts` for automated
  proof.

**Authorization (RBAC)**

- Enforced server-side only, via a permission matrix
  (`packages/shared/src/constants/roles.ts`) checked by middleware on
  every mutating route. Hiding a button in the UI is never treated as a
  security control.

**Input validation & injection**

- All request bodies/queries validated with Zod schemas
  (`packages/shared/src/validation`) before touching the database.
- All database access goes through Prisma's parameterized query builder;
  no string-concatenated SQL exists in the codebase.
- File uploads are validated by actual byte signature (`file-type`), not
  the client-supplied MIME type or filename; size-capped; stored under a
  randomly generated key (never the original filename) to prevent path
  traversal and filename-based guessing.

**Webhooks**

- Paystack: HMAC-SHA512 signature verified over the _raw_ request body
  before it is parsed as JSON.
- Flutterwave: `verif-hash` header compared (constant-time) against the
  configured secret.
- Every processed event is recorded in `WebhookEvent` keyed by
  `(provider, externalEventId)`, giving idempotent, replay-safe
  processing — a duplicate delivery is a no-op. See
  `apps/api/tests/integration/webhook-idempotency.test.ts`.
- The webhook payload's amount/currency/status is **never trusted
  directly** — `payments.service.ts` re-verifies the transaction against
  the provider's own API before marking anything paid.

**Secrets**

- Workspace-level payment provider credentials are encrypted at rest with
  AES-256-GCM (`packages/database/src/encryption.ts`), keyed by
  `APP_ENCRYPTION_KEY`, and never returned to the frontend after saving.
- Structured logging (Pino) redacts passwords, tokens, API keys,
  authorization headers, and card data at the logger level
  (`apps/api/src/config/logger.ts`) — redaction is unconditional, not a
  production-only behavior.
- `.env` files are gitignored everywhere; only `.env.example` templates
  (blank values) are committed.
- Production boot fails fast if a selected provider (storage/email/
  WhatsApp) is missing its credentials — see `packages/config/src/env.ts`.

**HTTP hardening**

- `helmet` for standard security headers (clickjacking, MIME sniffing,
  referrer policy).
- CORS allowlist driven by `CORS_ORIGINS`, not a wildcard.
- Response payload size limits (`express.json({ limit: '2mb' })`).

**Cron endpoints**

- Protected by a constant-time comparison against `CRON_SECRET` — not a
  user session. See `apps/api/src/middleware/cron-auth.ts`.

## Operational responsibilities (the platform owner)

These are outside what code alone can guarantee and remain the operator's
responsibility:

- Rotate `AUTH_SECRET`, `API_TOKEN_SECRET`, and `APP_ENCRYPTION_KEY` if
  ever suspected compromised (note: rotating `APP_ENCRYPTION_KEY` requires
  re-encrypting every stored `PaymentProviderConfig.encryptedSecretKey` —
  there is no automatic re-encryption job).
- Keep dependencies patched (`npm audit`, Dependabot/Renovate recommended
  — not yet configured in this repo).
- Configure Neon/Postgres backups and test restores (see
  BACKUP_AND_RESTORE.md).
- Review `AuditLog` and `WebhookEvent` (admin panel) periodically for
  anomalies.
- Restrict who holds `PLATFORM_ADMIN` — it has unrestricted cross-tenant
  read/write access by design (that's what an admin panel needs).
- Set real, unique values for every secret in `ENVIRONMENT.md` before
  deploying to production; never reuse the values from `.env.example`.

## Known limitations (honest disclosure)

- CSRF: apps/api is a pure JSON API authenticated via a bearer token
  (never a cookie), which is inherently not CSRF-exploitable the way a
  cookie-authenticated endpoint is. apps/web's own session cookie uses
  Auth.js's built-in CSRF protection for its auth routes. There is no
  additional custom CSRF token layer beyond that.
- SSRF: the only user-influenced outbound URL is the payment gateway
  `redirectUrl`, which is always constructed server-side from
  `NEXT_PUBLIC_APP_URL` — never taken directly from client input.
- No automated dependency-vulnerability scanning is wired into CI yet
  beyond `npm audit` in the pipeline (see `.github/workflows/ci.yml`); a
  dedicated tool (Snyk, Dependabot alerts) is recommended before scaling.
- PDF rendering uses a standard (non-embedded) font, so currency amounts
  render as `NGN 1,000.00` rather than a currency symbol glyph the font
  may lack — see the note in `apps/api/src/services/pdf/document.tsx`.
