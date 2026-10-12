# Test report

Run on 2026-10-12, Windows 11, Node 24, embedded PostgreSQL (UTF-8). Raw logs: `test-evidence/logs/`.

## Results (actually run)

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | no warnings or errors |
| API unit + integration | `npx vitest run` in `apps/api` | 19 files, **126/126 passed** (`api-full.txt`) |
| Shared unit | `npm run test --workspace=@sendnaro/shared` | 82/82 (last run before the final small edits) |
| Web production build | `next build` (clean profile, see SETUP.md) | passes (`static-and-build.txt`) |
| Browser E2E (Chromium) | `npm run test:e2e --workspace=@sendnaro/web` | full run: 24 passed, 3 failed (`e2e-full.txt`); the 3 failures were all in `admin-isolation` and timed out at login under load. Re-run alone: **4/4 passed** (`e2e-admin.txt`). Earlier full run on the previous code: 27/27. A single clean full-run pass has not been recorded for the final code. |

## What was real vs simulated

- Real: Express app over HTTP, PostgreSQL, outbox/worker code, signature checks, PDF generation, Next.js app in Chromium.
- Replaced only at the provider boundary: WhatsApp/Telegram sending (sandbox adapter or fixture transport) and the Paystack activation gateway.
- Merchant Paystack events (`sn-payment-events`): signed with a test key; no real Paystack traffic.

## NOT RUN (need credentials or approvals)

- Real WhatsApp Cloud API send, template approval, Meta callback (no Meta credentials provided).
- Real Telegram link and send (a bot token exists in `.env.staging`, but the user-tap live test was never confirmed under Sendnaro).
- Real Paystack test-mode checkout and webhook (no Paystack keys provided); Flutterwave likewise.
- Deployment under the Sendnaro name; the production Neon database has not had the new migrations applied.
- Production env vars to add before deploy: `OTP_HMAC_KEY`, `TELEGRAM_BOT_USERNAME`, plus the existing set (see ENVIRONMENT.md).
- Final logo, legal review, third-party security review.
- Cross-site rejection by the CSRF guard on `/api/proxy` and `/api/sandbox` has no dedicated test (normal same-origin flows are covered by E2E).
