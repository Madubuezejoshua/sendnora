import rateLimit from 'express-rate-limit';

/** General API traffic. */
export const standardRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Coarse per-IP backstop for the public API (per-key limits are enforced from Postgres in sendnaro/auth.ts). */
export const v1IpRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Public, unauthenticated document view endpoints — more permissive but still bounded. */
export const publicDocumentRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Payment webhooks — generous since providers may burst-retry, but still capped to blunt abuse. */
export const webhookRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Contact form / support submissions — tight, to deter spam. */
export const contactFormRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
