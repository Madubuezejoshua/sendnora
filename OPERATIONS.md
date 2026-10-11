# Operations

## Health & readiness

- `GET /health` — liveness only, no dependency checks. Never returns
  non-200 while the process is up.
- `GET /ready` — checks database connectivity (`SELECT 1`). Use this for
  load-balancer/deploy-gate health checks, not `/health`.

## Logs

Structured JSON logs via Pino (`apps/api/src/config/logger.ts`), pretty-
printed in development. Every request gets an `x-request-id` (propagated
from the client if provided, otherwise generated), echoed back in the
response header and in every error body — use it to correlate a user's
bug report with server logs.

Sensitive fields (passwords, tokens, API keys, authorization headers, card
data) are redacted unconditionally, in every environment — see SECURITY.md.

## Scheduled jobs (cron)

Three endpoints, protected by `CRON_SECRET` (bearer token, not a user
session — see `apps/api/src/middleware/cron-auth.ts`). All are safe to
call more often than necessary; each is idempotent.

| Endpoint                               | What it does                                                                                                                 | Suggested frequency |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `POST /api/v1/cron/overdue-sweep`      | Transitions past-due open invoices to `OVERDUE`                                                                              | Hourly              |
| `POST /api/v1/cron/recurring-invoices` | Generates invoices for due `RecurringInvoice` rows, advances `nextRunAt`                                                     | Hourly              |
| `POST /api/v1/cron/reminders`          | Sends due `ReminderSchedule` rows (email auto-sends; WhatsApp without Meta credentials creates a staff notification instead) | Hourly              |

Failures are recorded per-row (`RecurringInvoice.lastRunError`,
`ReminderSchedule.failureReason`) rather than thrown, so one bad row never
blocks the batch — check the admin panel's failed-jobs view.

## Admin panel operational views

Behind `PLATFORM_ADMIN` (see ARCHITECTURE.md § RBAC):

- `/admin/stats` — user/workspace/invoice counts, plan distribution.
- `/admin/webhook-events` — every processed/failed/ignored payment
  webhook, filterable by provider/status. Check this first when a
  merchant reports "I paid but the invoice still shows unpaid."
- `/admin/failed-jobs` — recurring invoices whose last generation attempt
  errored.
- `/admin/email-logs` — every `MessageDelivery` row (sent/failed, provider
  message id).
- `/admin/audit-logs` — every recorded `AuditLog` entry (invoice issued,
  payment recorded, ownership transferred, admin overrides, etc).
- `/admin/system-health` — live storage/email/WhatsApp provider
  configuration and DB connectivity, plus aggregate file-storage usage.

## Database connection management

Prisma's connection pool is process-local; `packages/database/src/index.ts`
stashes a single `PrismaClient` on `globalThis` in development to survive
hot-reload without opening a new pool per reload. In production (Railway),
each container instance gets one pool — if you scale horizontally, ensure
Neon's own connection limits/pooling (`DATABASE_URL`'s pooled endpoint) can
handle `instances × pool_size` connections.

## Rate limits

Configured in `apps/api/src/middleware/rate-limit.ts`:

- General API traffic: 300 req/min per IP.
- Public document views (`/public/*`): 120 req/min per IP.
- Payment webhooks: 240 req/min per IP (generous — providers retry).
- Contact form: 5 req/min per IP.

## Graceful shutdown

`apps/api/src/index.ts` handles `SIGTERM`/`SIGINT`: stops accepting new
connections, waits for in-flight requests, disconnects Prisma, and
force-exits after a 10-second timeout if something hangs. Railway sends
`SIGTERM` on redeploy/scale-down — this is what prevents mid-request
connection drops during a deploy.

## Incident response quick reference

1. Check `/ready` — is the database reachable?
2. Check `/admin/system-health` — which providers are configured, are they
   healthy?
3. Check `/admin/webhook-events` for payment issues specifically.
4. Check Railway/Vercel deployment logs for the actual stack trace (never
   exposed to API clients — see error-handler.ts).
5. Every error response includes a `requestId` — grep logs for it.
