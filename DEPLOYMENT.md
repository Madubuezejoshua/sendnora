# Deployment

Sendnaro is two deployables plus PostgreSQL and private object storage. Nothing here has been deployed under the Sendnaro name
or at `sendnaro.com`; the domain is only the intended production origin. Prior test deployments used older project names.

## Topology options

1. **Vercel for both** (what the existing config targets): project `web` (root `apps/web`) and project `api` (root `apps/api`).
   Each has its own `vercel.json`. Set the web app's `API_INTERNAL_URL` to the API project's URL; the web app rewrites `/api/v1/*` to it.
2. **Vercel web + a container for the API** (`apps/api/Dockerfile`, e.g. Railway): set `WORKER_INLINE=true` (or run `npm run worker:start`
   as a second service). Best latency, no cron dependency.

Serverless caveats: the API has no always-on worker. Work is durable in the outbox and drained by `/api/v1/cron/outbox` and a
post-response `waitUntil` drain. Vercel Hobby crons run at most daily, so for prompt retries and receipts use Vercel Pro
(edit the schedule to `* * * * *`) or option 2.

## Order of operations

1. Create the database (Neon: pooled `DATABASE_URL` with `pgbouncer=true&connect_timeout=30`, unpooled `DIRECT_DATABASE_URL` with `connect_timeout=30`).
2. Create a Backblaze B2 **private** bucket and an application key limited to it (`STORAGE_PROVIDER=b2`; production refuses local storage).
3. Set environment variables on both projects (see [ENVIRONMENT.md](ENVIRONMENT.md)); production boot fails fast if `OTP_HMAC_KEY`,
   storage or email configuration is missing.
4. **Migrate before deploying code that needs it:** `npm run db:migrate:deploy --workspace=@sendnaro/database` (uses `DIRECT_DATABASE_URL`),
   then `npm run db:seed --workspace=@sendnaro/database` (idempotent; inserts `billing_required=false` only if missing).
5. Deploy `api`, then `web`. Smoke-check `/health`, `/ready`, `/api/v1/ping` with a key, and the sandbox playground.
6. Register provider webhooks: Telegram (`setWebhook`, see [docs/CHANNELS.md](docs/CHANNELS.md)); each business registers its own Meta callback
   (shown in the console); Paystack `<origin>/api/v1/webhooks/sendnaro-activation` only if billing will be used.
7. Rehearse in sandbox, then connect a real WhatsApp sender with a designated test recipient before any customer traffic.

## Migrations: order and rollback

Migrations are additive (no drops): `20261008193047_init` (existing schema), `..._telegram_channel`, `..._sendnaro_core`, `..._delivery_api_key`,
`..._allowed_link_origins`. Apply in order with `migrate deploy`; never edit an applied migration. Existing `ApiKey` rows become `LIVE` keys with
no scopes (they cannot authenticate to v1). Rollback: take a Neon branch or `pg_dump` first (see [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md));
the old application keeps working on the new schema because nothing was removed, so rolling the **code** back needs no schema change. To revert the
schema, restore the branch or drop the new tables/columns by a reviewed script; do not drop the legacy tables.

## Vercel specifics

- `apps/api/vercel.json`: install with dev dependencies, build the workspace chain, rewrite all paths to the function, trace Prisma, PDF libraries and
  the Noto fonts, and schedule daily crons (`outbox`, `maintenance`, and the legacy sweeps). Vercel sends `Authorization: Bearer $CRON_SECRET`.
- `apps/web/vercel.json`: copies the Prisma engine into `apps/web/generated/client` (Prisma looks there at runtime) and builds `build:web`.
- Prisma needs the `rhel-openssl-3.0.x` binary target (already in the schema).
- A custom domain: add it to the web project, then set `NEXT_PUBLIC_APP_URL`, `CORS_ORIGINS` and the provider webhook URLs to it.

## Remaining requirements before real customers

See [TEST_REPORT.md](TEST_REPORT.md), section "Not run", for the precise list: Meta onboarding and approved templates, a real WhatsApp and Telegram
smoke test, a Paystack test-mode checkout against the real gateway, final logo/favicon, lawyer-reviewed legal pages, and operator details.
