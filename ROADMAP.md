# Roadmap

This is a working roadmap, not a commitment — priorities should be
revisited against real user feedback once the product has actual users.

## Near-term (before first real users)

- [ ] Finish `apps/web` coverage for every settings screen described in
      PRODUCT_REQUIREMENTS.md (see HANDOVER.md for the current gap list).
- [x] Wire the Meta WhatsApp Cloud API webhook route.
- [ ] Expand Playwright E2E coverage to the full 18-scenario flow in
      TESTING.md.
- [x] CSV import/export for customers and products.
- [ ] Data export (workspace-level) for GDPR/portability requests.
- [ ] Real Paystack/Flutterwave _subscription_ billing (recurring SaaS
      plan charges) — the payment gateway adapters exist for one-off
      invoice payments; recurring platform billing is still manual/admin-
      driven (see billing.routes.ts).

## Mid-term

- [ ] Team activity feed / richer in-app notifications (push via
      web-push, VAPID scaffolding already present in env config).
- [ ] Multi-currency exchange-rate support for consolidated reporting
      (currently each report is per-currency by design — see
      dashboard.service.ts comments).
- [ ] White-label custom PDF templates for the AGENCY plan
      (`DocumentTemplate.configJson` field exists; the editor UI doesn't
      yet).
- [ ] Embed a Unicode font in the PDF renderer to restore currency
      symbols (₦, ₵, etc.) instead of ISO codes — see the note in
      `apps/api/src/services/pdf/document.tsx`.
- [ ] API keys / webhooks for third-party integrations (`ApiKey` model
      exists; issuance UI and outbound webhook delivery don't yet).

## Longer-term / exploratory

- [ ] Mobile app (native or PWA-first) reusing the same Express API.
- [ ] Bank-feed reconciliation for automatic payment matching.
- [ ] Multi-language UI (currently English-only; `Workspace.locale` is
      stored but not yet used to switch UI copy).
- [ ] Accountant-facing consolidated multi-workspace reporting for the
      AGENCY plan.

## Explicitly out of scope for now

- Full double-entry accounting / certified bookkeeping compliance — this
  product is positioned as invoicing + light expense tracking, not an
  accounting system (see the disclaimer in the Expenses section of
  PRODUCT_REQUIREMENTS.md).
- Real-time collaborative editing on documents.
