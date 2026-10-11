# Marketplace Listing (draft)

Prepared for eventual listing on a platform like Flippa, TrustMRR, or
Acquire.com. **Every figure below that isn't explicitly "seeded example
data" or a technology fact is currently zero/none** — this is a freshly
built codebase with no live customers, no revenue, and no deployment yet.
Do not publish or represent otherwise. Replace the bracketed placeholders
once real information exists.

## Title

InvoiceTap — Invoicing & WhatsApp-first Payment Collection SaaS (source
code, pre-revenue)

## Short summary

A production-architected, multi-tenant SaaS codebase for creating
invoices/quotes/receipts, collecting payments online (Paystack/
Flutterwave), and reaching customers over WhatsApp — built for freelancers
and small businesses, with particular attention to African markets. Sold
as source code + infrastructure design; no existing customer base.

## Full description

InvoiceTap lets a freelancer or small business create a professional
invoice, share it over WhatsApp in one tap, and get paid online, all in
under a minute. The product targets a segment — African and
emerging-market small businesses that run their customer relationships
through WhatsApp — that mainstream invoicing tools (QuickBooks, FreshBooks)
under-serve; most competitors assume email-first communication and don't
integrate Paystack/Flutterwave, the payment rails that actually work in
these markets.

## Target customers

Freelancers, service providers, small retail/e-commerce sellers,
agencies, and accountants managing multiple client businesses — anywhere,
with above-average product-market fit signal expected in Nigeria, Ghana,
Kenya, and other markets where WhatsApp is the default business
communication channel.

## Problem solved

Existing invoicing tools are email-centric and don't reflect how small
businesses in WhatsApp-first markets actually talk to customers, and most
don't integrate local payment rails (Paystack, Flutterwave) at all.

## Features

See PRODUCT_REQUIREMENTS.md for the full checklist. Headline: full
quote→invoice→payment→receipt lifecycle, atomic per-workspace document
numbering, Paystack/Flutterwave payment adapters with idempotent webhook
processing, WhatsApp click-to-chat (zero-config) plus a prepared Meta
Cloud API adapter, three PDF templates, Resend email delivery with a
zero-config dev preview mode, recurring invoices, automated reminders, a
platform admin panel, and a tiered plan/quota system.

## Technology stack

TypeScript monorepo (npm workspaces): Next.js 15 + React 18 (frontend),
Express 4 (API), PostgreSQL via Prisma (Neon-compatible), Auth.js
(authentication), Tailwind CSS + Radix UI (design system), Vitest +
Supertest + Playwright (testing), Docker/Railway (API hosting), Vercel
(frontend hosting), Backblaze B2 (file storage), Resend (email). Full
architecture rationale: ARCHITECTURE.md.

## Revenue model

Four-tier subscription (Free/Starter/Business/Agency) — see
PRODUCT_REQUIREMENTS.md for indicative pricing. **Honest disclosure:
$0 in revenue, 0 paying customers, 0 signups as of this listing draft** —
pricing and plan limits are product-design decisions, not
market-validated numbers. A buyer should treat go-to-market and pricing
validation as their own work, not a proven asset of this listing.

## Operating costs (estimated, not yet incurred)

At near-zero usage: Neon free tier ($0), Vercel free/hobby tier ($0),
Railway (~$5-20/mo depending on usage), Backblaze B2 (~$0-5/mo at low
volume), Resend free tier (3,000 emails/mo free). Paystack/Flutterwave
charge per-transaction fees on successful payments only, no fixed cost.
Realistic bootstrap cost to keep this running for a small number of real
users: **under $30/month**. This estimate has not been validated against
real production traffic.

## Required third-party services

Neon, Vercel, Railway (or equivalent), Backblaze B2 (or any S3-compatible
storage), Resend, Paystack and/or Flutterwave, optionally Meta for
WhatsApp Cloud API, optionally Groq for AI-assist features, optionally
Sentry for error tracking. Full setup instructions: DEPLOYMENT.md.

## Installation / deployment overview

See SETUP.md (local development) and DEPLOYMENT.md (production). Summary:
clone → `npm install` → configure `.env` → `docker compose up -d` →
migrate/seed → `npm run dev`. Production: Vercel (web) + Railway (API,
Dockerfile provided) + Neon (database).

## Included assets

- Full source code (this repository), including tests and CI config.
- Database schema and migrations.
- Design system (Radix + Tailwind components).
- Documentation set (this file and its siblings — README through
  HANDOVER).
- **Not included**: any registered domain name, hosting accounts, social
  media accounts, existing customer data, or brand trademark registration
  — see DATA_ROOM_CHECKLIST.md for what a buyer should independently
  verify/acquire.

## Growth opportunities

- Real go-to-market in a WhatsApp-first market (currently zero marketing
  spend/activity).
- Recurring platform-subscription billing via Paystack/Flutterwave
  (payment _collection_ for invoices is built; recurring SaaS billing for
  InvoiceTap's own plans is still admin-driven — see ROADMAP.md).
- Native mobile app reusing the existing Express API.
- Accountant/agency multi-workspace tooling is scaffolded (the `AGENCY`
  plan, multi-workspace membership) but the differentiated UI for it is
  not yet built.

## Buyer handover plan

See HANDOVER.md for the full technical handover checklist (secrets
rotation, account transfer, what's built vs. not). At a high level: the
seller transfers GitHub repo ownership, rotates every secret the buyer
doesn't independently generate, and walks through DEPLOYMENT.md live with
the buyer once real infrastructure accounts exist.

## Suggested screenshot list (once a deployment exists)

1. Marketing homepage hero.
2. Dashboard with the demo workspace's seeded data.
3. Invoice creation form.
4. Public invoice view (customer-facing) with WhatsApp share button.
5. A generated PDF (Modern template).
6. Admin panel overview.

## Suggested demo-video script (2-3 minutes, once a deployment exists)

1. (0:00-0:20) Problem statement: WhatsApp-first small businesses, email
   tools don't fit.
2. (0:20-0:50) Create a customer, create an invoice, show the totals
   compute live.
3. (0:50-1:20) Issue the invoice, click WhatsApp share, show the
   pre-filled message + link.
4. (1:20-1:50) Open the public invoice link, click Pay, show the
   Paystack/Flutterwave checkout redirect (test mode).
5. (1:50-2:20) Webhook fires, invoice flips to Paid, receipt appears,
   download the PDF.
6. (2:20-2:40) Quick tour of the dashboard and reports.

## Areas still requiring real provider credentials

Every item in ENVIRONMENT.md marked "Secret? Yes" with no default —
practically: Resend, Backblaze B2, Paystack, Flutterwave, and optionally
Google OAuth / Meta WhatsApp / Groq / Sentry. The product is fully
demoable without any of them (dev email adapter, local storage adapter,
click-to-chat WhatsApp, and `npm run db:seed:demo` for sample data).

## Suggested buyer Q&A

**Does this have any users or revenue?** No — see the honest disclosure
above. This is a source-code and architecture asset, not a revenue asset.

**How much work is left before this could serve real customers?** The
backend/API is comprehensive and tested. HANDOVER.md lists the specific
frontend screens and integrations (recurring gateway billing, CSV
import/export, full E2E coverage) still needed before a production
launch.

**Is the code actually tested, or just claimed to be?** TESTING.md states
exactly what was executed and passing versus written-but-unexecuted at
the time of the build that produced this repository — re-run the test
suite yourself as part of due diligence; don't take either claim on
faith.

**What's the biggest technical risk?** Recurring platform-subscription
billing (charging workspaces for their InvoiceTap plan on a recurring
schedule) is not fully automated yet — see ROADMAP.md. Payment
_collection_ on customer invoices (the core product value) is fully
implemented and webhook-tested.
