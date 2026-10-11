# Handover

The authoritative statement of what this codebase actually contains as of
this build — written last, deliberately, so it reflects what was verified
rather than what was intended. Where this document and any other
documentation file disagree, trust this one.

## What's built and verified

**Foundation**

- npm-workspaces monorepo: `apps/web`, `apps/api`, `packages/{database,shared,ui,config}`.
- Full Prisma schema (~50 models) covering auth, multi-tenant
  workspaces/RBAC, customers, products, quotes, invoices, payments,
  receipts, credit notes, expenses, recurring invoices, reminders,
  subscriptions/billing, and platform-admin tables. See DATABASE.md.
- `packages/shared`: money/tax/discount/rounding math (integer minor
  units + Decimal.js), atomic document numbering format logic, phone
  normalization, RBAC permission matrix, plan-limit definitions, Zod
  validation schemas used by both apps, and the web↔API trust-boundary
  JWT helpers (`server/api-token.ts`).

**apps/api (Express)** — the full business domain:

- Auth/tenancy middleware chain (bearer-token verification, workspace
  membership re-derivation, RBAC permission checks).
- Workspaces (create/list/settings/business-profile/members/invitations/
  ownership-transfer), customers, products/categories/tax-rates.
- Quotes and invoices with real state machines, atomic per-workspace
  numbering (transactional), computed totals shared with the PDF
  renderer, payment recording, credit notes, and void safeguards.
- Paystack and Flutterwave adapters: transaction init, server-side
  verification (never trusts the webhook payload alone), HMAC/hash
  signature verification, idempotent webhook processing keyed by
  `(provider, externalEventId)`.
- Receipts with QR-verification data, PDF generation (3 templates:
  Modern/Classic/Minimal, via @react-pdf/renderer).
- Email: Resend adapter + a zero-config dev adapter (writes `.html`
  files), React-rendered templates for 13 transactional flows.
- WhatsApp: click-to-chat (zero-config, always on) + a prepared Meta
  Cloud API adapter (inactive without credentials).
- File storage: Backblaze B2 (S3-compatible) adapter + a local dev
  adapter, with byte-signature upload validation.
- Recurring invoices, reminders, and an overdue sweep — all driven by
  three protected `/cron/*` endpoints (not an in-process scheduler).
- Dashboard and reports (per-currency, deliberately never summed across
  currencies), expenses, a platform admin API, and a public
  token-scoped document API (quote/invoice/receipt view + PDF + pay).
- CSV import/export for customers and products (`services/csv.service.ts`),
  row-by-row validation so one bad row never fails the whole batch.
- Meta WhatsApp Cloud API inbound webhook (`modules/whatsapp/whatsapp-webhook.routes.ts`),
  mounted alongside the payment webhooks: handshake verification (GET) and
  signed delivery-status callbacks (POST) that update `MessageDelivery` rows.
- Recurring platform-subscription billing via Paystack Plans/Subscriptions
  (`services/payments/{paystack-subscription,subscription-billing}.provider.ts`) —
  checkout initiation, webhook-driven renewal/failure/cancellation handling,
  always billed on the platform's own Paystack credentials, never a
  workspace's. **Not yet exercised against a live Paystack test-mode
  webhook delivery** — see the caveat comment in `subscription-billing.service.ts`.
- Browser push notifications: `PushSubscription` model, VAPID-based
  `services/push.service.ts` + `services/notification.service.ts` (single
  entry point that always writes the in-app `Notification` row and
  additionally pushes when a subscription + VAPID config exist), a
  service worker (`apps/web/public/sw.js`), a notification bell
  (`components/app/notification-bell.tsx`) with an in-app list, unread
  count, and an "enable browser notifications" action, wired into
  `recordPayment` (payment received) and reminder dispatch (WhatsApp
  reminder ready).
- API key management: create/list/revoke endpoints
  (`modules/api-keys/api-keys.routes.ts`, `services/api-key.service.ts`)
  and a settings page (`/settings/api-keys`) showing the plaintext key
  exactly once at creation. SHA-256-hashed at rest. **Management only** —
  no route currently authenticates a request using an `ApiKey` row; see
  the gap list.
- Unicode-capable PDF font (Noto Sans, registered via `Font.register()`
  in `services/pdf/document.tsx`) for correctly rendering accented/
  non-Latin customer and business names. Currency amounts deliberately
  still render as ISO codes (`NGN 1,000.00`) rather than symbols — see
  the comment in that file for why (unverified glyph coverage for ₦/₵/₹
  in the vendored font subset).
- Full OpenAPI coverage (`apps/api/openapi.yaml`) — every mounted route
  (109 path templates), cross-checked mechanically against the actual
  route registrations so none were missed. Previously covered 8 core
  paths only.
- No `DEMO_MODE`/demo-mode env vars left in the live product — the
  dead, unused `NEXT_PUBLIC_DEMO_MODE` was removed outright, and
  `DEMO_MODE` (a dev-only convenience for the manual plan-change
  endpoint) was also removed after finding it was already unreachable
  dead code even in dev (its guard clause was structurally impossible
  to hit — see CHANGELOG.md). The `seed-demo.ts` sample-data script is
  unrelated and intentionally kept — it refuses to run in production
  and isn't reachable from the live site.

**apps/web (Next.js 15, App Router)**:

- Marketing site: homepage, features, pricing, templates, security, FAQ,
  about, contact (working form → API), and all 5 legal pages (privacy,
  terms, refund, cookie, acceptable-use — template content, flagged as
  needing real legal review).
- Auth: register (+ email verification), login (password + optional
  TOTP field), forgot/reset password, all via direct Prisma access in
  apps/web per the trust-boundary design (see ARCHITECTURE.md). Session
  strategy is a hybrid: JWT transport + a DB-tracked `Session` row for
  real "log out other sessions" semantics, split into an edge-safe
  config (`auth.config.ts`, used by middleware) and the full DB-backed
  config (`auth.ts`, used everywhere else) — necessary because Next.js
  Middleware runs on the Edge runtime, which cannot load Prisma or the
  native argon2 binary.
- Authenticated app shell: responsive sidebar/topbar, workspace
  switcher, dashboard with live stats + a revenue chart.
- Full CRUD flows: customers (list/create/detail with invoice history),
  products, expenses. Quotes and invoices: list, create (with a live
  line-item editor computing totals via the same `computeDocumentTotals`
  the API uses), and detail pages with issue/send/record-payment/void/
  PDF-download/WhatsApp-share actions.
- Recurring invoices (list + pause/resume) and reports (revenue by
  customer, profit estimate, overdue ageing) — functional but leaner
  than the invoice/customer flows.
- Settings: business profile, team (invite + list members), billing
  (plan display), profile (change password, log out everywhere).
- Public, unauthenticated pages: invoice view + pay button (Paystack/
  Flutterwave), quote view + accept/decline, receipt view with
  verification badge — each with a PDF download link.
- Minimal platform admin section (`/admin`): stats, users, workspaces,
  webhook events, support tickets — read-focused.
- SEO: sitemap.xml, robots.txt, manifest.webmanifest, Open Graph/Twitter
  metadata, canonical URLs on every marketing page. 404/500 pages.
- Design system (`packages/ui`): buttons, inputs, selects, checkboxes,
  switches, dialogs/drawers, dropdown menus, tooltips, tabs, skeletons,
  empty/error states, a toast system, a generic data table
  (search/sort/pagination), file upload, a command-palette component,
  currency/date inputs, and accessible Recharts wrappers — light/dark
  theme via CSS variables + `next-themes`.

**Verified working** (see TEST_RESULTS in the final build report for
exact commands/counts): every workspace typechecks clean under strict
TypeScript; `packages/shared` and `apps/api`'s unit test suites pass (94
tests total, zero DB dependency); the compiled `apps/api` production
bundle boots and correctly serves `/health` (200), `/ready` (503 when DB
unreachable — correct), and a protected route (401 — correct); the
compiled `apps/web` production build succeeds and statically/dynamically
renders all 46 routes.

## What's not done — the honest gap list

- **Prisma migrations:** the initial migration now exists and was applied to a real
  Postgres. Commit `packages/database/prisma/migrations/` and run
  `db:migrate:deploy` against the production database.
- **Integration + E2E tests have now been executed** against a live Postgres (28/28 API,
  5/5 Playwright). Doing so surfaced and fixed the bugs listed in CHANGELOG.md
  ("Unreleased"). Re-run them in CI before each release.
- **Playwright E2E coverage is partial.** Two spec files exist (marketing
  smoke tests, one full customer→invoice→issue→public-link flow) rather
  than the full 18-scenario flow originally scoped (team invitations,
  cross-workspace access denial as a browser-level test, admin-panel
  isolation as a browser-level test — the underlying guarantees for the
  latter two ARE covered by API integration tests, just not duplicated
  at the browser level).
- **Recurring platform-subscription billing is built but unverified
  live.** The Paystack Plan/Subscription checkout + webhook handling
  described above has not been exercised against a real Paystack
  test-mode event — do that before depending on it in production (see
  `subscription-billing.service.ts`).
- **Flutterwave recurring subscription billing is not implemented** —
  only Paystack's Plan/Subscription API is wired for platform billing.
  Flutterwave remains fully supported for one-off customer invoice
  payments (the core product), which is a separate code path.
- **API keys are issuable and revocable but not yet a working auth
  mechanism.** No middleware authenticates incoming requests against an
  `ApiKey` row — enabling that (plus per-key scope enforcement, rate
  limiting, and public API docs) is a separate, larger feature than the
  management UI that exists today. See `services/api-key.service.ts`.
- **No Unicode currency symbols in generated PDFs** — amounts still
  render as `NGN 1,000.00` (ISO code) rather than a symbol glyph, even
  though a Unicode-capable font is now registered (used for accented
  Latin text in names/addresses). See the comment in
  `apps/api/src/services/pdf/document.tsx` for why this wasn't changed.
- **No real brand assets** — logo/favicon are simple placeholder SVGs
  (`apps/web/public/brand/*`), and there is no PNG notification icon
  for the service worker (omitted rather than 404ing); see the rebrand
  checklist below.
- **Legal page content is template boilerplate**, explicitly flagged on
  each page and in DATA_ROOM_CHECKLIST.md, not reviewed by counsel.
- **A known, environment-specific build quirk on some Windows
  machines**: `npm run build --workspace=@invoicetap/web` can hit an
  `EPERM` scanning a legacy Windows user-profile junction
  (`Application Data`/`Cookies`) — unrelated to this codebase, doesn't
  occur on Linux (i.e. not on Vercel/Railway/CI). See README.md's
  Troubleshooting section for the workaround.

## Rebrand checklist ("InvoiceTap" is a working name)

1. Edit `packages/shared/src/branding.ts` — product name, tagline,
   description, domain, support/sales emails, social handles, brand
   colors, logo paths. Every other file reads from this module; nothing
   else hardcodes the name.
2. Replace `apps/web/public/brand/{logo-light,logo-dark,icon}.svg` and
   `apps/web/public/favicon.ico` (currently placeholders) with real
   artwork, keeping the same filenames (or update the paths in
   `branding.ts` to match new ones).
3. Update `apps/web/public/og-image.png` (referenced in
   `app/layout.tsx`'s metadata but not currently present — add one).
4. Search for the literal string `"InvoiceTap"` outside `branding.ts` —
   it should only appear in documentation files (this repo's own docs),
   never in application code.
5. Update `LICENSE`'s legal entity name, and the demo seed workspace
   name in `packages/database/prisma/seed-demo.ts` if you keep using
   demo data.
6. Register the real domain and update `NEXT_PUBLIC_APP_URL` /
   `NEXT_PUBLIC_API_URL` / `CORS_ORIGINS` in every environment.

## Immediate next steps for whoever picks this up

1. Run the integration/E2E suites for real (see TESTING.md) — they were
   written carefully but need a database to prove themselves. This also
   covers the newer code (CSV import/export, subscription webhooks,
   push subscribe/unsubscribe, API key CRUD), which so far has only been
   typechecked/unit-tested, not run against Postgres.
2. Provision Neon + Railway + Vercel + Resend + a Paystack/Flutterwave
   test account, walk DEPLOYMENT.md, and get a real staging deployment
   live — nothing in this repository has been deployed anywhere.
3. Send a real Paystack test-mode subscription event at the webhook
   endpoint and confirm `subscription-billing.service.ts` behaves as
   written — this is the one piece of newly-built logic that genuinely
   cannot be verified without a live provider round-trip.
4. Real brand assets (PNG app icons + og-image, not just the placeholder
   SVGs) and legal review are probably the highest-value remaining gaps
   for a product at this stage — both need a human, not more code.
