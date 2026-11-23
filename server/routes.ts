import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response, Router } from 'express';
import { z } from 'zod';
import {
  API_SCOPES,
  type ApiEnvironment,
  type ApiScope,
  assertSafeWebhookUrl,
  checkRateLimit,
  encryptSecret,
  generateApiKey,
  generateWebhookSecret,
  hashPassword,
  hashSha256,
  maskSecret,
  mintSessionToken,
  parseBearerApiKey,
  sanitizeDownloadFilename,
  sanitizeRelayPath,
  signWebhookPayload,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
  verifySessionToken,
  verifyTelegramSecret,
} from './security.ts';
import {
  CURRENCY_META,
  SANDBOX_SCENARIOS,
  WEBHOOK_EVENT_TYPES,
  formatMinorUnits,
  newId,
  store,
  verifyUserCredentials,
  type SessionRecord,
  type UserRecord,
} from './store.ts';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      sessionAuth?: { user: UserRecord; session: SessionRecord };
      apiKeyAuth?: {
        workspaceId: string;
        environment: ApiEnvironment;
        apiKeyId: string;
        scopes: ApiScope[];
      };
    }
  }
}

const E164_RE = /^\+[1-9]\d{6,14}$/;

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------

function requireSession(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } });
    return;
  }
  const payload = verifySessionToken(header.slice('Bearer '.length).trim());
  if (!payload) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Session invalid or expired' } });
    return;
  }
  const session = store.sessions.get(payload.sid);
  const user = store.users.get(payload.uid);
  if (!session || session.revokedAt || !user || session.userId !== user.id) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Session revoked or expired' } });
    return;
  }
  session.lastSeenAt = new Date().toISOString();
  req.sessionAuth = { user, session };
  next();
}

function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.sessionAuth?.user.isPlatformAdmin) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Platform administrator access required' } });
    return;
  }
  next();
}

function requireApiKey(scope: ApiScope | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseBearerApiKey(req.headers.authorization);
    if (!parsed) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Missing or malformed Bearer API key' },
      });
      return;
    }

    const digest = hashSha256(parsed.key);
    let matched = null;
    for (const k of store.apiKeys.values()) {
      if (k.hashedKey === digest) {
        matched = k;
        break;
      }
    }

    if (!matched || matched.revokedAt || matched.environment !== parsed.environment) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or revoked API key' } });
      return;
    }

    const ws = store.workspaces.get(matched.workspaceId);
    if (!ws) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Workspace not found' } });
      return;
    }
    if (ws.suspendedAt) {
      res.status(403).json({
        error: {
          code: 'BUSINESS_SUSPENDED',
          message: ws.suspendedReason || 'This business account is suspended',
        },
      });
      return;
    }

    if (scope && !matched.scopes.includes(scope)) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `This API key lacks the "${scope}" scope`,
        },
      });
      return;
    }

    const rate = checkRateLimit(`key:${matched.id}`, matched.rateLimitPerMinute, 60);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Per-key rate limit exceeded' },
      });
      return;
    }

    matched.lastUsedAt = new Date().toISOString();
    req.apiKeyAuth = {
      workspaceId: matched.workspaceId,
      environment: matched.environment,
      apiKeyId: matched.id,
      scopes: matched.scopes,
    };
    next();
  };
}

function ipRateLimit(bucketPrefix: string, limit: number, windowSeconds: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rate = checkRateLimit(`${bucketPrefix}:${req.ip || 'unknown'}`, limit, windowSeconds);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly' } });
      return;
    }
    next();
  };
}

// -----------------------------------------------------------------------------
// 1. Auth Router (/api/auth/*)
// -----------------------------------------------------------------------------

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  const header = req.headers.authorization;
  let currentUser: {
    id: string;
    email: string;
    name: string;
    isPlatformAdmin: boolean;
    workspaceId: string;
    workspaceName: string;
  } | null = null;

  if (header?.startsWith('Bearer ')) {
    const payload = verifySessionToken(header.slice('Bearer '.length).trim());
    if (payload) {
      const session = store.sessions.get(payload.sid);
      const user = store.users.get(payload.uid);
      if (session && !session.revokedAt && user) {
        const ws = store.workspaces.get(session.workspaceId);
        currentUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          isPlatformAdmin: user.isPlatformAdmin,
          workspaceId: session.workspaceId,
          workspaceName: ws?.displayName ?? 'Workspace',
        };
      }
    }
  }

  res.json({
    data: {
      authenticated: Boolean(currentUser),
      user: currentUser,
      adminClaimRequired: store.needsAdminClaim(),
    },
  });
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(80).default('Nigeria'),
  phone: z.string().trim().max(32).optional(),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS']).default('NGN'),
});

const COUNTRY_CODE_MAP: Record<string, string> = {
  Nigeria: 'NG',
  'United States': 'US',
  'United Kingdom': 'GB',
  Canada: 'CA',
};

authRouter.post('/register', ipRateLimit('auth_reg', 20, 60), (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid registration data' },
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  if (store.findUserByEmail(email)) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'An account with this email already exists' } });
    return;
  }

  const userId = newId('usr');
  const workspaceId = newId('ws');
  const now = new Date().toISOString();

  // Least privilege: self-registration NEVER grants platform admin
  const user: UserRecord = {
    id: userId,
    email,
    name: parsed.data.name,
    passwordHash: hashPassword(parsed.data.password),
    isPlatformAdmin: false,
    emailVerified: true,
    createdAt: now,
  };
  store.users.set(user.id, user);

  const countryCode = COUNTRY_CODE_MAP[parsed.data.country] ?? 'INTL';
  store.workspaces.set(workspaceId, {
    id: workspaceId,
    name: parsed.data.businessName,
    ownerUserId: userId,
    displayName: parsed.data.businessName,
    contactEmail: email,
    contactPhone: parsed.data.phone || undefined,
    country: parsed.data.country,
    countryCode,
    currency: parsed.data.currency,
    allowedLinkOrigins: [],
    createdAt: now,
  });

  // Auto-provision a starter sandbox key (returned once on signup)
  const generated = generateApiKey('SANDBOX');
  const starterKeyId = newId('key');
  store.apiKeys.set(starterKeyId, {
    id: starterKeyId,
    workspaceId,
    name: 'Default Sandbox Key',
    environment: 'SANDBOX',
    prefix: generated.prefix,
    lastFour: generated.lastFour,
    hashedKey: generated.hash,
    scopes: [...API_SCOPES],
    rateLimitPerMinute: 120,
    createdAt: now,
  });

  const session: SessionRecord = {
    id: newId('ses'),
    userId: user.id,
    workspaceId,
    userAgent: String(req.headers['user-agent'] || 'Browser').slice(0, 120),
    ip: req.ip || 'unknown',
    createdAt: now,
    lastSeenAt: now,
  };
  store.sessions.set(session.id, session);
  const token = mintSessionToken(session.id, user.id);

  store.writeAudit({
    workspaceId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'account.registered',
    entityType: 'Workspace',
    entityId: workspaceId,
    detail: `Created merchant business "${parsed.data.businessName}"`,
    ip: req.ip || 'unknown',
  });

  res.status(201).json({
    data: {
      token,
      starterSandboxKey: generated.key,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: false,
        workspaceId,
        workspaceName: parsed.data.businessName,
      },
    },
  });
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

authRouter.post('/login', ipRateLimit('auth_login', 30, 60), (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid email and password are required' } });
    return;
  }

  const user = verifyUserCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    const existing = store.findUserByEmail(parsed.data.email);
    if (existing) {
      store.loginEvents.unshift({
        id: newId('log'),
        userId: existing.id,
        success: false,
        reason: 'invalid_password',
        ip: req.ip || 'unknown',
        at: new Date().toISOString(),
      });
    }
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    return;
  }

  const ws = store.getWorkspaceForUser(user.id);
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: newId('ses'),
    userId: user.id,
    workspaceId: ws.id,
    userAgent: String(req.headers['user-agent'] || 'Browser').slice(0, 120),
    ip: req.ip || 'unknown',
    createdAt: now,
    lastSeenAt: now,
  };
  store.sessions.set(session.id, session);
  store.loginEvents.unshift({
    id: newId('log'),
    userId: user.id,
    success: true,
    ip: req.ip || 'unknown',
    at: now,
  });

  res.json({
    data: {
      token: mintSessionToken(session.id, user.id),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
        workspaceId: ws.id,
        workspaceName: ws.displayName,
      },
    },
  });
});

/**
 * First-Run Platform Admin Bootstrap / Claim Route:
 * Available ONLY when PLATFORM_ADMIN_PASSWORD is unset in process.env AND
 * no admin password has been claimed yet. Atomically hashes the chosen password
 * via scrypt and permanently locks the claim route once used.
 */
const claimAdminSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(10, 'Admin password must be at least 10 characters').max(128),
});

authRouter.post('/claim-admin', ipRateLimit('auth_claim', 10, 60), (req, res) => {
  if (!store.needsAdminClaim()) {
    res.status(403).json({
      error: {
        code: 'ALREADY_CLAIMED',
        message: 'Platform admin access is already configured. Sign in with your admin credentials.',
      },
    });
    return;
  }

  const parsed = claimAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid input' },
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const now = new Date().toISOString();
  const adminUser: UserRecord = {
    id: 'usr_platform_admin',
    email,
    name: 'Platform Administrator',
    passwordHash: hashPassword(parsed.data.password),
    isPlatformAdmin: true,
    emailVerified: true,
    createdAt: now,
  };
  store.users.set(adminUser.id, adminUser);
  store.adminEmail = email;
  store.adminClaimed = true;

  const adminWorkspace = store.ensureAdminWorkspace(adminUser);

  const session: SessionRecord = {
    id: newId('ses'),
    userId: adminUser.id,
    workspaceId: adminWorkspace.id,
    userAgent: String(req.headers['user-agent'] || 'Browser').slice(0, 120),
    ip: req.ip || 'unknown',
    createdAt: now,
    lastSeenAt: now,
  };
  store.sessions.set(session.id, session);

  store.writeAudit({
    workspaceId: adminWorkspace.id,
    actorUserId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'admin.claimed',
    entityType: 'User',
    entityId: adminUser.id,
    detail: 'Initial platform admin account claimed via one-time setup',
    ip: req.ip || 'unknown',
  });

  res.status(201).json({
    data: {
      token: mintSessionToken(session.id, adminUser.id),
      user: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        isPlatformAdmin: true,
        workspaceId: adminWorkspace.id,
        workspaceName: adminWorkspace.displayName,
      },
    },
  });
});

authRouter.post('/logout', requireSession, (req, res) => {
  req.sessionAuth!.session.revokedAt = new Date().toISOString();
  res.json({ data: { signedOut: true } });
});

authRouter.post('/logout-other-sessions', requireSession, (req, res) => {
  const { user, session } = req.sessionAuth!;
  let revoked = 0;
  for (const s of store.sessions.values()) {
    if (s.userId === user.id && s.id !== session.id && !s.revokedAt) {
      s.revokedAt = new Date().toISOString();
      revoked += 1;
    }
  }
  res.json({ data: { revoked } });
});

// -----------------------------------------------------------------------------
// 2. Public Storefront & Token-Scoped Document Router (/api/public/*)
// -----------------------------------------------------------------------------

export const publicRouter = Router();
publicRouter.use(ipRateLimit('public', 120, 60));

publicRouter.get('/platform', (_req, res) => {
  const s = store.billingSettings;
  res.json({
    data: {
      billingRequired: s.billingRequired,
      activationPrice: s.billingRequired
        ? { amountMinor: s.activationPriceMinor, currency: s.activationCurrency }
        : null,
      configuredPrice: { amountMinor: s.activationPriceMinor, currency: s.activationCurrency },
    },
  });
});

publicRouter.get('/invoices/:token', (req, res) => {
  const token = String(req.params.token || '');
  let found = null;
  for (const inv of store.invoices.values()) {
    if (inv.publicToken === token) {
      found = inv;
      break;
    }
  }
  if (!found) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Receipt not found' } });
    return;
  }
  const ws = store.workspaces.get(found.workspaceId);
  res.json({
    data: {
      invoiceNumber: found.invoiceNumber,
      reference: found.reference,
      businessName: ws?.displayName ?? 'Merchant',
      businessEmail: ws?.contactEmail,
      customerName: found.customerName,
      currency: found.currency,
      items: found.items,
      subtotalMinor: found.subtotalMinor,
      taxMinor: found.taxMinor,
      discountMinor: found.discountMinor,
      totalMinor: found.totalMinor,
      status: found.status,
      notes: found.notes,
      createdAt: found.createdAt,
      environment: found.environment.toLowerCase(),
    },
  });
});

/**
 * FIX: Hardened receipt download with sanitized Content-Disposition header
 * and X-Content-Type-Options: nosniff (prevents header injection & MIME sniffing).
 */
publicRouter.get('/invoices/:token/download', (req, res) => {
  const token = String(req.params.token || '');
  let found = null;
  for (const inv of store.invoices.values()) {
    if (inv.publicToken === token) {
      found = inv;
      break;
    }
  }
  if (!found) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Receipt not found' } });
    return;
  }
  const ws = store.workspaces.get(found.workspaceId);
  const safeFilename = sanitizeDownloadFilename(`${found.invoiceNumber}.txt`);
  const lines = [
    `SENDNARO VERIFIED RECEIPT`,
    `==============================================`,
    `Business:   ${ws?.displayName ?? 'Merchant'}`,
    `Receipt #:  ${found.invoiceNumber}`,
    `Reference:  ${found.reference}`,
    `Date:       ${found.createdAt}`,
    `Customer:   ${found.customerName}`,
    `Status:     ${found.status} (${found.environment})`,
    `----------------------------------------------`,
    ...found.items.map(
      (i) =>
        `${i.description} (x${i.quantity})  —  ${formatMinorUnits(i.lineTotalMinor, found.currency)}`,
    ),
    `----------------------------------------------`,
    `Subtotal:   ${formatMinorUnits(found.subtotalMinor, found.currency)}`,
    `Discount:   ${formatMinorUnits(found.discountMinor, found.currency)}`,
    `Tax:        ${formatMinorUnits(found.taxMinor, found.currency)}`,
    `TOTAL PAID: ${formatMinorUnits(found.totalMinor, found.currency)}`,
    found.notes ? `\nNotes: ${found.notes}` : '',
  ].filter(Boolean);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(lines.join('\n'));
});

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  category: z.enum(['General', 'Integration', 'Billing', 'Security']).default('General'),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(10).max(5000),
});

publicRouter.post('/contact', ipRateLimit('contact', 10, 60), (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid form fields' },
    });
    return;
  }
  const submission = {
    id: newId('msg'),
    ...parsed.data,
    createdAt: new Date().toISOString(),
  };
  store.contactSubmissions.unshift(submission);
  res.status(201).json({ data: { id: submission.id, received: true } });
});

// -----------------------------------------------------------------------------
// 3. Public API v1 Router (/api/v1/*)
// -----------------------------------------------------------------------------

export const apiV1Router = Router();
apiV1Router.use(ipRateLimit('v1_ip', 300, 60));

/**
 * Inbound Provider Webhooks (Mounted BEFORE API-key auth)
 * FIXES:
 * 1) Fail-closed when verify token is unset
 * 2) Constant-time comparison with timingSafeEqual
 * 3) text/plain + X-Content-Type-Options: nosniff on challenge echo (blocks Reflected XSS)
 */
apiV1Router.get('/webhooks/whatsapp', (req, res) => {
  const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : undefined;
  const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : undefined;
  const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : '';

  if (!verifyMetaWebhookChallenge(process.env.META_WHATSAPP_VERIFY_TOKEN, mode, token)) {
    res.status(403).end();
    return;
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(challenge);
});

apiV1Router.post(
  '/webhooks/whatsapp',
  express.raw({ type: '*/*', limit: '1mb' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifyMetaSignature(process.env.META_WHATSAPP_APP_SECRET, rawBody, sig)) {
      res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Signature check failed' } });
      return;
    }
    res.status(200).json({ received: true });
  },
);

apiV1Router.post('/webhooks/telegram', (req, res) => {
  const header = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  if (!verifyTelegramSecret(process.env.TELEGRAM_WEBHOOK_SECRET, header)) {
    res.status(401).end();
    return;
  }
  res.status(200).json({ ok: true });
});

// ----- Invoices -----

const createInvoiceSchema = z.object({
  reference: z.string().trim().min(1).max(80),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS']).default('NGN'),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(E164_RE, 'Phone must be in E.164 format (e.g. +2348012345678)').optional(),
    email: z.string().email().optional(),
    external_customer_id: z.string().trim().min(1).max(80).optional(),
  }),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        quantity: z.number().int().min(1).max(10000),
        unit_price_minor: z.number().int().min(0).max(10_000_000_000),
      }),
    )
    .min(1)
    .max(50),
  tax_rate_bps: z.number().int().min(0).max(5000).optional(),
  discount_minor: z.number().int().min(0).optional(),
  channels: z.array(z.enum(['whatsapp', 'telegram'])).min(1).max(2).default(['whatsapp']),
  notes: z.string().max(400).optional(),
  scenario: z.enum(SANDBOX_SCENARIOS).optional(),
});

apiV1Router.post('/invoices', requireApiKey('invoices:create'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const gate = store.canSendInEnvironment(ctx.workspaceId, ctx.environment);
  if (!gate.ok) {
    res.status(403).json({ error: { code: gate.code, message: gate.reason, request_id: req.requestId } });
    return;
  }

  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Invalid invoice payload',
        request_id: req.requestId,
      },
    });
    return;
  }

  if (ctx.environment === 'LIVE' && parsed.data.scenario) {
    res.status(422).json({
      error: { code: 'SANDBOX_ONLY', message: 'scenario is only permitted with sandbox API keys' },
    });
    return;
  }

  if (parsed.data.channels.includes('whatsapp') && !parsed.data.customer.phone) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'customer.phone (E.164) is required for WhatsApp delivery' },
    });
    return;
  }

  const idemHeader = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : undefined;
  const idem = store.checkIdempotency(ctx.workspaceId, ctx.environment, 'invoices.create', idemHeader, parsed.data);
  if (idem.hit) {
    res.status(idem.status).json(idem.body);
    return;
  }
  if (idem.conflict) {
    res.status(409).json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: idem.conflict } });
    return;
  }

  try {
    const body = store.createInvoice(ctx.workspaceId, ctx.environment, req.requestId || '', parsed.data);
    store.saveIdempotency(idem.storeKey, idem.requestHash, 202, body);
    res.status(202).json(body);
  } catch (err) {
    res.status(422).json({
      error: { code: 'UNPROCESSABLE', message: err instanceof Error ? err.message : 'Unable to create invoice' },
    });
  }
});

apiV1Router.get('/invoices/:invoiceId', requireApiKey('invoices:read'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const inv = store.invoices.get(String(req.params.invoiceId));
  if (!inv || inv.workspaceId !== ctx.workspaceId || inv.environment !== ctx.environment) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    return;
  }
  res.json({
    id: inv.publicId,
    object: 'invoice',
    invoice_number: inv.invoiceNumber,
    reference: inv.reference,
    currency: inv.currency,
    total_minor: inv.totalMinor,
    receipt_url: `/receipt/${inv.publicToken}`,
    created_at: inv.createdAt,
    request_id: req.requestId,
  });
});

// ----- OTP -----

const createOtpSchema = z.object({
  phone: z.string().regex(E164_RE, 'phone must be in E.164 format (e.g. +2348012345678)'),
  purpose: z.enum(['login', 'signup', 'checkout', 'password_reset', 'payout']).default('login'),
  length: z.number().int().min(4).max(8).default(6),
  ttl_seconds: z.number().int().min(60).max(900).default(300),
  scenario: z.enum(SANDBOX_SCENARIOS).optional(),
});

apiV1Router.post('/otp/challenges', requireApiKey('otp:create'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const gate = store.canSendInEnvironment(ctx.workspaceId, ctx.environment);
  if (!gate.ok) {
    res.status(403).json({ error: { code: gate.code, message: gate.reason } });
    return;
  }
  const parsed = createOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid OTP request' },
    });
    return;
  }
  if (ctx.environment === 'LIVE' && parsed.data.scenario) {
    res.status(422).json({
      error: { code: 'SANDBOX_ONLY', message: 'scenario is only permitted with sandbox keys' },
    });
    return;
  }

  const body = store.createOtpChallenge(ctx.workspaceId, ctx.environment, req.requestId || '', parsed.data);
  res.status(202).json(body);
});

apiV1Router.post('/otp/challenges/:challengeId/resend', requireApiKey('otp:create'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const r = store.resendOtpChallenge(
    ctx.workspaceId,
    ctx.environment,
    String(req.params.challengeId),
    req.requestId || '',
  );
  res.status(r.status).json(r.body);
});

apiV1Router.post('/otp/challenges/:challengeId/verify', requireApiKey('otp:verify'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const parsed = z.object({ code: z.string().trim().min(4).max(8) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'code is required' } });
    return;
  }
  const r = store.verifyOtpChallenge(
    ctx.workspaceId,
    ctx.environment,
    String(req.params.challengeId),
    parsed.data.code,
    req.requestId || '',
  );
  res.status(r.status).json(r.body);
});

// ----- Notifications -----

const createNotificationSchema = z.object({
  type: z.enum(['order_confirmation', 'payment_confirmation', 'shipping_update', 'general_update']),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(E164_RE).optional(),
    external_customer_id: z.string().trim().min(1).max(80).optional(),
  }),
  fields: z.object({
    order_id: z.string().max(60).optional(),
    message: z.string().trim().min(1).max(300, 'Notification message is capped at 300 characters'),
  }),
  link: z
    .object({
      label: z.string().trim().min(1).max(60),
      url: z.string().url(),
    })
    .optional(),
  channels: z.array(z.enum(['whatsapp', 'telegram'])).min(1).max(2).default(['whatsapp']),
  scenario: z.enum(SANDBOX_SCENARIOS).optional(),
});

apiV1Router.post('/notifications', requireApiKey('notifications:send'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const gate = store.canSendInEnvironment(ctx.workspaceId, ctx.environment);
  if (!gate.ok) {
    res.status(403).json({ error: { code: gate.code, message: gate.reason } });
    return;
  }
  const parsed = createNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid notification' },
    });
    return;
  }
  if (ctx.environment === 'LIVE' && parsed.data.scenario) {
    res.status(422).json({
      error: { code: 'SANDBOX_ONLY', message: 'scenario is only permitted with sandbox keys' },
    });
    return;
  }
  try {
    const body = store.createNotification(ctx.workspaceId, ctx.environment, req.requestId || '', parsed.data);
    res.status(202).json(body);
  } catch (err) {
    res.status(422).json({
      error: { code: 'LINK_NOT_ALLOWED', message: err instanceof Error ? err.message : 'Notification blocked' },
    });
  }
});

// ----- Deliveries -----

apiV1Router.get('/deliveries/:deliveryId', requireApiKey('deliveries:read'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const del = store.deliveries.get(String(req.params.deliveryId));
  if (!del || del.workspaceId !== ctx.workspaceId || del.environment !== ctx.environment) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Delivery not found' } });
    return;
  }
  res.json({ ...store.presentDelivery(del), request_id: req.requestId });
});

// ----- Telegram Linking -----

apiV1Router.post('/telegram/link-tokens', requireApiKey('telegram:link'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const parsed = z
    .object({
      external_customer_id: z.string().trim().min(1).max(80),
      customer_name: z.string().trim().max(120).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'external_customer_id is required' } });
    return;
  }
  const data = store.createTelegramLinkToken(
    ctx.workspaceId,
    ctx.environment,
    parsed.data.external_customer_id,
    parsed.data.customer_name,
    req.requestId || '',
  );
  res.status(201).json(data);
});

apiV1Router.delete('/telegram/links/:externalCustomerId', requireApiKey('telegram:link'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  const removed = store.unlinkTelegramCustomer(
    ctx.workspaceId,
    ctx.environment,
    String(req.params.externalCustomerId),
  );
  res.json({ unlinked: removed, request_id: req.requestId });
});

// ----- Sandbox Helpers (Strictly Sandbox Keys Only) -----

apiV1Router.get('/sandbox/otp-inbox', requireApiKey('otp:create'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  if (ctx.environment !== 'SANDBOX') {
    res.status(403).json({
      error: { code: 'SANDBOX_ONLY', message: 'OTP inbox is only available for sandbox keys' },
    });
    return;
  }
  const phoneFilter = typeof req.query.phone === 'string' ? req.query.phone.trim() : undefined;
  const entries = store.sandboxOtpInbox.filter(
    (e) => e.workspaceId === ctx.workspaceId && (!phoneFilter || e.phone === phoneFilter),
  );
  res.json({ object: 'list', data: entries.slice(0, 15), request_id: req.requestId });
});

apiV1Router.post('/sandbox/telegram/start', requireApiKey('telegram:link'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  if (ctx.environment !== 'SANDBOX') {
    res.status(403).json({
      error: { code: 'SANDBOX_ONLY', message: 'Telegram start simulator is sandbox-only' },
    });
    return;
  }
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const chatId =
    typeof req.body?.chat_id === 'string' && req.body.chat_id.trim()
      ? req.body.chat_id.trim().slice(0, 64)
      : `sandbox_chat_${Date.now()}`;
  if (!token) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'token is required' } });
    return;
  }
  const result = store.consumeTelegramLinkToken(ctx.workspaceId, 'SANDBOX', token, chatId);
  if (!result.ok) {
    res.status(422).json({ error: { code: 'UNPROCESSABLE', message: `Link token rejected: ${result.reason}` } });
    return;
  }
  res.json({ linked: true, link: result.link, request_id: req.requestId });
});

apiV1Router.post('/sandbox/process-queue', requireApiKey('deliveries:read'), (req, res) => {
  const ctx = req.apiKeyAuth!;
  if (ctx.environment !== 'SANDBOX') {
    res.status(403).json({
      error: { code: 'SANDBOX_ONLY', message: 'On-demand queue processing is sandbox-only' },
    });
    return;
  }
  const fastForward = Boolean(req.body?.fast_forward);
  const processed = store.processOutbox(ctx.workspaceId, 'SANDBOX', fastForward);
  res.json({ object: 'queue_run', processed, request_id: req.requestId });
});

// -----------------------------------------------------------------------------
// 4. Hardened Browser Sandbox Relay (/api/sandbox/*)
// FIX: Validates session, enforces sn_test_ keys ONLY, and sanitizes path segments
// against traversal (`..`) and strict endpoint allowlist.
// -----------------------------------------------------------------------------

const SANDBOX_ALLOWED_PATH =
  /^(invoices(\/[A-Za-z0-9_-]+)?|otp\/challenges(\/[A-Za-z0-9_-]+\/(verify|resend))?|notifications|deliveries\/[A-Za-z0-9_-]+|telegram\/link-tokens|telegram\/links\/[A-Za-z0-9_.-]+|sandbox\/(otp-inbox|telegram\/start|process-queue))$/;

export const sandboxRelayRouter = Router();

sandboxRelayRouter.use(requireSession, (req, res, next) => {
  const sandboxKey = String(req.headers['x-sandbox-key'] || '').trim();
  if (!sandboxKey.startsWith('sn_test_')) {
    res.status(403).json({
      error: {
        code: 'SANDBOX_KEY_REQUIRED',
        message: 'The browser playground only accepts sandbox keys (sn_test_…). Live keys are blocked in the browser.',
      },
    });
    return;
  }

  const safePath = sanitizeRelayPath(req.path, SANDBOX_ALLOWED_PATH);
  if (!safePath) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Endpoint not allowed in sandbox relay' },
    });
    return;
  }

  // Forward internally to apiV1Router by rewriting URL & Authorization header
  req.url = `/${safePath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  req.headers.authorization = `Bearer ${sandboxKey}`;
  apiV1Router(req, res, next);
});

// -----------------------------------------------------------------------------
// 5. Console Router (/api/console/*)
// -----------------------------------------------------------------------------

export const consoleRouter = Router();
consoleRouter.use(requireSession);

consoleRouter.get('/overview', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const ws = store.workspaces.get(session.workspaceId)!;
  const keys = [...store.apiKeys.values()].filter(
    (k) => k.workspaceId === ws.id && !k.revokedAt,
  );
  const deliveries = [...store.deliveries.values()].filter((d) => d.workspaceId === ws.id);
  const webhooks = [...store.webhookEndpoints.values()].filter((w) => w.workspaceId === ws.id);
  const channels = [...store.channelConnections.values()].filter((c) => c.workspaceId === ws.id);
  const activation = store.getActivationState(ws.id);

  const deliveredCount = deliveries.filter((d) => d.status === 'DELIVERED').length;
  const failedCount = deliveries.filter((d) => d.status === 'FAILED' || d.status === 'BLOCKED').length;
  const queuedCount = deliveries.filter((d) => d.status === 'QUEUED' || d.status === 'SENT').length;

  res.json({
    data: {
      business: {
        id: ws.id,
        name: ws.displayName,
        contactEmail: ws.contactEmail,
        currency: ws.currency,
        suspendedAt: ws.suspendedAt,
        suspendedReason: ws.suspendedReason,
      },
      role: user.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'WORKSPACE_OWNER',
      metrics: {
        totalDeliveries: deliveries.length,
        deliveredCount,
        failedCount,
        queuedCount,
        activeKeys: keys.length,
        webhookEndpoints: webhooks.length,
      },
      activation,
      checklist: [
        {
          id: 'profile',
          label: 'Complete business profile & allowed link origins',
          done: Boolean(ws.displayName && ws.contactEmail),
        },
        {
          id: 'sandbox_key',
          label: 'Create a scoped sandbox API key (sn_test_)',
          done: keys.some((k) => k.environment === 'SANDBOX'),
        },
        {
          id: 'first_request',
          label: 'Run a verified sandbox delivery',
          done: deliveries.some((d) => d.environment === 'SANDBOX'),
        },
        {
          id: 'webhooks',
          label: 'Register a signed HTTPS webhook endpoint',
          done: webhooks.length > 0,
        },
        {
          id: 'channels',
          label: 'Connect live WhatsApp or Telegram sender',
          done: channels.some((c) => c.status === 'CONNECTED'),
        },
      ],
    },
  });
});

// ----- API Keys -----

consoleRouter.get('/keys', (req, res) => {
  const wsId = req.sessionAuth!.session.workspaceId;
  const keys = [...store.apiKeys.values()]
    .filter((k) => k.workspaceId === wsId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((k) => ({
      id: k.id,
      name: k.name,
      environment: k.environment.toLowerCase(),
      prefix: k.prefix,
      lastFour: k.lastFour,
      scopes: k.scopes,
      rateLimitPerMinute: k.rateLimitPerMinute,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    }));
  res.json({ data: { keys, availableScopes: API_SCOPES } });
});

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  environment: z.enum(['sandbox', 'live']),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  rateLimitPerMinute: z.number().int().min(10).max(600).default(120),
});

consoleRouter.post('/keys', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid key configuration' },
    });
    return;
  }
  const env: ApiEnvironment = parsed.data.environment === 'live' ? 'LIVE' : 'SANDBOX';
  if (env === 'LIVE') {
    const gate = store.canSendInEnvironment(session.workspaceId, 'LIVE');
    if (!gate.ok) {
      res.status(403).json({ error: { code: gate.code, message: gate.reason } });
      return;
    }
  }

  const generated = generateApiKey(env);
  const record = {
    id: newId('key'),
    workspaceId: session.workspaceId,
    name: parsed.data.name,
    environment: env,
    prefix: generated.prefix,
    lastFour: generated.lastFour,
    hashedKey: generated.hash,
    scopes: parsed.data.scopes,
    rateLimitPerMinute: parsed.data.rateLimitPerMinute,
    createdAt: new Date().toISOString(),
  };
  store.apiKeys.set(record.id, record);
  store.writeAudit({
    workspaceId: session.workspaceId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'key.created',
    entityType: 'ApiKey',
    entityId: record.id,
    detail: `Created ${env.toLowerCase()} key "${record.name}" (${record.prefix}…${record.lastFour})`,
    ip: req.ip || 'unknown',
  });

  res.status(201).json({
    data: {
      id: record.id,
      name: record.name,
      environment: env.toLowerCase(),
      prefix: record.prefix,
      lastFour: record.lastFour,
      scopes: record.scopes,
      rateLimitPerMinute: record.rateLimitPerMinute,
      createdAt: record.createdAt,
      secretKey: generated.key, // Returned ONCE only; never stored in plaintext
    },
  });
});

consoleRouter.delete('/keys/:keyId', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const key = store.apiKeys.get(String(req.params.keyId));
  if (!key || key.workspaceId !== session.workspaceId) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
    return;
  }
  if (!key.revokedAt) {
    key.revokedAt = new Date().toISOString();
    store.writeAudit({
      workspaceId: session.workspaceId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'key.revoked',
      entityType: 'ApiKey',
      entityId: key.id,
      detail: `Revoked key "${key.name}" (${key.prefix}…${key.lastFour})`,
      ip: req.ip || 'unknown',
    });
  }
  res.json({ data: { revoked: true } });
});

// ----- Deliveries -----

consoleRouter.get('/deliveries', (req, res) => {
  const wsId = req.sessionAuth!.session.workspaceId;
  const envFilter = typeof req.query.environment === 'string' ? req.query.environment.toUpperCase() : '';
  const channelFilter = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  const rows = [...store.deliveries.values()]
    .filter((d) => d.workspaceId === wsId)
    .filter((d) => !envFilter || envFilter === 'ALL' || d.environment === envFilter)
    .filter((d) => !channelFilter || channelFilter === 'ALL' || d.channel === channelFilter)
    .filter((d) => !statusFilter || statusFilter === 'ALL' || d.status === statusFilter)
    .filter(
      (d) =>
        !search ||
        d.publicId.toLowerCase().includes(search) ||
        d.recipientLabel.toLowerCase().includes(search) ||
        d.messagePreview.toLowerCase().includes(search),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map((d) => store.presentDelivery(d));

  res.json({ data: rows });
});

// ----- Settings (Business, Channels, Webhooks, Security) -----

consoleRouter.get('/settings', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const ws = store.workspaces.get(session.workspaceId)!;
  const channels = [...store.channelConnections.values()]
    .filter((c) => c.workspaceId === ws.id)
    .map((c) => ({
      id: c.id,
      channel: c.channel.toLowerCase(),
      environment: c.environment.toLowerCase(),
      status: c.status.toLowerCase(),
      displayLabel: c.displayLabel,
      config: c.config,
      secretMask: c.secretMask,
      updatedAt: c.updatedAt,
    }));
  const webhooks = [...store.webhookEndpoints.values()]
    .filter((w) => w.workspaceId === ws.id)
    .map((w) => ({
      id: w.id,
      environment: w.environment.toLowerCase(),
      url: w.url,
      events: w.events,
      active: w.active,
      secretMask: w.secretMask,
      createdAt: w.createdAt,
      lastDeliveredAt: w.lastDeliveredAt,
      lastStatus: w.lastStatus,
    }));
  const webhookLogs = store.webhookLogs.filter((l) => l.workspaceId === ws.id).slice(0, 20);
  const telegramLinks = store.telegramLinks.filter((l) => l.workspaceId === ws.id);
  const activeSessions = [...store.sessions.values()]
    .filter((s) => s.userId === user.id && !s.revokedAt)
    .map((s) => ({
      id: s.id,
      current: s.id === session.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
    }));
  const loginHistory = store.loginEvents.filter((e) => e.userId === user.id).slice(0, 15);

  res.json({
    data: {
      business: {
        displayName: ws.displayName,
        contactEmail: ws.contactEmail,
        countryCode: ws.countryCode,
        currency: ws.currency,
        allowedLinkOrigins: ws.allowedLinkOrigins,
      },
      channels,
      webhooks,
      webhookLogs,
      availableWebhookEvents: WEBHOOK_EVENT_TYPES,
      telegramLinks,
      security: {
        activeSessions,
        loginHistory,
      },
    },
  });
});

const businessPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().email().max(160),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS']),
  allowedLinkOrigins: z.array(z.string().trim().min(3).max(120)).max(20),
});

consoleRouter.patch('/settings/business', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const parsed = businessPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid business profile' },
    });
    return;
  }
  const ws = store.workspaces.get(session.workspaceId)!;
  ws.displayName = parsed.data.displayName;
  ws.name = parsed.data.displayName;
  ws.contactEmail = parsed.data.contactEmail;
  ws.currency = parsed.data.currency;
  ws.allowedLinkOrigins = parsed.data.allowedLinkOrigins.map((h) =>
    h.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase(),
  );

  store.writeAudit({
    workspaceId: ws.id,
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'business.profile_updated',
    entityType: 'Workspace',
    entityId: ws.id,
    detail: `Updated business profile (${ws.displayName}) and ${ws.allowedLinkOrigins.length} allowed link origin(s)`,
    ip: req.ip || 'unknown',
  });
  res.json({ data: { updated: true } });
});

const channelSchema = z.object({
  channel: z.enum(['whatsapp', 'telegram']),
  environment: z.enum(['sandbox', 'live']).default('live'),
  displayLabel: z.string().trim().min(2).max(80),
  phoneNumberId: z.string().trim().max(80).optional(),
  botUsername: z.string().trim().max(80).optional(),
  secretToken: z.string().trim().min(8, 'Credential must be at least 8 characters').max(512),
});

consoleRouter.put('/settings/channels', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid channel config' },
    });
    return;
  }

  const channelKey = parsed.data.channel.toUpperCase() as 'WHATSAPP' | 'TELEGRAM';
  const envKey = parsed.data.environment.toUpperCase() as ApiEnvironment;
  const connId = `${session.workspaceId}_${channelKey}_${envKey}`;

  // Encrypt provider secret using AES-256-GCM before storage
  const encrypted = encryptSecret(parsed.data.secretToken);
  const masked = maskSecret(parsed.data.secretToken);

  store.channelConnections.set(connId, {
    id: connId,
    workspaceId: session.workspaceId,
    channel: channelKey,
    environment: envKey,
    status: 'CONNECTED',
    displayLabel: parsed.data.displayLabel,
    config: {
      ...(parsed.data.phoneNumberId ? { phoneNumberId: parsed.data.phoneNumberId } : {}),
      ...(parsed.data.botUsername ? { botUsername: parsed.data.botUsername } : {}),
    },
    secretCiphertext: encrypted,
    secretMask: masked,
    updatedAt: new Date().toISOString(),
  });

  store.writeAudit({
    workspaceId: session.workspaceId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'channel.connected',
    entityType: 'ChannelConnection',
    entityId: connId,
    detail: `Encrypted and saved ${channelKey.toLowerCase()} credentials (${masked})`,
    ip: req.ip || 'unknown',
  });

  res.json({ data: { connected: true, secretMask: masked } });
});

const webhookCreateSchema = z.object({
  url: z.string().trim().url(),
  environment: z.enum(['sandbox', 'live']).default('sandbox'),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

consoleRouter.post('/settings/webhooks', async (req, res) => {
  const { session, user } = req.sessionAuth!;
  const parsed = webhookCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid webhook endpoint' },
    });
    return;
  }

  const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true';
  try {
    await assertSafeWebhookUrl(parsed.data.url, allowLocal);
  } catch (err) {
    res.status(422).json({
      error: { code: 'SSRF_BLOCKED', message: err instanceof Error ? err.message : 'Unsafe webhook URL rejected' },
    });
    return;
  }

  const secret = generateWebhookSecret();
  const id = newId('wh');
  store.webhookEndpoints.set(id, {
    id,
    workspaceId: session.workspaceId,
    environment: parsed.data.environment.toUpperCase() as ApiEnvironment,
    url: parsed.data.url,
    events: parsed.data.events,
    active: true,
    secretCiphertext: encryptSecret(secret),
    secretMask: maskSecret(secret),
    createdAt: new Date().toISOString(),
  });

  store.writeAudit({
    workspaceId: session.workspaceId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'webhook.created',
    entityType: 'WebhookEndpoint',
    entityId: id,
    detail: `Registered SSRF-vetted webhook endpoint ${parsed.data.url}`,
    ip: req.ip || 'unknown',
  });

  res.status(201).json({
    data: {
      id,
      url: parsed.data.url,
      events: parsed.data.events,
      signingSecret: secret, // Shown ONCE only
    },
  });
});

consoleRouter.delete('/settings/webhooks/:webhookId', (req, res) => {
  const { session } = req.sessionAuth!;
  const ep = store.webhookEndpoints.get(String(req.params.webhookId));
  if (!ep || ep.workspaceId !== session.workspaceId) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found' } });
    return;
  }
  store.webhookEndpoints.delete(ep.id);
  res.json({ data: { deleted: true } });
});

consoleRouter.post('/settings/webhooks/:webhookId/test', (req, res) => {
  const { session } = req.sessionAuth!;
  const ep = store.webhookEndpoints.get(String(req.params.webhookId));
  if (!ep || ep.workspaceId !== session.workspaceId) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found' } });
    return;
  }
  const payload = JSON.stringify({
    id: newId('evt'),
    type: 'webhook.test',
    environment: ep.environment.toLowerCase(),
    created_at: new Date().toISOString(),
    data: { message: 'Signed test event from Sendnaro Console' },
  });
  const sig = signWebhookPayload(`test_${ep.id}`, payload);
  const now = new Date().toISOString();
  ep.lastDeliveredAt = now;
  ep.lastStatus = 200;
  store.webhookLogs.unshift({
    id: newId('whd'),
    endpointId: ep.id,
    workspaceId: session.workspaceId,
    eventType: 'webhook.test',
    signatureHeader: sig,
    payloadPreview: payload,
    status: 200,
    simulated: true,
    at: now,
  });
  res.json({ data: { dispatched: true, signatureHeader: sig } });
});

// ----- Activation -----

consoleRouter.get('/activation', (req, res) => {
  const wsId = req.sessionAuth!.session.workspaceId;
  const state = store.getActivationState(wsId);
  const payments = store.activationPayments
    .filter((p) => p.workspaceId === wsId)
    .map((p) => ({
      id: p.id,
      reference: p.reference,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.livemode ? 'VERIFIED' : 'PENDING',
      createdAt: p.createdAt,
    }));
  res.json({
    data: {
      billingRequired: state.billingRequired,
      activationPriceMinor: state.activationPriceMinor,
      activationCurrency: state.activationCurrency,
      liveAllowed: state.liveAllowed,
      entitlement: state.entitlement
        ? {
            source: state.entitlement.source,
            grantedAt: state.entitlement.grantedAt,
            revokedAt: state.entitlement.revokedAt,
          }
        : null,
      payments,
    },
  });
});

const SERVER_PLAN_TOTALS_MAJOR: Record<'starter' | 'growth' | 'global_pro', { currency: 'NGN' | 'USD'; byMonth: Record<number, number> }> = {
  starter: {
    currency: 'NGN',
    byMonth: { 1: 7000, 2: 13000, 3: 18000, 4: 23200, 5: 28500, 6: 33000, 7: 37800, 8: 42400, 9: 46800, 10: 51500, 11: 56100, 12: 60000 },
  },
  growth: {
    currency: 'NGN',
    byMonth: { 1: 12000, 2: 22000, 3: 30000, 4: 38400, 5: 46500, 6: 54000, 7: 62300, 8: 70400, 9: 78300, 10: 86000, 11: 93500, 12: 100000 },
  },
  global_pro: {
    currency: 'USD',
    byMonth: { 1: 25, 2: 46, 3: 63, 4: 80, 5: 97, 6: 114, 7: 130, 8: 145, 9: 160, 10: 174, 11: 188, 12: 200 },
  },
};

const activationCheckoutSchema = z.object({
  planId: z.enum(['starter', 'growth', 'global_pro']).optional(),
  durationMonths: z.number().int().min(1).max(12).optional(),
});

consoleRouter.post('/activation/checkout', (req, res) => {
  const { session, user } = req.sessionAuth!;
  const settings = store.billingSettings;
  if (!settings.billingRequired) {
    res.status(400).json({
      error: { code: 'BILLING_OFF', message: 'Live sending is already active for your business account.' },
    });
    return;
  }

  const parsed = activationCheckoutSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid plan or billing duration selected' },
    });
    return;
  }

  let amountMinor = settings.activationPriceMinor;
  let currency: string = settings.activationCurrency;
  let planSummary = 'Annual activation';

  if (parsed.data.planId && parsed.data.durationMonths) {
    const planTable = SERVER_PLAN_TOTALS_MAJOR[parsed.data.planId];
    const major = planTable.byMonth[parsed.data.durationMonths];
    if (major) {
      amountMinor = major * 100;
      currency = planTable.currency;
      planSummary = `${parsed.data.planId} (${parsed.data.durationMonths} mo)`;
    }
  }

  const isLiveGateway = settings.gatewayMode === 'LIVE';
  const ref = `SN_ACT_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  const payment = {
    id: newId('pay'),
    workspaceId: session.workspaceId,
    reference: ref,
    amountMinor,
    currency,
    status: 'VERIFIED' as const,
    livemode: isLiveGateway,
    refundedMinor: 0,
    createdAt: now,
    verifiedAt: now,
  };
  store.activationPayments.unshift(payment);

  // Security invariant: test-mode payment NEVER unlocks production live entitlement
  if (!isLiveGateway) {
    store.writeAudit({
      workspaceId: session.workspaceId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'billing.test_payment_recorded',
      entityType: 'ActivationPayment',
      entityId: payment.id,
      detail: `Recorded test-mode checkout ${ref} for ${planSummary}; live entitlement NOT granted until live gateway key is configured`,
      ip: req.ip || 'unknown',
    });
    res.json({
      data: {
        entitlementGranted: false,
        note: 'Checkout reference recorded. Live billing activation is currently being finalized — please contact support if you need immediate activation.',
      },
    });
    return;
  }

  store.entitlements.set(session.workspaceId, {
    workspaceId: session.workspaceId,
    source: 'PAID',
    grantedAt: now,
    grantedByUserId: user.id,
    note: `Verified live checkout ${ref} — ${planSummary}`,
  });
  store.writeAudit({
    workspaceId: session.workspaceId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'billing.entitlement_granted',
    entityType: 'Entitlement',
    entityId: session.workspaceId,
    detail: `Live activation granted via verified payment ${ref} (${planSummary})`,
    ip: req.ip || 'unknown',
  });
  res.json({ data: { payment, entitlementGranted: true } });
});

// -----------------------------------------------------------------------------
// 6. Platform Admin Router (/api/admin/*)
// -----------------------------------------------------------------------------

export const adminRouter = Router();
adminRouter.use(requireSession, requirePlatformAdmin);

adminRouter.get('/overview', (_req, res) => {
  const deliveries = [...store.deliveries.values()];
  const activeKeys = [...store.apiKeys.values()].filter((k) => !k.revokedAt).length;
  const deadJobs = store.outbox.filter((j) => j.status === 'DEAD').length;

  const revenueByCurrency: Record<string, number> = {};
  for (const p of store.activationPayments) {
    if (p.livemode && p.status === 'VERIFIED') {
      revenueByCurrency[p.currency] =
        (revenueByCurrency[p.currency] ?? 0) + (p.amountMinor - p.refundedMinor);
    }
  }

  res.json({
    data: {
      counts: {
        users: store.users.size,
        businesses: store.workspaces.size,
        activeKeys,
        totalDeliveries: deliveries.length,
        deliveredCount: deliveries.filter((d) => d.status === 'DELIVERED').length,
        failedCount: deliveries.filter((d) => d.status === 'FAILED').length,
        deadJobs,
      },
      billing: store.billingSettings,
      readiness: {
        gatewayConfigured: Boolean(process.env.ACTIVATION_PAYSTACK_SECRET_KEY?.trim()),
        gatewayMode: store.billingSettings.gatewayMode,
        priceConfigured: store.billingSettings.activationPriceMinor > 0,
      },
      revenueByCurrency,
      businesses: [...store.workspaces.values()].map((ws) => ({
        id: ws.id,
        name: ws.displayName,
        contactEmail: ws.contactEmail,
        currency: ws.currency,
        createdAt: ws.createdAt,
        suspendedAt: ws.suspendedAt,
        suspendedReason: ws.suspendedReason,
        entitlement: store.entitlements.get(ws.id) ?? null,
      })),
      payments: store.activationPayments.slice(0, 30).map((p) => ({
        ...p,
        businessName: store.workspaces.get(p.workspaceId)?.displayName ?? p.workspaceId,
      })),
      auditLogs: store.auditLogs.slice(0, 50),
      contactSubmissions: store.contactSubmissions.slice(0, 20),
    },
  });
});

const billingPatchSchema = z.object({
  billingRequired: z.boolean().optional(),
  activationPriceMinor: z.number().int().min(100).max(1_000_000_000).optional(),
  activationCurrency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).optional(),
  confirm: z.boolean().optional(),
});

adminRouter.patch('/billing', (req, res) => {
  const { user } = req.sessionAuth!;
  const parsed = billingPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid billing patch' },
    });
    return;
  }

  const before = { ...store.billingSettings };
  if (parsed.data.billingRequired === true && !before.billingRequired && !parsed.data.confirm) {
    res.status(422).json({
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'Enabling billing affects live access for all businesses. Resend with confirm: true.',
      },
    });
    return;
  }

  if (parsed.data.activationCurrency && !CURRENCY_META[parsed.data.activationCurrency]) {
    res.status(422).json({ error: { code: 'UNPROCESSABLE', message: 'Unsupported currency' } });
    return;
  }

  if (parsed.data.billingRequired !== undefined) {
    store.billingSettings.billingRequired = parsed.data.billingRequired;
  }
  if (parsed.data.activationPriceMinor !== undefined) {
    store.billingSettings.activationPriceMinor = parsed.data.activationPriceMinor;
  }
  if (parsed.data.activationCurrency !== undefined) {
    store.billingSettings.activationCurrency = parsed.data.activationCurrency;
  }
  store.billingSettings.updatedAt = new Date().toISOString();

  store.writeAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'billing.settings_changed',
    entityType: 'ApplicationSetting',
    detail: `Billing required: ${store.billingSettings.billingRequired ? 'ON' : 'OFF'}, activation price: ${formatMinorUnits(store.billingSettings.activationPriceMinor, store.billingSettings.activationCurrency)}`,
    ip: req.ip || 'unknown',
  });

  res.json({ data: store.billingSettings });
});

adminRouter.post('/businesses/:workspaceId/suspend', (req, res) => {
  const ws = store.workspaces.get(String(req.params.workspaceId));
  if (!ws) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Business not found' } });
    return;
  }
  const reason =
    typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim().slice(0, 300)
      : 'Suspended by platform admin';
  ws.suspendedAt = new Date().toISOString();
  ws.suspendedReason = reason;
  store.writeAudit({
    workspaceId: ws.id,
    actorUserId: req.sessionAuth!.user.id,
    actorEmail: req.sessionAuth!.user.email,
    action: 'business.suspended',
    entityType: 'Workspace',
    entityId: ws.id,
    detail: `Suspended ${ws.displayName}: ${reason}`,
    ip: req.ip || 'unknown',
  });
  res.json({ data: { suspended: true } });
});

adminRouter.post('/businesses/:workspaceId/unsuspend', (req, res) => {
  const ws = store.workspaces.get(String(req.params.workspaceId));
  if (!ws) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Business not found' } });
    return;
  }
  ws.suspendedAt = undefined;
  ws.suspendedReason = undefined;
  store.writeAudit({
    workspaceId: ws.id,
    actorUserId: req.sessionAuth!.user.id,
    actorEmail: req.sessionAuth!.user.email,
    action: 'business.unsuspended',
    entityType: 'Workspace',
    entityId: ws.id,
    detail: `Unsuspended ${ws.displayName}`,
    ip: req.ip || 'unknown',
  });
  res.json({ data: { suspended: false } });
});

adminRouter.post('/entitlements/:workspaceId/complimentary', (req, res) => {
  const ws = store.workspaces.get(String(req.params.workspaceId));
  if (!ws) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Business not found' } });
    return;
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  if (!note) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A note is required for complimentary activation' } });
    return;
  }
  store.entitlements.set(ws.id, {
    workspaceId: ws.id,
    source: 'COMPLIMENTARY',
    grantedAt: new Date().toISOString(),
    grantedByUserId: req.sessionAuth!.user.id,
    note,
  });
  store.writeAudit({
    workspaceId: ws.id,
    actorUserId: req.sessionAuth!.user.id,
    actorEmail: req.sessionAuth!.user.email,
    action: 'billing.complimentary_granted',
    entityType: 'Entitlement',
    entityId: ws.id,
    detail: `Granted complimentary activation to ${ws.displayName}: ${note}`,
    ip: req.ip || 'unknown',
  });
  res.json({ data: { granted: true } });
});

adminRouter.post('/entitlements/:workspaceId/revoke', (req, res) => {
  const ent = store.entitlements.get(String(req.params.workspaceId));
  if (!ent || ent.revokedAt) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No active entitlement found' } });
    return;
  }
  const reason =
    typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim().slice(0, 300)
      : 'revoked_by_admin';
  ent.revokedAt = new Date().toISOString();
  ent.revokedReason = reason;
  store.writeAudit({
    workspaceId: ent.workspaceId,
    actorUserId: req.sessionAuth!.user.id,
    actorEmail: req.sessionAuth!.user.email,
    action: 'billing.entitlement_revoked',
    entityType: 'Entitlement',
    entityId: ent.workspaceId,
    detail: `Revoked entitlement: ${reason}`,
    ip: req.ip || 'unknown',
  });
  res.json({ data: { revoked: true } });
});
