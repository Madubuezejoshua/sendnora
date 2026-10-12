# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Sendnaro rebuild — 2026-10-12

The product was renamed from InvoiceTap to **Sendnaro** and refocused on an automated transactional messaging and invoice API.

### Added
- Versioned public API (`/api/v1`): invoices and receipts, WhatsApp OTP, notifications, Telegram linking, deliveries; strict validation,
  `Idempotency-Key`, per-key scopes and durable rate limits, consistent errors with `request_id`, OpenAPI verified against the router.
- Durable transactional outbox with crash recovery, retries with backoff and jitter, ambiguity handling (no blind resend), provider
  receipts, signed SSRF-safe outgoing webhooks, retention cleanup, stand-alone worker.
- First-class sandbox using the real pipeline with deterministic provider scenarios, watermarked PDFs and a browser playground.
- Per-business WhatsApp Cloud API connection (encrypted credentials, signed per-business callbacks) and a shared Telegram bot with
  one-time link tokens.
- One-time activation billing (Paystack) with owner controls, verified revenue and entitlements. **Billing ships OFF.**
- Developer console (integration checklist, API keys, deliveries, settings, activation), admin billing panel, redesigned website, docs.
- Playwright journeys (onboarding, automation, isolation, admin) and API integration suites.

### Changed
- Package scope `@invoicetap/*` is now `@sendnaro/*`; the manual-invoicing UI and marketing pages were removed. Its API moved to
  `/api/legacy/v1` and its tables are untouched. Old docs are under `docs/legacy`.
- PDFs render Latin Extended and Vietnamese-block letters (Ọ, Ẹ, ń) and no longer overlap the price and tax columns.
- Web dev email sink writes captured messages to `apps/web/.dev-emails/` and refuses to log links in production.

### Fixed
- Raw SQL compared UTC timestamps with the database's local `now()` (wrong on non-UTC servers); explicit UTC parameters are used.
- Body-parser failures returned 500; they now return 400/413.

## [Earlier, as InvoiceTap] — First run against a live database — 2026-10-08

### Fixed (all found by running the integration + E2E suites for the first time)
- **API routing:** routers mounted at the root used path-less `router.use(requireAuth, ...)`,
  which guarded every request reaching them — public document pages, cron endpoints and
  `/admin/*` were unreachable. Unauthenticated routers are now mounted first and the
  admin / cron / public / reports guards are scoped to their own prefixes
  (`routes.ts`, regression test `tests/integration/routing.test.ts`).
- **Login:** the form sent `totpCode: undefined`, which `signIn()` serialises as the string
  `"undefined"`, failing validation — every login was rejected.
- **Auth.js `UntrustedHost`** on any non-Vercel `next start` (`trustHost: true`).
- **Infinite redirect loop after login:** the workspace-cookie handoff now uses a hard
  navigation (`select-workspace-redirect.tsx`) and preserves the requested path;
  `/api/workspace/select` no longer accepts off-site `redirect` values.
- **Dashboard crash:** a function prop was passed from a Server to a Client Component
  (`dashboard/revenue-chart.tsx`).
- **Invoice / quote / expense forms:** date defaults were `Date` objects, so the date inputs
  rendered empty and submission was silently blocked.
- `next start/dev` no longer use bash-only `${WEB_PORT:-3000}` (use `PORT`).

### Deployment (Vercel-only topology, 2026-10-09)
- Both apps deploy to Vercel: `invoicetap-web` (root `apps/web`) and `invoicetap-api` (root `apps/api`,
  Express wrapped by `src/vercel.ts` + `api/index.js`). Config in each app's `vercel.json`.
- Daily Vercel crons call the three `/cron/*` routes (now GET or POST; Vercel sends `CRON_SECRET` automatically).
- Prisma gets the `rhel-openssl-3.0.x` engine; web copies it to `apps/web/generated/client` at build time.
- Neon: use `connect_timeout=30` on all URLs (compute cold starts exceed Prisma's 5s default).
- `E2E_BASE_URL=<url> npx playwright test` runs the E2E suite against a deployed site.

### Added
- Initial Prisma migration (`packages/database/prisma/migrations/*_init`).
- Accessible label on the line-item unit-price field.

### Verified
- API: 28/28 tests incl. 4 live-Postgres integration suites. Shared: 82/82.
- Playwright: 5/5 (marketing + full login → customer → invoice → issue → public link flow).
- `typecheck`, `lint`, and production builds of both apps pass.

## [0.1.0] — Initial build — 2026-09-14

### Added
- Monorepo scaffold (npm workspaces): `apps/web`, `apps/api`,
  `packages/{database,shared,ui,config}`.
- Full Prisma schema covering auth, multi-tenant workspaces/RBAC,
  customers, products, quotes, invoices, payments, receipts, credit
  notes, expenses, recurring invoices, reminders, subscriptions/billing,
  and platform-admin tables.
- `packages/shared`: money/tax/discount/rounding arithmetic (integer
  minor units + Decimal.js), document numbering, phone normalization,
  RBAC permission matrix, plan-limit definitions, Zod validation schemas,
  the web↔API trust-boundary JWT helpers — with unit tests.
- `apps/api`: Express service covering auth/tenancy middleware,
  workspaces, customers, products, quotes, invoices (full state machine +
  atomic numbering + payment recording + credit notes + void
  safeguards), Paystack/Flutterwave payment adapters with signature
  verification and idempotent webhook processing, receipts, PDF
  generation (3 templates), email (Resend + dev preview adapter, React
  templates), WhatsApp click-to-chat + Meta Cloud API adapter (inactive
  without credentials), S3-compatible file storage (Backblaze B2 + local
  dev adapter), dashboard/reports, recurring invoices + reminders +
  overdue sweep via protected cron endpoints, and a platform admin API.
- `apps/web`: Next.js 15 App Router site — full marketing site (12 pages
  incl. all legal pages), auth flows (register/verify/login/2FA field/
  forgot/reset password) with a hybrid JWT+DB-tracked session design
  split for Edge-runtime middleware compatibility, an authenticated app
  shell, full customer/product/expense CRUD, quote/invoice creation with
  a live-computing line-item editor and full detail-page actions
  (issue/send/record payment/void/PDF/WhatsApp share), settings
  (business/team/billing/profile), a minimal platform admin section, and
  public token-scoped invoice/quote/receipt pages with online payment.
- Design system (`packages/ui`) on Radix + Tailwind: buttons, forms,
  dialogs, data table, toasts, charts, and more.
- Docker/Railway deployment config for the API; CI workflow (lint,
  typecheck, unit+integration tests, build, Playwright).
- Documentation set: ARCHITECTURE, DATABASE, SECURITY, API, ENVIRONMENT,
  TESTING, DEPLOYMENT, OPERATIONS, BACKUP_AND_RESTORE, HANDOVER,
  MARKETPLACE_LISTING, DATA_ROOM_CHECKLIST.

### Verified in this build
Every workspace typechecks clean under strict TypeScript; `packages/shared`
(82 tests) and `apps/api` unit tests (12 tests) pass with zero database
dependency; both `apps/api` and `apps/web` production builds succeed and
the compiled API was smoke-tested (health/readiness/auth-middleware all
behave correctly). See TESTING.md for exact commands and what was **not**
executed (integration/E2E tests need a live Postgres not available in the
build environment).

### Known gaps at this version
See HANDOVER.md § "What's not done — the honest gap list" for the
authoritative, up-to-date list of what remains unbuilt or partial.

## [Unreleased]

### Added
- CSV import/export for customers and products, with a reusable
  `<CsvImportExport>` component and row-level import error reporting.
- Meta WhatsApp Cloud API inbound webhook route (handshake verification
  + signed delivery-status callbacks), mounted at `/api/v1`.
- Recurring platform-subscription billing via Paystack Plans/
  Subscriptions: checkout initiation endpoint, plan management UI, and
  webhook-driven renewal/failure/cancellation handling.
- Browser push notifications end to end: `PushSubscription` model,
  VAPID-based push service, a centralized notification service (in-app
  row + push, one call site), a service worker, a notification bell UI
  with subscribe/unsubscribe, wired into payment-received and
  WhatsApp-reminder-ready events.
- API key management: create/list/revoke endpoints and a
  `/settings/api-keys` page. Keys are SHA-256-hashed at rest and shown
  in plaintext only once, at creation.
- Unicode-capable PDF font (Noto Sans) registered for invoice/quote/
  receipt PDFs, improving rendering of accented/non-Latin names.
- Settings pages (team, billing, API keys) are now linked from the user
  menu — previously reachable only by typing the URL directly.
- Full OpenAPI coverage: `apps/api/openapi.yaml` now documents every
  mounted route (up from 8 core paths), cross-checked against the
  actual Express route registrations so nothing was missed.

### Removed
- `DEMO_MODE` and `NEXT_PUBLIC_DEMO_MODE` env vars, and every reference
  to them, ahead of production use. `NEXT_PUBLIC_DEMO_MODE` was already
  dead — declared in the env schema and `.env.example` but never read
  anywhere. `DEMO_MODE` gated a fallback in
  `/billing/subscription/change-plan` with
  `if (!env.DEMO_MODE && env.NODE_ENV === 'production')` — but
  production refuses to boot at all if `DEMO_MODE` is true (see
  `assertProductionInvariants()`), so by the time that line could ever
  run, `DEMO_MODE` was structurally guaranteed false and the check was
  equivalent to `if (env.NODE_ENV === 'production')`. Simplified to
  exactly that; behavior is unchanged, dead surface area is gone. The
  demo-data seed script (`seed-demo.ts`) and the admin panel's "Demo"
  workspace badge are unrelated and were kept — see HANDOVER.md.

### Fixed
- `apps/web`'s `/api/proxy/*` route was dropping the `Content-Type`
  header (including the multipart boundary) for any non-JSON request
  body, silently breaking file uploads made through the proxy. Now
  forwards the original content-type verbatim when present.
- Customers/products CSV export and import routes were registered after
  the `/:id`-style routes, so Express would never reach them (`export`/
  `import` matched as an id first). Reordered.
- `web-push` and `@types/web-push` were declared in `apps/api/package.json`
  but missing from `node_modules` after a full reinstall — installed
  explicitly.

### Known gaps
- Recurring subscription billing has not been exercised against a real
  Paystack test-mode webhook delivery — code-reviewed, not live-tested.
- API keys are management-only; no route yet authenticates a request
  using one (see HANDOVER.md).
- Currency amounts in PDFs still render as ISO codes, not symbols —
  deliberate, see `apps/api/src/services/pdf/document.tsx`.
