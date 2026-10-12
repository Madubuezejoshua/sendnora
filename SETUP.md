# Local setup

## Prerequisites

Node 20+ (tested on 24), npm 10+, PostgreSQL 16 (Docker Desktop is the simplest). Windows note: if `next build` fails with `EPERM ... scandir
'...\Application Data'`, build with a clean profile for that command, for example PowerShell `$env:USERPROFILE='C:\temp-home'; npm run build`.
Docker Desktop on Windows Home needs WSL2; without it, any PostgreSQL (including a portable one) works: only `DATABASE_URL` matters.

## Steps

```bash
npm ci
cp .env.example .env     # then generate secrets, see ENVIRONMENT.md
# apps read their own env files; copy or link .env to apps/api/.env, apps/web/.env.local and packages/database/.env
docker compose up -d
npm run db:generate --workspace=@sendnaro/database
npm run db:migrate:deploy --workspace=@sendnaro/database
npm run db:seed --workspace=@sendnaro/database
```

Set `WORKER_INLINE=true` in `apps/api/.env` so queued work (invoice rendering, deliveries, webhooks) is processed while you develop.
Use a UTF-8 database (Docker's `postgres:16-alpine` is); a WIN1252 database cannot store names such as "Ọláwálé".

```bash
npm run dev          # web http://localhost:3000, API http://localhost:4000
```

Register at `/register`. Dev emails are written to `apps/web/.dev-emails/` (open the verification link from the file). The seeded platform
admin is `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, who can open `/admin`.

## Everyday commands

| Command                                                           | Purpose                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run typecheck` / `npm run lint`                              | Static checks across all workspaces                                   |
| `npm run test --workspace=@sendnaro/api`                          | API unit and integration tests (needs the database)                   |
| `npm run build` then `npm run test:e2e --workspace=@sendnaro/web` | Browser tests; boots API (inline worker) and the production web build |
| `npm run worker --workspace=@sendnaro/api`                        | Stand-alone outbox worker                                             |
| `npm run db:studio --workspace=@sendnaro/database`                | Inspect data                                                          |

The integration tests share one database and create their own tenants; use a throwaway database, never production.
