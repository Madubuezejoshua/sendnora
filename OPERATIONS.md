# Operations

## Health and readiness

`GET /health` (liveness) and `GET /ready` (database reachable). Structured JSON logs carry `request_id` (also returned as `X-Request-Id`);
Authorization headers are redacted and OTP codes never exist in logs.

## Workers and schedules

- Process: in the API (`WORKER_INLINE=true`), stand-alone (`npm run worker` / `worker:start`), or `GET|POST /api/v1/cron/outbox` with
  `Authorization: Bearer $CRON_SECRET`. Run several workers if you like; jobs are claimed with `SKIP LOCKED`.
- Retention: `/api/v1/cron/maintenance` (also every six hours in the stand-alone worker) deletes expired rate-limit buckets, idempotency
  records, finished jobs, link tokens, OTP metadata, sandbox data and files, old live deliveries and webhook events.
- Legacy sweeps (`overdue-sweep`, `recurring-invoices`, `reminders`) concern the previous invoicing features.

## What to watch

- **Stuck work:** admin overview shows "Stuck jobs (dead)"; `OutboxEvent.status = 'DEAD'` rows have `lastError`. A job is retried 12 times with backoff first.
- **Deliveries stuck `processing`/`retrying`:** a crashed worker leaves an unfinished attempt; the next run marks it ambiguous and waits for a receipt
  (grace 10 minutes) instead of resending. This is intentional.
- **WhatsApp connection `ERROR`:** credentials were rejected (expired token). The business must update them in Settings, Channels.
- **Failed webhooks:** console, Settings, Webhooks shows recent attempts; after 8 attempts the callback is marked failed (the customer message is unaffected).
- **Billing:** every setting change and access change is in the admin audit history. A mismatch or forged payment is recorded as `billing.payment_mismatch`.

## Common procedures

- Suspend a business: Admin, Billing and access, Businesses, Suspend (blocks API and queued jobs in both environments).
- Replay nothing manually: do not insert outbox rows or edit delivery statuses by hand; use the API or let the worker finish.
- Neon cold starts can fail the first request after idle; connection strings use `connect_timeout=30`. Retry once.
- Backups: see [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). Take a branch before migrations.
