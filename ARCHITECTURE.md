# Architecture

```
 merchant backend ──(Bearer sn_*_ key)──▶ /api/v1  ──┐
 browser (console) ─(session)─▶ web app ─(signed token)─▶ /api/console │         apps/api (Express)
 Meta / Telegram / Paystack ──(signed webhooks)────▶ /api/v1/webhooks/*┘              │
                                                                                      ▼
                                      PostgreSQL (Prisma)  ◀── outbox worker ──▶ WhatsApp Cloud API / Telegram Bot API
                                      private file storage (Backblaze B2)         merchant webhook endpoints (signed)
```

## Applications and surfaces

- **apps/web** (Next.js): website, console (`/console`), admin (`/admin`), auth (Auth.js with a database-tracked session).
  It rewrites `/api/v1/*` to the API so merchants, Meta, Telegram and the payment gateway use one origin. Console calls go through
  `/api/proxy/*`, which mints a short-lived signed token server-side; the browser never holds `API_TOKEN_SECRET`. The sandbox playground
  uses `/api/sandbox/*`, which accepts `sn_test_` keys only.
- **apps/api** (Express), three mounts:
  - `/api/v1` public product API (API-key auth), public pages, cron, provider webhooks.
  - `/api/console` session-token endpoints for the console and admin.
  - `/api/legacy/v1` the previous manual-invoicing endpoints, kept for existing data and clients.
- Mounting rule: any router that calls `router.use(requireAuth, ...)` without a path guards every request that reaches it.
  Unauthenticated routers are mounted first, guards are path-scoped, and the v1 router (which owns the 404/error handlers) is last.

## Tenancy and environments

A business is a `Workspace`. Every product table carries `(workspaceId, environment)` with `environment ∈ {SANDBOX, LIVE}`.
The tenant and environment come **only** from the API key record (or the verified session token); a body, query or header can
never override them, and ids alone authorize nothing: every read filters by tenant and environment, so another business's
resource is simply "not found". Admin rights come from the verified token, never from a profile field.

## Request path (an invoice)

1. `requireApiKey(scope)`: parse, hash lookup, revoked/expired/suspended checks, scope, per-key durable rate limit.
2. `assertCanSend` (the shared entitlement gate), sandbox-only control check, live channel readiness (`setup_required`).
3. Idempotency claim, then one database transaction: totals, atomic document number, immutable snapshot, per-channel deliveries,
   outbox job. The idempotency result commits in the same transaction. Response `202`.
4. Worker: `invoice.render` builds the PDF from the snapshot, stores it privately, releases the deliveries and emits `invoice.generated`.
5. `delivery.send`: re-check suspension/entitlement/key revocation, build the request (OTP codes computed just in time), call the
   provider adapter, record the attempt, move the delivery along a forward-only state machine, emit webhooks.

## Durability

- **Transactional outbox** (`OutboxEvent`): jobs are written with the state change; workers claim with `FOR UPDATE SKIP LOCKED` and
  re-claim rows whose lock expired, so processing is at-least-once and handlers are idempotent. Nothing depends on an unawaited promise.
- **Where workers run:** in the API process (`WORKER_INLINE=true`), as a separate process (`npm run worker`), or on serverless via
  `/api/v1/cron/outbox` plus a post-response `waitUntil` drain. Cron is the backstop; Vercel Hobby only allows daily crons, so use Pro
  (every minute) or a long-running worker for low latency.
- **Ambiguity policy:** if a provider call may or may not have been accepted (timeout, crash after the call started), the message is
  not resent. It is confirmed by a provider receipt or ends as `provider_timeout_unconfirmed`. Some uncertainty about third-party
  delivery always remains.
- **Provider receipts** dedupe on `(provider, message id, status)` and only move status forward; late `failed` never undoes `delivered`.

## Security-relevant design choices

- OTP codes are `HMAC(OTP_HMAC_KEY, seed | version)`, never stored; verification is one atomic statement plus a conditional flip.
- API keys: 256-bit random, SHA-256 at rest; provider and webhook secrets AES-256-GCM encrypted with `APP_ENCRYPTION_KEY`.
- Outgoing webhooks: HMAC-SHA256 over timestamp and raw body, SSRF-safe delivery (re-validated at connect time, no redirects, no private ranges).
- Raw SQL compares explicit UTC parameters, never the database's local `now()`.

## Data model (new tables)

`ApiKey` (extended), `ChannelConnection`, `Recipient`, `TelegramLinkToken`, `IdempotencyRecord`, `DocumentCounter`, `IssuedDocument`,
`OtpChallenge`, `Delivery`, `DeliveryAttempt`, `ProviderStatusEvent`, `OutboxEvent`, `MerchantWebhookEndpoint/Event/Delivery/Attempt`,
`RateLimitBucket`, `ActivationQuote`, `ActivationPayment`, `Entitlement`; plus `Workspace.suspendedAt`, `BusinessProfile.invoiceFooter`,
`addressText`, `allowedLinkOrigins`. Migrations are additive; the previous invoicing tables are untouched.
