# Database

PostgreSQL via Prisma. Schema: `packages/database/prisma/schema.prisma`
(~50 models). Designed for [Neon](https://neon.tech) but works with any
Postgres 14+.

## Key design decisions

**Money is an `Int` of minor units, not `Decimal` or `Float`.** Every
amount column (`grandTotalMinorUnits`, `unitPriceMinorUnits`, etc.) is an
integer count of the currency's smallest unit (cents, kobo). This is safe
up to ~21.4M major units in a 2-decimal currency (e.g. $21,474,836.47),
which comfortably covers the freelancer/SME target market without the
BigInt-serialization overhead (JSON, TanStack Query, React state) that a
larger ceiling would impose across the whole stack. If you need to support
individual invoices above that ceiling, migrating these columns to
`BigInt` is the documented escape hatch — see `packages/shared/src/money`,
which would need `Money.amountMinorUnits` changed from `number` to
`bigint` in lockstep.

**Quantities, tax rates, and discount values are `Decimal`.** These need
arbitrary precision (fractional hours billed, tax rates like 7.5%) that
floats can't represent exactly and integers can't represent at all.
Prisma's `Decimal` maps to Postgres `NUMERIC` and is backed by the same
`decimal.js` library `packages/shared/src/money` uses directly, so
conversions between the two are lossless.

**Line items snapshot their data instead of only holding a foreign key.**
`InvoiceItem`/`QuoteItem`/`RecurringInvoiceItem` all store their own
`description`, `unitPriceMinorUnits`, and `taxRatePercent` columns, with
an _optional_ `productId` for traceability. Editing a `Product`'s price
next month must never change last month's already-issued invoice — the
product relation uses `onDelete: SetNull` for exactly this reason (you can
even delete the product entirely and the invoice still renders correctly).

**Receipts are doubly immutable.** Beyond the `ReceiptItem` snapshot rows
(same pattern as above), `Receipt.snapshotJson` stores a full point-in-time
JSON capture (business info, customer info, line items, totals) — this is
the belt-and-suspenders guarantee that a receipt's legal record never
drifts even if every other table it could theoretically join to changes
later.

**Public document links use a random `publicToken`, never the row's
`id`.** `Quote`, `Invoice`, and `Receipt` each have a `publicToken String
@unique` column (32-char unambiguous-alphabet random string — see
`packages/shared/src/utils/tokens.ts`), used in `/q/:token`, `/i/:token`,
`/r/:token` public URLs. The internal `cuid()` id is never exposed in a
public URL, so tokens can be rotated/revoked independently of the record's
identity.

**Every tenant-owned table has `workspaceId` indexed.** See
ARCHITECTURE.md for how this is enforced at the query layer, not just the
schema layer.

**Soft deletes are selective, not universal.** `User`, `Customer`,
`Expense`, and `Workspace` carry a `deletedAt`/`archivedAt` column because
those records are commonly referenced by other rows that must keep
displaying sensible historical data (an archived customer's old invoices
still need to show the customer's name). Most other models use hard
deletes (e.g. `Category`, `TaxRate` deletion is blocked by FK constraints
from anything that references them, which is the correct behavior — you
generally cannot delete a tax rate that's in use).

**Atomic document numbering.** `DocumentSequence` holds one row per
`(workspaceId, documentType, year)`. Allocating the next number is a
Prisma `upsert` with `currentValue: { increment: 1 }` run **inside the
same transaction** that creates the document
(`apps/api/src/services/numbering.service.ts`) — Postgres's row-level
locking on the upsert is what prevents two concurrent invoice-creation
requests from ever receiving the same number. Never call
`allocateDocumentNumber` outside a transaction.

**UTC everywhere in storage.** Every `DateTime` column is UTC. Workspace
timezone (`Workspace.timezone`, an IANA string) is applied only at the
display/scheduling boundary — see `packages/shared/src/utils/dates.ts` and
`scheduling.ts` (used by recurring-invoice next-run calculation, which
deliberately preserves the _local_ hour-of-day across DST transitions).

## Migrations

```bash
# Create and apply a new migration during development
npm run db:migrate --workspace=@sendnaro/database

# Apply existing migrations in CI/production (never creates new ones)
npm run db:migrate:deploy --workspace=@sendnaro/database

# Regenerate the Prisma client after any schema change
npm run db:generate --workspace=@sendnaro/database
```

`prisma migrate reset` (via `npm run db:reset`) drops and recreates the
database — it has a confirmation prompt in interactive use and is **never**
run automatically by any script in this repo. Do not run it against a
database with real data.

**No migration files exist in this repo yet** (`prisma/migrations/` is
absent). `prisma migrate dev` needs a live database connection to diff
against and generate SQL, and no Postgres instance was reachable in the
environment this codebase was built in (see HANDOVER.md/TESTING.md — the
same constraint that blocked running the integration test suite). Whoever
first connects this to a real database must run
`npm run db:migrate --workspace=@sendnaro/database` once, locally, to
generate the initial migration from the current `schema.prisma` and commit
the resulting `prisma/migrations/` directory — do this _before_ the first
`migrate:deploy` in CI/production, which only applies migrations that
already exist and will do nothing on an empty directory.

## Seeding

- `npm run db:seed --workspace=@sendnaro/database` — safe in every
  environment, including production. Seeds `SubscriptionPlan` rows from
  `packages/shared/src/constants/plans.ts`, built-in `DocumentTemplate`
  rows, and (only if `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` are set) the
  first platform admin.
- `npm run db:seed:demo --workspace=@sendnaro/database` — **refuses to
  run when `NODE_ENV=production`**. Creates a fully-populated demo
  workspace (`isDemo: true`) with sample customers, products, a sent
  quote, a paid invoice + receipt, and an overdue invoice, so the product
  can be explored end-to-end before any real customer data exists. Login:
  `demo@sendnaro.com` / `DemoPassword123!` (change this in
  `packages/database/prisma/seed-demo.ts` if you redistribute the repo).

## Local development database

```bash
docker compose up -d      # Postgres 16 on localhost:5432
```

See `docker-compose.yml` at the repo root. For production, point
`DATABASE_URL`/`DIRECT_DATABASE_URL` at Neon instead — see DEPLOYMENT.md.
