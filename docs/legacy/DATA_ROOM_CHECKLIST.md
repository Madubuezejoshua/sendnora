# Data Room Checklist

For a future acquisition/due-diligence process. Each item states its
current status honestly — most are **not applicable yet** because this
product has not been operated or incorporated. Use this as the checklist
to fill in as the business matures, not as a claim that it's all done.

## Source code ownership

- [ ] Confirm sole ownership / no contributor CLA gaps (single-author
      build as of this version — verify your own commit history).
- [ ] GitHub repository transferred to buyer's organization (transfer
      procedure: Settings → Danger Zone → Transfer ownership).
- [x] No personal absolute file paths committed (repo is portable).
- [x] No secrets committed (`.env` gitignored everywhere; only
      `.env.example` templates with blank values are tracked).

## Domain

- [ ] Not yet registered. `sendnaro.com` used as a placeholder brand
      domain throughout the codebase (`packages/shared/src/branding.ts`)
      — update it there before registering/launching.

## Hosting

- [ ] No hosting accounts provisioned yet. See DEPLOYMENT.md for the
      intended Vercel + Railway + Neon topology.

## Database

- [ ] No production database provisioned. Schema and migrations are
      version-controlled (`packages/database/prisma/`).

## Storage

- [ ] No Backblaze B2 (or other) bucket provisioned yet.

## Analytics

- [ ] Not yet integrated. No analytics/tracking code exists in this
      build.

## Payment-provider records

- [ ] No live Paystack/Flutterwave accounts. Adapters are built and unit-
      tested against synthetic payloads (see TESTING.md) — no real
      transaction has been processed.

## Customer records

- [ ] None exist. The only data in this repository is seeded demo data
      (`Workspace.isDemo: true`), clearly separated from any real-data
      path — see DATABASE.md § Seeding.

## Revenue evidence

- [ ] None — $0 revenue, as stated in MARKETPLACE_LISTING.md.

## Expenses

- [ ] None incurred yet (no infrastructure has been provisioned).

## Licences

- [ ] Proprietary (see LICENSE). No open-source license has been applied
      to this codebase; it depends on many open-source packages under
      their own licenses (see "Dependency licences" below).

## Dependency licences

- [ ] Run `npx license-checker --summary` (not yet run/included in this
      repo) before a sale to produce a full dependency license inventory.
      All direct dependencies chosen for this build use permissive
      licenses (MIT/Apache-2.0/ISC) as of their `package.json` selection
      in this repo — verify transitively before relying on this.

## Intellectual property

- [ ] "Sendnaro" is a working name, not a registered trademark. Check
      availability before committing to it as a permanent brand — see
      HANDOVER.md's rebrand checklist for how cheaply the codebase can be
      renamed if it's not available.
- [ ] No design/logo trademark exists — `packages/shared/src/branding.ts`
      references placeholder logo file paths
      (`/brand/logo-light.svg` etc.) that do not yet have real artwork.

## Privacy / data obligations

- [ ] No real user data has been collected, so no GDPR/NDPR/CCPA
      obligations have yet been triggered. Privacy policy content exists
      as a template on the marketing site (apps/web) — have it reviewed
      by a lawyer in your jurisdiction before real signups begin; it was
      written as reasonable boilerplate, not by legal counsel.

## Brand assets

- [ ] No logo, favicon, or social-graphic artwork exists beyond
      placeholder references. Centralizing branding
      (`packages/shared/src/branding.ts` + `packages/ui`'s design tokens)
      was a deliberate architecture choice specifically so this is cheap
      to fill in later — see HANDOVER.md's rebrand checklist.

## Social accounts

- [ ] None created. `branding.ts` has empty social-handle fields.

## Support obligations

- [ ] None — no live customers to support yet.

## Transfer procedure

1. Transfer the GitHub repository (or provide a full clone + git history
   if not using GitHub transfer).
2. Rotate every secret in ENVIRONMENT.md that the seller generated —
   the buyer should never inherit a secret the seller has also seen.
   `APP_ENCRYPTION_KEY` rotation additionally requires re-encrypting any
   stored `PaymentProviderConfig` rows (none exist yet in a fresh
   deployment).
3. Transfer or re-provision hosting accounts (Vercel/Railway/Neon/B2/
   Resend/Paystack/Flutterwave) — whichever the buyer prefers, either
   account-transfer or fresh-account-plus-redeploy.
4. Walk the buyer through DEPLOYMENT.md live.

## Secrets rotation

See ENVIRONMENT.md — every row marked "Secret? Yes" should be rotated at
transfer time, not reused from the seller's values.

## Post-sale support

- [ ] Not yet defined — negotiate a specific handover-support window
      (e.g. "30 days of email support") as part of the sale terms; this
      repository does not itself commit to any support period.
