# Testing

## Philosophy

Tests are written alongside the code they cover, not bolted on afterward.
Money math, state machines, and tenant isolation get the deepest coverage
because they're where a bug has real financial or security consequences.

## Running tests

```bash
# Unit tests (packages/shared — no database needed)
npm run test --workspace=@sendnaro/shared

# Unit + integration tests (apps/api — needs a running Postgres)
docker compose up -d
npm run db:generate --workspace=@sendnaro/database
npm run db:migrate:deploy --workspace=@sendnaro/database
npm run test --workspace=@sendnaro/api

# Everything, every workspace
npm run test

# Playwright end-to-end (apps/web — needs the full stack running)
npm run test:e2e --workspace=@sendnaro/web
```

## What's covered

**`packages/shared` (82 unit tests, all passing as of this build — see
TEST_RESULTS in the final report / re-run `npm run test --workspace=@sendnaro/shared`
to confirm on your machine):**

- `money/money.test.ts` — integer minor-unit arithmetic, round-half-up
  rounding, cross-currency guards, floating-point-bug regression case
  (10 × $0.10 must equal exactly $1.00).
- `money/discount.test.ts`, `money/tax.test.ts` — percentage/fixed
  discounts, clamping, inclusive vs exclusive tax extraction.
- `money/totals.test.ts` — full document totals: multi-line, mixed tax
  rates, document-level discount proportionally distributed across lines,
  fractional quantities, shipping/fees excluded from the taxable base.
- `constants/document-status.test.ts` — every legal/illegal quote and
  invoice state transition, including the PAID→VOID credit-note
  safeguard path.
- `constants/roles.test.ts`, `constants/plans.test.ts` — RBAC permission
  matrix and plan-quota boundary conditions (exactly-at-limit,
  one-under, fair-use ceiling on "unlimited" plans).
- `utils/numbering.test.ts`, `utils/phone.test.ts`, `utils/scheduling.test.ts`
  — document number formatting, E.164 phone normalization + wa.me URL
  building, recurring-schedule date math including a DST-crossing case.
- `server/api-token.test.ts` — the web↔API trust-boundary JWT: round-trip,
  wrong-secret rejection, expiry, tamper detection.

**`apps/api` unit tests (no database required):**

- `line-items.service.test.ts` — the bridge between validated request
  shapes and Prisma create rows stays consistent with the totals
  calculator.
- `paystack.provider.test.ts`, `flutterwave.provider.test.ts` — webhook
  signature verification (HMAC correctness, tamper rejection, wrong-secret
  rejection) using synthetic payloads, no network calls.

**`apps/api` integration tests (require a live Postgres — see above):**

- `tenant-isolation.test.ts` — a member of workspace A cannot read,
  list, or update workspace B's customers, and a token with no active
  workspace claim is rejected outright.
- `auth.test.ts` — missing/malformed/expired bearer tokens rejected;
  platform-admin routes rejected for non-admins, accepted for admins.
- `invoice-lifecycle.test.ts` — draft → issue → pay → PAID with a
  receipt generated; editing an issued invoice is rejected; overpayment
  is rejected; the FREE plan's 5-invoice/month quota is enforced exactly
  at the boundary.
- `webhook-idempotency.test.ts` — a duplicated payment-gateway webhook
  delivery is processed exactly once (one Payment row, one WebhookEvent
  row, invoice transitions to PAID only once), with the provider's
  verify-transaction call mocked so the test needs no real gateway
  credentials or network access.

## Build verification (executed, not just written)

Beyond the test suites above, this was directly verified in the
environment that produced this repository:

- `npm run typecheck` passes with zero errors across all six workspaces
  under TypeScript strict mode.
- `npm run build --workspace=@sendnaro/api` produces a working
  production bundle; running it with synthetic env vars and no database
  correctly serves `GET /health` → 200, `GET /ready` → 503 (accurately
  detects the unreachable database), and a protected route without a
  token → 401 with the expected error shape.
- `npm run build --workspace=@sendnaro/web` succeeds and statically/
  dynamically generates all 46 routes.

## What's NOT yet covered (honest gap list)

- Full Playwright E2E coverage of all 18 scenarios in the original spec
  (registration → invite → cross-workspace access denial → admin
  isolation). Two spec files exist — `e2e/marketing.spec.ts` (4 scenarios)
  and `e2e/invoice-flow.spec.ts` (the core customer→invoice→issue→
  public-link loop) — see HANDOVER.md for exactly what's automated today
  versus covered only at the API-integration-test level.
- CSV import/export round-trip tests (the feature itself is now built —
  `services/csv.service.ts`, `/customers|products/{export,import}` — but
  no automated test exercises it yet).
- Push notification subscribe/unsubscribe and delivery, API key CRUD,
  and the WhatsApp inbound webhook — all newly built, typechecked, but
  not covered by integration tests yet.
- The recurring subscription billing webhook path
  (`subscription-billing.service.ts`) has never received a real
  Paystack test-mode event — this is the one piece of new logic that
  genuinely cannot be verified without a live provider round-trip, not
  just a missing test file.
- Load/performance testing.
- The `apps/api` integration suite above was **written** and is believed
  correct, but was **not executed against a live database in the build
  environment** that produced this repository (no local Postgres/Docker
  daemon was available there) — run it yourself with the commands above
  before relying on it. The unit test suites (`packages/shared`,
  `apps/api` unit tests) **were** executed and are passing; see the final
  build report for actual counts.

## Rules this project follows

- Never disable a test to get a green build — fix the root cause.
- Never claim a test passed without having actually run it (see the gap
  list above for exactly where that line is, for this build).
- Prefer real assertions over snapshot-only tests.
- Integration tests use a disposable database (docker-compose), never a
  shared or production database, and never a paid external service.
