# Sendnaro

Invoices, quotes and receipts your customers can pay in minutes — built for
freelancers and small businesses, with WhatsApp-first sharing and
Paystack/Flutterwave payment collection.

> "Sendnaro" is a working name. See HANDOVER.md for the one-file rebrand
> checklist.

## Overview

Sendnaro is a multi-tenant SaaS: businesses ("workspaces") create quotes
and invoices, share them with customers over WhatsApp or email, collect
payments online or record them manually, and get automatic receipts,
reminders and reports. Full requirements: PRODUCT_REQUIREMENTS.md. Full
architecture rationale, including the auth trust-boundary design:
ARCHITECTURE.md.

## Screenshots

Not included in this build — no deployment has been made yet to capture
real screenshots from. See MARKETPLACE_LISTING.md for the suggested
screenshot list once a deployment exists.

## Architecture

```
apps/web/    Next.js 15 — marketing site + authenticated app UI
apps/api/    Express 4 — the business-domain API
packages/database/  Prisma schema + client + auth crypto helpers
packages/shared/     Money math, validation, RBAC, branding — used by both apps
packages/ui/         Design system (Radix + Tailwind)
packages/config/     Shared tsconfig presets + env validation
```

See ARCHITECTURE.md for the full picture, especially the web↔API trust
boundary (how a browser session becomes an authenticated API call without
ever exposing the signing secret to the browser).

## Requirements

- Node.js 20+ (developed against Node 22/24)
- npm 10+
- Docker (for local Postgres) — or any Postgres 14+ connection string
- A Neon account for production (or any Postgres host)

## Installation

```bash
git clone <this-repo>
cd invoice_tap
npm install
```

## Environment setup

```bash
cp .env.example .env
```

Fill in `AUTH_SECRET`, `API_TOKEN_SECRET`, `APP_ENCRYPTION_KEY`,
`CRON_SECRET` with generated random values (`openssl rand -base64 32`).
Everything else has a working default for local development. Full
variable-by-variable reference: ENVIRONMENT.md.

## Database

```bash
docker compose up -d
npm run db:generate --workspace=@sendnaro/database
npm run build --workspace=@sendnaro/database            # compiles the package — see SETUP.md
npm run db:migrate --workspace=@sendnaro/database
npm run db:seed --workspace=@sendnaro/database         # plans + optional platform admin
npm run db:seed:demo --workspace=@sendnaro/database     # demo workspace, refuses to run in production
```

Demo login after seeding: `demo@sendnaro.com` / `DemoPassword123!`.

## Development

```bash
npm run dev          # both apps together (web on :3000, api on :4000)
npm run dev:web       # web only
npm run dev:api       # api only
```

Open http://localhost:3000.

## Test commands

```bash
npm run test                                    # every workspace's tests
npm run test --workspace=@sendnaro/shared      # unit tests (no DB needed)
npm run test --workspace=@sendnaro/api         # unit + integration (needs Postgres)
npm run test:e2e --workspace=@sendnaro/web     # Playwright (needs the full stack + Postgres)
```

See TESTING.md for exactly what's covered, and — importantly — what was
actually executed and passing in the environment that produced this
repository versus written-but-unverified there.

## Production build

```bash
npm run build
```

## Deployment

Vercel (web) + Railway (api, Dockerfile provided) + Neon (database) +
Backblaze B2 (storage) + Resend (email). Full steps: DEPLOYMENT.md.

## Documentation index

| File                                            | Covers                                          |
| ----------------------------------------------- | ----------------------------------------------- |
| ARCHITECTURE.md                                 | System design, the web↔API trust boundary       |
| PRODUCT_REQUIREMENTS.md                         | Features, pricing, scope                        |
| SETUP.md                                        | Detailed local dev setup                        |
| ENVIRONMENT.md                                  | Every environment variable                      |
| DATABASE.md                                     | Schema design rationale, migrations, seeding    |
| API.md                                          | Route map, conventions                          |
| SECURITY.md                                     | Controls implemented, vulnerability reporting   |
| TESTING.md                                      | What's tested, how to run it                    |
| DEPLOYMENT.md                                   | Production deployment steps                     |
| OPERATIONS.md                                   | Cron jobs, logs, admin panel, incident response |
| BACKUP_AND_RESTORE.md                           | Database/file backup and disaster recovery      |
| HANDOVER.md                                     | What's built, what's not, rebrand checklist     |
| CHANGELOG.md / ROADMAP.md                       | History and what's next                         |
| MARKETPLACE_LISTING.md / DATA_ROOM_CHECKLIST.md | Acquisition preparation                         |

## Troubleshooting

- **"Invalid environment configuration" on boot** — a required variable is
  missing; the error message from `packages/config/src/env.ts` names it.
- **Prisma client errors after pulling schema changes** — run
  `npm run db:generate --workspace=@sendnaro/database`.
- **`npm install` is very slow on Windows** — this is typically real-time
  antivirus scanning of `node_modules` writes, not a hang; give it time.
- **Docker Desktop won't come up** — the app still runs against any
  Postgres connection string; point `DATABASE_URL` at a hosted instance
  (e.g. a free Neon branch) if your local Docker engine is unavailable.
- **Emails aren't sending** — `EMAIL_PROVIDER=dev` (the default) writes
  emails to `apps/api/.dev-emails/*.html` and logs a preview instead of
  sending; switch to `EMAIL_PROVIDER=resend` with real credentials to send
  for real.
- **`npm run build --workspace=@sendnaro/web` fails with `EPERM:
operation not permitted, scandir 'C:\Users\<you>\Application Data'` (or
  `...\Cookies`, `...\Local Settings`)** — this is a Windows-specific
  quirk, not a bug in this codebase: some upgraded/legacy Windows user
  profiles carry hidden NTFS junctions (`Application Data`, `Cookies`,
  etc.) under `%USERPROFILE%` that throw `EPERM` when a tool recursively
  scans the home directory. It does not occur on Linux (Vercel/Railway/CI
  all build on Linux, so production deploys are unaffected). If you hit
  this locally, either build inside Docker/WSL2, or point `HOME`/
  `USERPROFILE` at a directory without these junctions for the build
  command only, e.g. (PowerShell): `$env:USERPROFILE='C:\temp-home';
npm run build`.

## License

Proprietary — see LICENSE.
