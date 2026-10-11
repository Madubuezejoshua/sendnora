# Backup & Restore

## Database (Neon)

Neon takes automatic backups and supports **point-in-time restore** on
paid plans (check your plan's retention window in the Neon dashboard —
free tier has a shorter window than paid tiers).

**Before any risky operation** (a large migration, a bulk data fix), create
a Neon **branch** — it's an instant, cheap, full copy-on-write snapshot of
the database you can restore from or discard:

```bash
# Via the Neon CLI (or use the dashboard: Branches → Create Branch)
neonctl branches create --project-id <your-project-id> --name pre-migration-backup
```

To restore: either point `DATABASE_URL`/`DIRECT_DATABASE_URL` at the
branch temporarily to inspect/recover specific rows, or use Neon's
"Restore" action on the branch to reset the main branch to that point in
time.

**Manual logical backup** (portable, provider-independent):

```bash
pg_dump "$DIRECT_DATABASE_URL" -F c -f backup-$(date +%Y%m%d-%H%M%S).dump

# Restore into a fresh database:
pg_restore -d "$DIRECT_DATABASE_URL" backup-20260101-120000.dump
```

Store these dumps encrypted, off-platform (not in this git repo), with
access restricted to people who need it — they contain real customer PII
and financial data.

## File storage (Backblaze B2)

B2 buckets support versioning — enable it (Bucket Settings → Lifecycle
Rules) so an accidental overwrite/delete is recoverable. There is no
separate backup job in this codebase; B2's own durability + versioning is
the backup story for uploaded files (logos, generated PDFs, expense
receipts).

## What's NOT backed up automatically

- Local `.dev-storage/` and `.dev-emails/` (development-only, gitignored,
  never used in production — see ENVIRONMENT.md, `STORAGE_PROVIDER=local`
  is rejected at boot in production).
- Environment variables/secrets themselves — keep a secure copy (a
  password manager, not this repo) of every production secret; losing
  `APP_ENCRYPTION_KEY` makes every stored workspace payment-provider
  credential permanently unrecoverable (they'd need to be re-entered by
  each workspace).

## Disaster recovery checklist

1. Confirm the database is actually unavailable (`/ready` failing) vs. an
   application bug — check Neon's status page first.
2. If Neon has an outage: wait, or restore the most recent branch/dump
   into a temporary Neon project and repoint `DATABASE_URL` there as a
   stopgap.
3. If data was corrupted by a bad migration/script: restore a
   pre-incident Neon branch, cherry-pick the specific rows needed, apply
   to production via a careful, reviewed script — never `pg_restore`
   straight over a database with newer legitimate writes without
   reconciling them first.
4. After recovery, check `/admin/webhook-events` for any payment webhooks
   that may have arrived during the outage window and need reprocessing
   (they're idempotent — safe to have the provider retry, or manually
   replay by reposting the stored payload).
