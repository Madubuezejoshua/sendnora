# Architecture

Sendnaro is a TypeScript monorepo with two deployable applications and four
shared packages.

```
apps/
  web/       Next.js 15 (App Router) — marketing site + authenticated app UI
  api/       Express 4 — the business-domain API (customers, quotes,
             invoices, payments, PDFs, webhooks, admin)
packages/
  database/  Prisma schema, generated client, password hashing, encryption
  shared/    Money math, validation schemas, RBAC, constants, branding —
             consumed by BOTH apps, must stay framework-agnostic
  ui/        Design system (Radix primitives + Tailwind)
  config/    Shared tsconfig presets + environment-variable validation
```

Packages are consumed as raw TypeScript source (no separate build step) —
apps/web transpiles them via Next.js's `transpilePackages`, apps/api bundles
them via `tsup`/`tsx`. This is deliberate: it keeps the dev loop fast (no
"rebuild the package" step) and is a well-established pattern in modern
TypeScript monorepos. `packages/database` is the one exception — Prisma
genuinely needs a generation step (`prisma generate`), which produces a real
compiled client under `packages/database/generated/`.

## The trust boundary: apps/web ↔ apps/api

This is the single most important architectural decision in the codebase,
so it gets its own section.

**apps/web owns identity.** It runs Auth.js (NextAuth v5) with a Prisma
adapter, using the _database_ session strategy (not JWT) so that "log out
other sessions" and "login history" are real, queryable data (the `Session`
and `LoginEvent` tables). The Credentials provider's `authorize()` callback
queries `User` via `@sendnaro/database` directly and verifies the password
with Argon2id (`packages/database/src/password.ts`). apps/web is the only
place that ever touches a plaintext password or a session cookie.

**apps/api owns the business domain.** Every customer, quote, invoice,
payment, and report lives behind Express routes in `apps/api`. It has _no
concept_ of Auth.js, cookies, or login flows.

**The bridge is a short-lived, signed JWT — not the session cookie.**
apps/web never forwards its session cookie to apps/api. Instead, on every
server-side call to the API (a Server Component fetch, a Route Handler, a
Server Action), apps/web:

1. Validates the caller's Auth.js session server-side.
2. Mints a JWT via `packages/shared/src/server/api-token.ts` — `sub` (user
   id), `activeWorkspaceId` (the workspace the user currently has selected
   in the UI), `isPlatformAdmin`, signed with `API_TOKEN_SECRET`, expiring
   in 5 minutes.
3. Sends it as `Authorization: Bearer <token>` to apps/api.

apps/api's `requireAuth` middleware (`apps/api/src/middleware/auth.ts`)
verifies the signature and expiry and populates `req.auth`. It trusts
**nothing else** in the request for identity — not a header, not a query
param, not the request body.

Critically, **the workspace context is re-derived from the database on every
request**, not just trusted from the token
(`apps/api/src/middleware/workspace-context.ts`): the middleware looks up
`WorkspaceMember` by `(activeWorkspaceId, userId)` from the token and 404s
if the membership doesn't exist or was removed. This means even a
technically-valid-but-stale token (user was kicked from the workspace 30
seconds ago) can't be used to read or write that workspace's data. Every
downstream service function takes `workspaceId` from `req.workspace`, never
from a route param or body field — route params that echo the workspace id
for URL readability (`/workspaces/:workspaceId/...`) are cross-checked
against `req.workspace.workspaceId` and rejected on mismatch
(`requireMatchingWorkspaceParam`).

**Why not just forward the session cookie / call Prisma directly from
apps/web for everything?** Two reasons: (1) it would mean reimplementing
every permission check in two places (Next.js Server Components _and_
Express), which is exactly how tenant-isolation bugs get introduced; (2) it
collapses the "thin, replaceable frontend / API is the product" separation
the take-home spec asks for — a future mobile app or third-party
integration can talk to the same Express API apps/web uses, through the
same token-issuance pattern (or, longer-term, real OAuth2/API keys — see
`ApiKey` in the schema, reserved for that).

**Why JWT and not database sessions for this bridge?** A 5-minute JWT means
apps/api never needs a network round-trip to validate a session on every
request (it only needs to verify an HMAC signature), and revocation risk is
bounded to 5 minutes by design — acceptable for a short-lived
service-to-service token minted fresh per request, unlike a long-lived user
session where "log out everywhere" needs to take effect immediately (which
is why _that_ uses the database-backed `Session` table instead).

## RBAC

Two independent role systems, defined once in `packages/shared/src/constants/roles.ts`:

- **Platform roles** (`PLATFORM_ADMIN`, `PLATFORM_SUPPORT`) — not tied to a
  workspace, checked via `req.auth.isPlatformAdmin` /
  `requirePlatformAdmin` middleware. Gate the admin panel.
- **Workspace roles** (`WORKSPACE_OWNER`, `WORKSPACE_ADMIN`, `ACCOUNTANT`,
  `STAFF`, `VIEWER`) — a permission matrix (`ROLE_PERMISSIONS`) maps each
  role to a set of fine-grained `Permission` strings
  (`invoice:write`, `payment:refund`, `workspace:transfer_ownership`, ...).
  `requirePermission(permission)` middleware checks
  `req.workspace.role` against this matrix.

Authorization is enforced **only** server-side. The frontend reads the same
`ROLE_PERMISSIONS` table to hide/disable buttons for a better UX, but that
is a convenience, not a security boundary — every mutating endpoint
re-checks the permission independently.

## Data layer

- PostgreSQL via Prisma, designed for Neon (pooled `DATABASE_URL` +
  unpooled `DIRECT_DATABASE_URL` for migrations).
- Every tenant-owned table carries `workspaceId` with an index; see
  DATABASE.md for the full schema rationale (money-as-integer-minor-units,
  document-snapshot immutability, atomic numbering).
- `packages/shared/src/money` is the single source of truth for all
  monetary arithmetic (tax, discounts, totals, rounding) — the API's
  persistence layer, the PDF renderer, and the dashboard/reports all call
  the same `computeDocumentTotals()` function so numbers can never diverge
  between surfaces.

## PDF, email, WhatsApp, storage, payments — provider abstractions

Each of these lives behind a small interface in `apps/api/src/services/*`
with a "real" adapter and (for email/storage) a zero-config local adapter,
so the whole product is demoable before any external account exists:

| Concern  | Interface                         | Adapters                                                         |
| -------- | --------------------------------- | ---------------------------------------------------------------- |
| Email    | `EmailProvider`                   | `ResendEmailProvider`, `DevEmailProvider` (writes `.html` files) |
| Storage  | `StorageProviderAdapter`          | `B2StorageProvider`, `LocalStorageProvider`                      |
| Payments | `PaymentGatewayProvider`          | `PaystackProvider`, `FlutterwaveProvider`                        |
| WhatsApp | (function-level, not class-based) | click-to-chat (always on), Meta Cloud API (credential-gated)     |

`packages/config/src/env.ts` enforces at process boot that production
can't start with a provider selected but its credentials missing — see
`assertProductionInvariants()`.

## Why not microservices

One API process, one Postgres database, one Next.js app. This is a
deliberate simplicity choice for a product at this stage: it is easier to
reason about, easier to hand over to a buyer, and cheaper to operate. The
provider-abstraction pattern above means swapping a piece out (e.g. adding
Stripe, or splitting billing into its own service later) doesn't require
touching call sites throughout the codebase.
