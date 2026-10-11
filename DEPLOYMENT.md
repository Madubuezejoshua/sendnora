# Deployment

Target topology: **Vercel** (apps/web) + **Railway** (apps/api, Docker) +
**Neon** (Postgres) + **Backblaze B2** (file storage) + **Resend** (email).
No deployment has been performed by the build process that produced this
repository — the steps below are what you (the owner) run.

## 1. Neon (database)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string → `DATABASE_URL`.
3. Copy the **unpooled** connection string (Neon calls this the "direct"
   connection) → `DIRECT_DATABASE_URL`. Migrations require the unpooled
   connection.
4. Run migrations against it once, from your machine or CI:
   ```bash
   DATABASE_URL=... DIRECT_DATABASE_URL=... npm run db:migrate:deploy --workspace=@invoicetap/database
   DATABASE_URL=... DIRECT_DATABASE_URL=... npm run db:seed --workspace=@invoicetap/database
   ```

## 2. Backblaze B2 (storage)

1. Create a bucket (private, not public).
2. Create an Application Key scoped to that bucket → `B2_KEY_ID` /
   `B2_APPLICATION_KEY`.
3. Note the S3-compatible endpoint for your region → `B2_ENDPOINT`
   (e.g. `https://s3.us-west-004.backblazeb2.com`).
4. Set `STORAGE_PROVIDER=b2`, `B2_BUCKET_NAME`, `B2_REGION`.

## 3. Resend (email)

1. Add and verify your sending domain at [resend.com](https://resend.com).
2. Create an API key → `RESEND_API_KEY`.
3. Set `EMAIL_PROVIDER=resend`, `EMAIL_FROM="InvoiceTap <you@yourdomain>"`.

## 4. Railway (API)

1. New project → Deploy from GitHub repo → root directory `apps/api`
   (Railway auto-detects `apps/api/railway.json`, which points at
   `apps/api/Dockerfile`).
2. Set every required variable from ENVIRONMENT.md as a Railway
   environment variable (never commit them).
3. Railway sets its own `PORT` — the API reads `API_PORT` for local dev,
   but `src/index.ts` should be pointed at Railway's `PORT` in production;
   the simplest fix is to also set `API_PORT=$PORT` in Railway's variable
   editor (Railway supports variable references), or override with
   `API_PORT` directly to Railway's assigned value.
4. Confirm the healthcheck path `/health` (already configured in
   `railway.json`) goes green.
5. Set up the scheduled cron calls (Railway doesn't have built-in cron on
   all plans — use Railway's Cron Jobs feature if available on your plan,
   or an external scheduler like GitHub Actions `schedule:` hitting these
   with the `CRON_SECRET` bearer token):
   - `POST /api/v1/cron/overdue-sweep` — every hour
   - `POST /api/v1/cron/recurring-invoices` — every hour
   - `POST /api/v1/cron/reminders` — every hour

## 5. Vercel (web)

1. New project → import the repo → root directory `apps/web`.
2. Framework preset: Next.js (auto-detected).
3. Set every `NEXT_PUBLIC_*` and server-side web variable from
   ENVIRONMENT.md.
4. `NEXT_PUBLIC_API_URL` must point at your deployed Railway API's public
   URL.

## 6. Paystack / Flutterwave

1. Get live secret/public keys from each dashboard once you're ready to
   accept real payments (test keys work identically against the same
   adapter code for a staging deployment).
2. Register webhook URLs (see API.md § "Webhook URLs to register"):
   - Paystack → Settings → API Keys & Webhooks → `https://<api-domain>/api/v1/webhooks/paystack`
   - Flutterwave → Settings → Webhooks → `https://<api-domain>/api/v1/webhooks/flutterwave`,
     and set the **same** secret hash you configure as
     `FLUTTERWAVE_WEBHOOK_SECRET_HASH`.

## 7. Meta WhatsApp Cloud API (optional)

Click-to-chat works with zero setup. To enable automatic sending:

1. Create a Meta App with the WhatsApp product at
   [developers.facebook.com](https://developers.facebook.com).
2. Get a permanent access token, phone number ID, and business account ID.
3. Set all `META_WHATSAPP_*` variables and `WHATSAPP_PROVIDER=meta-cloud-api`.
4. **Note:** the webhook _route_ for inbound delivery-status events is
   prepared in the adapter (`services/whatsapp/meta-cloud-api.provider.ts`)
   but not yet mounted in `routes.ts` — see HANDOVER.md. Automatic
   _sending_ works without this; only inbound delivery-status callbacks
   need it.

## Custom domain

- Vercel: Project → Settings → Domains → add your apex/subdomain, update
  your DNS per Vercel's instructions.
- Railway: Project → Settings → Networking → Custom Domain, add a CNAME.
- Update `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_API_URL` / `CORS_ORIGINS` to
  the final domains and redeploy both apps.

## Post-deployment smoke test

A minimal script is provided at `scripts/smoke-test.sh` — run it with your
deployed URLs:

```bash
API_URL=https://api.yourdomain.com WEB_URL=https://yourdomain.com ./scripts/smoke-test.sh
```

It checks: API `/health` and `/ready`, the web app's homepage responds
200, and that an unauthenticated API request to a protected route
correctly returns 401 (proving auth middleware is live, not accidentally
bypassed).

## Rollback

- **Vercel**: Deployments tab → select the previous successful deployment
  → "Promote to Production". Instant, no rebuild needed.
- **Railway**: Deployments tab → select the previous deployment → Redeploy.
- **Database**: Prisma migrations are forward-only by design. To roll back
  a schema change, write a new migration that reverses it — never edit or
  delete a migration file that has already been applied to production.
  Take a Neon branch/snapshot before any risky migration (see
  BACKUP_AND_RESTORE.md).

## Environment-variable checklist before going live

Walk ENVIRONMENT.md top to bottom. At minimum, production needs: every
"Required" row filled with a real, unique secret; and
`EMAIL_PROVIDER`/`STORAGE_PROVIDER` credentials filled for whichever
provider you selected (the app refuses to boot otherwise — see
`packages/config/src/env.ts`).
