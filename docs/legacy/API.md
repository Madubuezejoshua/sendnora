# API Reference

Base URL: `{API_INTERNAL_URL}/api/v1` (e.g. `http://localhost:4000/api/v1`).

Full machine-readable spec: `apps/api/openapi.yaml` (hand-maintained
alongside the routes; regenerate the summary tables below if you add
routes). This document is the human-readable companion.

## Conventions

- **Auth**: `Authorization: Bearer <token>` — a short-lived token minted by
  apps/web after validating the user's session. See ARCHITECTURE.md for
  the full trust-boundary design. Public endpoints (`/public/*`,
  `/health`, `/ready`, `/contact`) need no token.
- **Workspace context**: implicit from the token's `activeWorkspaceId`
  claim, re-verified against `WorkspaceMember` on every request. Routes
  that include `:workspaceId` in the path only do so for readability —
  it's cross-checked against the token's workspace, never trusted alone.
- **Pagination**: `?page=1&pageSize=20&sortBy=createdAt&sortDirection=desc&search=...`
  on list endpoints. Response shape: `{ items, page, pageSize, totalItems, totalPages }`.
- **Errors**: `{ error: { code, message, requestId, fieldErrors? } }`. See
  `packages/shared/src/errors.ts` for the full `ErrorCode` union and its
  HTTP status mapping (e.g. `PLAN_LIMIT_EXCEEDED` → 402, `FORBIDDEN` → 403,
  `INVALID_STATE_TRANSITION` → 409).
- **Idempotency**: payment-gateway webhooks are idempotent by
  `(provider, externalEventId)`. Payment attempt initialization is
  idempotent by `PaymentAttempt.reference`. There is no generic
  `Idempotency-Key` header support on other write endpoints (a deliberate
  scope cut — see HANDOVER.md).

## Route map

| Module             | Base path                                                                     | Notes                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Health             | `/health`, `/ready`                                                           | Mounted outside `/api/v1`, unauthenticated                                                                                   |
| Workspaces         | `/workspaces`, `/invitations/accept`                                          | Create/list/settings/members/invitations/ownership-transfer                                                                  |
| Customers          | `/customers`                                                                  | CRUD + archive/restore + statement + CSV export/import                                                                       |
| Products           | `/products`, `/categories`, `/tax-rates`                                      | CRUD + CSV export/import                                                                                                     |
| Quotes             | `/quotes`                                                                     | CRUD, send, respond, duplicate, convert, PDF                                                                                 |
| Invoices           | `/invoices`                                                                   | CRUD, issue, send, record payment, void, credit notes, PDF                                                                   |
| Payments           | `/invoices/:id/payment-link`, `/webhooks/paystack`, `/webhooks/flutterwave`   | Gateway init + webhook receivers (Paystack webhook also routes platform-subscription events, see Billing)                    |
| WhatsApp           | `/webhooks/whatsapp`                                                          | Meta Cloud API handshake (GET) + signed delivery-status callbacks (POST); unauthenticated by design (Meta signs the payload) |
| Receipts           | `/receipts`                                                                   | List/get/void/PDF                                                                                                            |
| Expenses           | `/expenses`                                                                   | CRUD                                                                                                                         |
| Recurring invoices | `/recurring-invoices`                                                         | CRUD, pause/resume                                                                                                           |
| Reminders          | (no direct routes — driven by `/cron/reminders`)                              |                                                                                                                              |
| Dashboard          | `/dashboard`                                                                  | Summary stats, per-currency                                                                                                  |
| Reports            | `/reports/*`                                                                  | Revenue, ageing, tax, discounts, expenses, profit estimate                                                                   |
| Notifications      | `/notifications`                                                              | List, mark read, browser push subscribe/unsubscribe                                                                          |
| Files              | `/files`, `/files/local/:key`                                                 | Upload, signed download URL                                                                                                  |
| Billing            | `/billing/*`                                                                  | Plans, manual plan change (non-prod), Paystack subscription checkout                                                         |
| API keys           | `/api-keys`                                                                   | Create/list/revoke — management only, see HANDOVER.md for auth-consumption status                                            |
| Admin              | `/admin/*`                                                                    | Platform-admin only — stats, users, workspaces, webhook events, feature flags, audit logs                                    |
| Public             | `/public/quotes/:token`, `/public/invoices/:token`, `/public/receipts/:token` | No auth — token-scoped document views, PDF, pay                                                                              |
| Cron               | `/cron/overdue-sweep`, `/cron/recurring-invoices`, `/cron/reminders`          | `CRON_SECRET` bearer auth, not a user session                                                                                |
| Contact            | `/contact`, `/support-tickets`                                                | Public contact form / authenticated support tickets                                                                          |

## Webhook URLs to register with providers

Register these against your **production** API URL once deployed —
see DEPLOYMENT.md for the full checklist:

- Paystack: `https://<api-domain>/api/v1/webhooks/paystack`
- Flutterwave: `https://<api-domain>/api/v1/webhooks/flutterwave`
- Meta WhatsApp Cloud API (once activated): `https://<api-domain>/api/v1/webhooks/whatsapp`
  (route is mounted; inert until `WHATSAPP_PROVIDER=meta-cloud-api` and
  the `META_WHATSAPP_*` env vars are set — see ENVIRONMENT.md)

## Example: creating and paying an invoice

```
POST /api/v1/customers                     -> { data: Customer }
POST /api/v1/invoices                      -> { data: Invoice (DRAFT) }
POST /api/v1/invoices/:id/issue            -> { data: Invoice (ISSUED) }
POST /api/v1/invoices/:id/send             -> { data: Invoice (SENT) }
GET  /api/v1/invoices/:id/payment-link     -> { data: { authorizationUrl, reference } }  (staff-initiated)
POST /api/v1/public/invoices/:token/pay    -> { data: { authorizationUrl, reference } }  (customer-initiated, no auth)
POST /api/v1/webhooks/paystack             -> provider calls this; recordPayment runs server-side after re-verification
GET  /api/v1/invoices/:id                  -> { data: Invoice (PAID), receipts: [...] }
```
