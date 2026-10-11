# Product Requirements

## Mission

"Create professional invoices, get paid and send receipts through WhatsApp
in minutes." InvoiceTap helps freelancers, small businesses, agencies and
merchants create quotations, invoices and receipts; get paid online; and
reach customers who primarily communicate over WhatsApp — with particular
attention to African markets (local currencies, WhatsApp-first sharing,
Paystack/Flutterwave payment rails).

## Primary users

Freelancers, small retail businesses, service providers, agencies,
consultants, contractors, online vendors, and accountants managing
multiple client businesses.

## Pricing (centralized in `packages/shared/src/constants/plans.ts`, seeded

into `SubscriptionPlan` — never hardcoded elsewhere)

| Plan     | Price (indicative, USD) | Invoices/mo | Customers | Team      | Key features                                                             |
| -------- | ----------------------- | ----------- | --------- | --------- | ------------------------------------------------------------------------ |
| Free     | $0                      | 5           | 3         | 1         | Basic PDF, WhatsApp sharing, manual payments                             |
| Starter  | $9/mo                   | 100         | Unlimited | 1         | + branding, email delivery, online payments, reminders, basic reports    |
| Business | $29/mo                  | Unlimited*  | Unlimited | 5         | + team, recurring invoices, custom numbering, expenses, advanced reports |
| Agency   | $79/mo                  | Unlimited*  | Unlimited | Unlimited | + multiple workspaces, white-label documents, consolidated reporting     |

\* Subject to a fair-use ceiling (2,000/month) to prevent abuse —
`FAIR_USE_INVOICE_CEILING_PER_MONTH` in the plans constant.

Prices above are the values currently seeded; change them in one place
(`plans.ts`) before launch — they have not been validated against real
market research.

## Feature checklist against this build

This tracks the original brief's feature list against what's actually
implemented. "API" means the Express endpoint exists and is
tested/testable. **The UI column, and the authoritative statement of what
apps/web actually covers, lives in HANDOVER.md** — it is written last,
after the frontend build, specifically so it reflects reality rather than
intent. Do not treat any UI claim in this file as final; HANDOVER.md wins
on conflict.

| Area                                            | API                                              | Notes                                                         |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Auth (register/login/verify/reset/2FA/sessions) | ✅ (via Auth.js in apps/web + packages/database) |                                                               |
| Multi-tenant workspaces + RBAC                  | ✅                                               | Tenant isolation covered by integration tests                 |
| Customers                                       | ✅                                               | CSV import/export not yet built                               |
| Products/services/tax rates                     | ✅                                               |                                                               |
| Quotes (full lifecycle)                         | ✅                                               |                                                               |
| Invoices (full state machine)                   | ✅                                               |                                                               |
| Payments — manual recording                     | ✅                                               |                                                               |
| Payments — Paystack/Flutterwave                 | ✅ (adapters + webhooks)                         | Needs real credentials to actually charge                     |
| Receipts + QR verification                      | ✅                                               |                                                               |
| PDF generation (3 templates)                    | ✅                                               | Non-embedded font — see ROADMAP.md                            |
| WhatsApp click-to-chat                          | ✅                                               | Works with zero credentials                                   |
| WhatsApp Meta Cloud API                         | ✅ (adapter)                                     | Inbound webhook route not mounted yet                         |
| Email (Resend + dev preview)                    | ✅                                               | Dev preview writes to `.dev-emails/`                          |
| Recurring invoices                              | ✅                                               |                                                               |
| Reminders                                       | ✅ (cron-driven)                                 |                                                               |
| Dashboard                                       | ✅                                               | Per-currency, no cross-currency summing                       |
| Reports                                         | ✅                                               |                                                               |
| Expenses                                        | ✅                                               |                                                               |
| Subscriptions/billing                           | ✅ (manual/admin)                                | Real recurring gateway billing not yet wired — see ROADMAP.md |
| Admin panel                                     | ✅                                               |                                                               |
| Notifications                                   | ✅                                               | Browser push scaffolded, not required                         |

## Explicit non-goals (see ROADMAP.md "Explicitly out of scope")

- Certified/double-entry accounting compliance.
- Real-time collaborative document editing.
- Multi-currency automatic conversion (each report is per-currency by
  design, to avoid silently wrong totals from an unconfigured exchange
  rate).

## Honesty commitments carried through this build

- No fake testimonials, customer counts, or revenue figures anywhere in
  the marketing site or documentation.
- Demo data is clearly flagged (`Workspace.isDemo`) and never mixed with
  real workspaces.
- AI-assisted content (optional Groq features) is always labeled
  AI-generated, always editable, never sent automatically, and never
  presented as tax/legal/accounting advice.
