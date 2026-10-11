# Setup

Detailed local development setup. For the quick version, see README.md.

## 1. Prerequisites

- Node.js 20 or later (this build was developed against Node 24)
- npm 10 or later
- Docker Desktop (for local Postgres) — or access to any Postgres 14+
  instance

## 2. Install dependencies

```bash
npm install
```

This installs every workspace's dependencies via npm workspaces in one
pass — no need to `cd` into each app/package.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Generate the four required secrets:

```bash
openssl rand -base64 32   # run 4 times, paste one result each into:
# AUTH_SECRET, API_TOKEN_SECRET, APP_ENCRYPTION_KEY, CRON_SECRET
```

Everything else in `.env.example` has a working local-development default
(`EMAIL_PROVIDER=dev`, `STORAGE_PROVIDER=local`,
`WHATSAPP_PROVIDER=click-to-chat`) — no external accounts are required to
run the full product locally. See ENVIRONMENT.md for what each variable
does and where to get real credentials when you're ready.

## 4. Start Postgres

```bash
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` with the credentials already
matching `.env.example`'s `DATABASE_URL`. If Docker isn't available to
you, point `DATABASE_URL`/`DIRECT_DATABASE_URL` at any other Postgres
instance instead (a free Neon branch works well for this).

## 5. Set up the database

```bash
npm run db:generate --workspace=@invoicetap/database   # generates the Prisma client
npm run build --workspace=@invoicetap/database          # compiles the package (needed by apps/api — see below)
npm run db:migrate --workspace=@invoicetap/database     # creates tables
npm run db:seed --workspace=@invoicetap/database        # subscription plans + document templates
npm run db:seed:demo --workspace=@invoicetap/database    # demo workspace with sample data
```

`@invoicetap/database` is the one workspace package that ships a real
compiled output rather than raw TypeScript — it re-exports the generated
Prisma client, whose runtime can't be bundled by esbuild for apps/api's
production build (see the comment in `apps/api/tsup.config.ts`), so it
needs to be resolvable by plain Node like any other npm package.
Re-run `npm run build --workspace=@invoicetap/database` after pulling
changes to `packages/database/src/*` or the Prisma schema.

To also seed a platform admin account, set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` in `.env` before running `db:seed`.

## 6. Run the app

```bash
npm run dev
```

- Web app: http://localhost:3000
- API: http://localhost:4000 (health check at `/health`)

Log in with the demo account: `demo@invoicetap.app` / `DemoPassword123!`
(seeded in step 5), or register a new account at
http://localhost:3000/register — since `EMAIL_PROVIDER=dev` by default,
the verification email is written to `apps/api/.dev-emails/*.html` and
also printed to the web app's server console rather than actually sent;
open the printed link to verify.

## 7. Everyday development commands

```bash
npm run lint             # ESLint, every workspace
npm run typecheck        # TypeScript, every workspace
npm run test             # Vitest, every workspace
npm run format            # Prettier, write mode
npm run build             # production build, every workspace
```

## 8. Resetting your local database

```bash
npm run db:reset --workspace=@invoicetap/database
```

This drops and recreates the database from migrations (with a
confirmation prompt) — never run it against anything but your local
disposable database.

## Common issues

See the Troubleshooting section in README.md.
