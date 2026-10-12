# Testing

Results of an actual run are in [TEST_REPORT.md](TEST_REPORT.md). This file explains how to run the suites.

## Layers

| Layer                                                                        | Where                                    | Needs                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Unit (money, tax, phone, state machines, signatures)                         | `packages/shared`, `apps/api/tests/unit` | nothing                                  |
| API integration (real Express app, real PostgreSQL, real outbox/worker code) | `apps/api/tests/integration`             | PostgreSQL                               |
| Browser E2E (Chromium)                                                       | `apps/web/e2e`                           | PostgreSQL, built web app; boots the API |

The API integration tests replace only the **provider boundary** (`setLiveProviderOverride`, the payment gateway transport) and use the sandbox
adapter. They run with `fileParallelism: false` because they share one database (billing tests change global settings).

## Commands

```bash
npm run typecheck && npm run lint
npm run test --workspace=@sendnaro/shared
npm run test --workspace=@sendnaro/api                    # ~4 minutes sequentially
npm run build --workspace=@sendnaro/web                   # E2E runs the production build
npm run test:e2e --workspace=@sendnaro/web                # boots API (WORKER_INLINE) + web
E2E_BASE_URL=https://staging.example npm run test:e2e --workspace=@sendnaro/web   # against a deployed site; fixtures write to DATABASE_URL
```

No other API process or worker may be running against the test database while the API suite runs: a second worker would claim
the suite's queued jobs and make timing-dependent assertions fail. (The browser suite, which starts its own API with an inline worker, must not
run at the same time as the API suite.)

Never point `DATABASE_URL` at production: the suites create and delete tenants, users and keys.

## What each API suite covers

`sn-invoices` (totals, numbering, snapshot, idempotency incl. concurrency, validation matrix, channels, isolation) · `sn-otp` (limits,
resend versioning, concurrency, isolation, no secrets) · `sn-telegram` (linking, tokens, webhook, tenant binding) · `sn-reliability` (retries,
throttling, ambiguity, crash recovery, receipts, callbacks, webhooks, SSRF) · `sn-billing` (billing off and on, gateway verification, forged
callbacks, quotes, revenue, refunds, complimentary, suspension) · `sn-auth-console` (keys, scopes, console endpoints, role checks) · `sn-pdf`
(text extraction of generated PDFs) · `sn-openapi` (routes and responses vs `openapi.yaml`) · `sn-payment-events` (signed merchant Paystack events: valid, duplicate, forged, no consent, isolation) · `sn-examples` (the published examples, including the
curl script, against a live HTTP server).

## Visual checks

`sn-pdf` writes `test-evidence/sandbox-receipt.pdf/.txt`; rasterize with `python -c "import pymupdf; pymupdf.open('test-evidence/sandbox-receipt.pdf')[0].get_pixmap(dpi=110).save('x.png')"`
and look at it for clipping. The E2E suite saves console screenshots to `test-evidence/screens/`.

## Live provider smoke checks

Not part of CI and not run in this repository. With real credentials and a designated, consenting test recipient: connect a sender in the console,
send an authentication template to your own number, confirm the Meta callback moves the delivery to `delivered`, and repeat for Telegram.
