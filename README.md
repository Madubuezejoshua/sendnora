# Sendnaro

Automated customer messages through one API. Connect your website or app to send **invoices and receipts**,
**WhatsApp verification codes**, and **order updates** (WhatsApp and Telegram), with delivery tracking, retries and
signed webhooks. Set up once, send from your backend, track every delivery.

> Status: implemented and tested locally against a real PostgreSQL. **Not deployed under the Sendnaro name,
> and no real WhatsApp/Telegram/payment provider has been exercised.** See [TEST_REPORT.md](TEST_REPORT.md) for what
> ran, what was simulated and what was not run.

## What is in the box

| Area                 | What it does                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Public API `/api/v1` | API-key authenticated: invoices/receipts, WhatsApp OTP, notifications, Telegram linking, deliveries                  |
| Pipeline             | Transactional outbox, workers with crash recovery, retries with backoff, provider receipts, signed outgoing webhooks |
| Sandbox              | The real API and pipeline with simulated providers; separate keys, data and numbering; watermarked PDFs              |
| Console `/console`   | Integration checklist, sandbox playground, API keys, deliveries, settings (profile, channels, webhooks), activation  |
| Admin `/admin`       | Billing switch (off by default), price, gateway readiness, verified revenue, suspension, audit history               |
| Website              | Home, API docs, pricing (reflects real billing state), privacy, terms, support                                       |

Not a CRM, accounting suite or campaign sender. No generative AI is involved in producing invoices or codes.

## Quick start (local)

Requirements: Node 20+, PostgreSQL 16 (Docker is the easy route).

```bash
npm ci
cp .env.example .env            # fill the secrets: see ENVIRONMENT.md (openssl rand -base64 32 for each)
docker compose up -d            # PostgreSQL on :5432
npm run db:generate --workspace=@sendnaro/database
npm run db:migrate:deploy --workspace=@sendnaro/database
npm run db:seed --workspace=@sendnaro/database      # plans, templates, platform admin, billing defaults (billing OFF)
npm run dev                     # web on :3000, API on :4000 (set WORKER_INLINE=true so queued work is processed)
```

Then open http://localhost:3000, register, verify (the email is captured in `apps/web/.dev-emails/`), create a
business, and use the **sandbox playground** on the console's Integration page. Details: [SETUP.md](SETUP.md).

First request, from your server (put the sandbox key in an environment variable):

```bash
export SENDNARO_API_KEY=sn_test_...
bash examples/curl/create-invoice.sh
```

## Documentation

- [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md) — integrating a merchant backend; TypeScript examples in [examples/](examples)
- [docs/SANDBOX.md](docs/SANDBOX.md) — the sandbox, its scenarios and the playground
- [docs/BILLING.md](docs/BILLING.md) — one-time activation payments and how the owner turns them on
- [docs/CHANNELS.md](docs/CHANNELS.md) — connecting WhatsApp (Meta) and Telegram
- [apps/api/openapi.yaml](apps/api/openapi.yaml) — the v1 contract, verified against the router in tests
- [ARCHITECTURE.md](ARCHITECTURE.md), [SETUP.md](SETUP.md), [DEPLOYMENT.md](DEPLOYMENT.md), [ENVIRONMENT.md](ENVIRONMENT.md)
- [SECURITY.md](SECURITY.md), [OPERATIONS.md](OPERATIONS.md), [TESTING.md](TESTING.md), [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md)
- [TEST_REPORT.md](TEST_REPORT.md), [CHANGELOG.md](CHANGELOG.md), [docs/legacy](docs/legacy) (the previous invoicing product)

## Repository layout

```
apps/api        Express API (Vercel function or long-running process) + outbox worker
apps/web        Next.js website, console and admin
packages/database  Prisma schema, migrations, seed
packages/shared    Money/tax math, errors, phone parsing, branding
packages/config    Environment validation
packages/ui        Design system components
examples/       Tested server-side integration examples (shown in the docs)
```

## Brand assets

Until final artwork is supplied the UI renders a text wordmark. Set the paths in
`packages/shared/src/branding.ts` (`BRAND.assets`) and drop files in `apps/web/public/brand/`.

## Licence

Proprietary. See [LICENSE](LICENSE).
