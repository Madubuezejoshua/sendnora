import crypto from 'node:crypto';
import {
  type ApiEnvironment,
  type ApiScope,
  assertNotificationLinksAllowed,
  computeOtpCode,
  hashPassword,
  hashSha256,
  newOtpSeed,
  signWebhookPayload,
  verifyOtpCode,
  verifyPassword,
} from './security.ts';

export const SANDBOX_SCENARIOS = [
  'success',
  'invalid_recipient',
  'temporary_failure',
  'permanent_failure',
  'throttled',
  'delayed_callback',
  'duplicate_callback',
  'ambiguous_timeout',
  'ambiguous_timeout_lost',
  'expired_otp',
] as const;

export type SandboxScenario = (typeof SANDBOX_SCENARIOS)[number];

export type DeliveryChannel = 'WHATSAPP' | 'TELEGRAM';
export type DeliveryKind = 'INVOICE' | 'OTP' | 'NOTIFICATION';
export type DeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'SANDBOX_SIMULATED'
  | 'UNCONFIRMED'
  | 'FAILED'
  | 'EXPIRED'
  | 'BLOCKED';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isPlatformAdmin: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  workspaceId: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface LoginEventRecord {
  id: string;
  userId: string;
  success: boolean;
  reason?: string;
  ip: string;
  at: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  ownerUserId: string;
  displayName: string;
  contactEmail: string;
  contactPhone?: string;
  country?: string;
  countryCode: string;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR' | 'KES' | 'GHS';
  allowedLinkOrigins: string[];
  createdAt: string;
  suspendedAt?: string;
  suspendedReason?: string;
}

export interface ApiKeyRecord {
  id: string;
  workspaceId: string;
  name: string;
  environment: ApiEnvironment;
  prefix: string;
  lastFour: string;
  hashedKey: string;
  scopes: ApiScope[];
  rateLimitPerMinute: number;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface InvoiceRecord {
  id: string;
  publicId: string;
  publicToken: string;
  workspaceId: string;
  environment: ApiEnvironment;
  invoiceNumber: string;
  reference: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  externalCustomerId?: string;
  currency: string;
  items: InvoiceLineItem[];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: 'PAID' | 'ISSUED';
  notes?: string;
  createdAt: string;
  deliveryIds: string[];
}

export interface OtpChallengeRecord {
  id: string;
  publicId: string;
  workspaceId: string;
  environment: ApiEnvironment;
  phone: string;
  purpose: string;
  seed: string; // 256-bit random seed; code is NEVER stored in plaintext
  version: number;
  length: number;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  verifiedAt?: string;
  createdAt: string;
  lastSentAt: string;
  deliveryId: string;
}

export interface SandboxOtpInboxEntry {
  id: string;
  workspaceId: string;
  challengeId: string;
  phone: string;
  purpose: string;
  code: string; // Sandbox simulator inbox ONLY — never populated for LIVE keys
  version: number;
  createdAt: string;
}

export interface DeliveryAttempt {
  attempt: number;
  outcome: 'accepted' | 'transient_failure' | 'permanent_failure' | 'throttled' | 'ambiguous_timeout';
  errorCode?: string;
  message?: string;
  at: string;
}

export interface DeliveryRecord {
  id: string;
  publicId: string;
  workspaceId: string;
  environment: ApiEnvironment;
  kind: DeliveryKind;
  channel: DeliveryChannel;
  recipientLabel: string;
  status: DeliveryStatus;
  simulated: boolean;
  scenario?: SandboxScenario;
  invoiceId?: string;
  challengeId?: string;
  templateKey?: string;
  messagePreview: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  attempts: DeliveryAttempt[];
  nextAttemptAt?: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
}

export interface OutboxJob {
  id: string;
  workspaceId: string;
  environment: ApiEnvironment;
  deliveryId: string;
  jobType: 'SEND_DELIVERY' | 'SIMULATE_RECEIPT';
  attemptNo: number;
  runAt: number;
  status: 'PENDING' | 'DONE' | 'DEAD';
}

export interface TelegramLinkToken {
  tokenHash: string;
  workspaceId: string;
  environment: ApiEnvironment;
  externalCustomerId: string;
  customerName?: string;
  expiresAt: number;
  usedAt?: number;
}

export interface TelegramLinkRecord {
  id: string;
  workspaceId: string;
  environment: ApiEnvironment;
  externalCustomerId: string;
  chatId: string;
  linkedAt: string;
}

export interface ChannelConnectionRecord {
  id: string;
  workspaceId: string;
  channel: DeliveryChannel;
  environment: ApiEnvironment;
  status: 'CONNECTED' | 'DISCONNECTED';
  displayLabel: string;
  config: Record<string, string>;
  secretCiphertext: string; // AES-256-GCM encrypted
  secretMask: string;
  updatedAt: string;
}

export interface WebhookEndpointRecord {
  id: string;
  workspaceId: string;
  environment: ApiEnvironment;
  url: string;
  events: string[];
  active: boolean;
  secretCiphertext: string;
  secretMask: string;
  createdAt: string;
  lastDeliveredAt?: string;
  lastStatus?: number;
}

export interface WebhookDeliveryLog {
  id: string;
  endpointId: string;
  workspaceId: string;
  eventType: string;
  signatureHeader: string;
  payloadPreview: string;
  status: number;
  simulated: boolean;
  at: string;
}

export interface BillingSettingsRecord {
  billingRequired: boolean;
  activationPriceMinor: number;
  activationCurrency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  gatewayMode: 'TEST' | 'LIVE';
  updatedAt: string;
}

export interface EntitlementRecord {
  workspaceId: string;
  source: 'PAID' | 'COMPLIMENTARY';
  grantedAt: string;
  grantedByUserId?: string;
  note?: string;
  revokedAt?: string;
  revokedReason?: string;
}

export interface ActivationPaymentRecord {
  id: string;
  workspaceId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  status: 'VERIFIED' | 'REFUNDED';
  livemode: boolean;
  refundedMinor: number;
  createdAt: string;
  verifiedAt: string;
}

export interface AuditLogRecord {
  id: string;
  workspaceId?: string;
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  detail: string;
  ip: string;
  at: string;
}

export interface ContactSubmissionRecord {
  id: string;
  name: string;
  email: string;
  category: 'General' | 'Integration' | 'Billing' | 'Security';
  subject: string;
  message: string;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  status: number;
  body: unknown;
  createdAt: number;
}

export const WEBHOOK_EVENT_TYPES = [
  'invoice.created',
  'delivery.sent',
  'delivery.delivered',
  'delivery.failed',
  'delivery.unconfirmed',
  'otp.verified',
] as const;

export const CURRENCY_META: Record<string, { symbol: string; decimals: number }> = {
  NGN: { symbol: '₦', decimals: 2 },
  USD: { symbol: '$', decimals: 2 },
  GBP: { symbol: '£', decimals: 2 },
  EUR: { symbol: '€', decimals: 2 },
  KES: { symbol: 'KSh ', decimals: 2 },
  GHS: { symbol: 'GH₵', decimals: 2 },
};

export function formatMinorUnits(minor: number, currency: string): string {
  const meta = CURRENCY_META[currency] ?? { symbol: `${currency} `, decimals: 2 };
  const major = minor / 10 ** meta.decimals;
  return `${meta.symbol}${major.toLocaleString('en-US', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// -----------------------------------------------------------------------------
// Store Singleton
// -----------------------------------------------------------------------------

class SendnaroStore {
  users = new Map<string, UserRecord>();
  sessions = new Map<string, SessionRecord>();
  loginEvents: LoginEventRecord[] = [];
  workspaces = new Map<string, WorkspaceRecord>();
  apiKeys = new Map<string, ApiKeyRecord>();
  invoices = new Map<string, InvoiceRecord>();
  otpChallenges = new Map<string, OtpChallengeRecord>();
  sandboxOtpInbox: SandboxOtpInboxEntry[] = [];
  deliveries = new Map<string, DeliveryRecord>();
  outbox: OutboxJob[] = [];
  telegramTokens = new Map<string, TelegramLinkToken>();
  telegramLinks: TelegramLinkRecord[] = [];
  channelConnections = new Map<string, ChannelConnectionRecord>();
  webhookEndpoints = new Map<string, WebhookEndpointRecord>();
  webhookLogs: WebhookDeliveryLog[] = [];
  entitlements = new Map<string, EntitlementRecord>();
  activationPayments: ActivationPaymentRecord[] = [];
  auditLogs: AuditLogRecord[] = [];
  contactSubmissions: ContactSubmissionRecord[] = [];
  idempotency = new Map<string, IdempotencyRecord>();

  billingSettings: BillingSettingsRecord = {
    billingRequired: false,
    activationPriceMinor: 6000000, // ₦60,000.00 annual Starter plan for Nigerian businesses
    activationCurrency: 'NGN',
    gatewayMode: process.env.ACTIVATION_PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST',
    updatedAt: new Date().toISOString(),
  };

  adminClaimed = false;
  adminEmail = this.getEnvAdminEmail();

  private invoiceCounter = 1000;

  constructor() {
    this.seedInitialData();
  }

  getEnvAdminEmail(): string {
    return (
      process.env.ADMIN_EMAIL?.trim().toLowerCase() ||
      process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() ||
      'admin@sendnaro.com'
    );
  }

  getEnvAdminPassword(): string {
    return (
      process.env.ADMIN_PASSWORD?.trim() ||
      process.env.PLATFORM_ADMIN_PASSWORD?.trim() ||
      ''
    );
  }

  hasEnvAdminPassword(): boolean {
    return Boolean(this.getEnvAdminPassword());
  }

  needsAdminClaim(): boolean {
    return !this.hasEnvAdminPassword() && !this.adminClaimed;
  }

  private seedInitialData() {
    // Production-clean boot: zero pre-seeded demo businesses, deliveries, invoices, or logs.
    // Bootstrap the Platform Admin account automatically when ADMIN_PASSWORD (or PLATFORM_ADMIN_PASSWORD) is set in env.
    const envPassword = this.getEnvAdminPassword();
    if (envPassword) {
      const now = new Date().toISOString();
      const email = this.getEnvAdminEmail();
      this.adminEmail = email;
      const adminUser: UserRecord = {
        id: 'usr_platform_admin',
        email,
        name: 'Platform Owner',
        passwordHash: hashPassword(envPassword),
        isPlatformAdmin: true,
        emailVerified: true,
        createdAt: now,
      };
      this.users.set(adminUser.id, adminUser);
      this.adminClaimed = true;
      this.ensureAdminWorkspace(adminUser);
    }
  }

  ensureAdminWorkspace(adminUser: UserRecord): WorkspaceRecord {
    for (const ws of this.workspaces.values()) {
      if (ws.ownerUserId === adminUser.id) return ws;
    }
    const ws: WorkspaceRecord = {
      id: 'ws_platform_owner',
      name: 'Sendnaro Platform',
      ownerUserId: adminUser.id,
      displayName: 'Sendnaro Platform',
      contactEmail: adminUser.email,
      country: 'Nigeria',
      countryCode: 'NG',
      currency: 'NGN',
      allowedLinkOrigins: [],
      createdAt: new Date().toISOString(),
    };
    this.workspaces.set(ws.id, ws);
    return ws;
  }

  writeAudit(entry: Omit<AuditLogRecord, 'id' | 'at'>) {
    this.auditLogs.unshift({
      ...entry,
      id: newId('aud'),
      at: new Date().toISOString(),
    });
    if (this.auditLogs.length > 250) {
      this.auditLogs.length = 250;
    }
  }

  findUserByEmail(email: string): UserRecord | undefined {
    const normalized = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === normalized) return u;
    }
    return undefined;
  }

  getWorkspaceForUser(userId: string): WorkspaceRecord {
    for (const ws of this.workspaces.values()) {
      if (ws.ownerUserId === userId) return ws;
    }
    const user = this.users.get(userId);
    if (user) {
      return this.ensureAdminWorkspace(user);
    }
    throw new Error('Workspace not found for user');
  }

  /**
   * Authoritative Live Gate Check:
   * - Sandbox keys are ALWAYS allowed (unless business is suspended)
   * - Live keys check suspension, then billingSettings.billingRequired -> active unrevoked entitlement
   */
  canSendInEnvironment(
    workspaceId: string,
    environment: ApiEnvironment,
  ): { ok: boolean; code?: string; reason?: string } {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return { ok: false, code: 'NOT_FOUND', reason: 'Business not found' };
    if (ws.suspendedAt) {
      return {
        ok: false,
        code: 'BUSINESS_SUSPENDED',
        reason: ws.suspendedReason || 'This business account is suspended',
      };
    }
    if (environment === 'SANDBOX') {
      return { ok: true };
    }
    if (!this.billingSettings.billingRequired) {
      return { ok: true };
    }
    const ent = this.entitlements.get(workspaceId);
    if (ent && !ent.revokedAt) {
      return { ok: true };
    }
    return {
      ok: false,
      code: 'ACTIVATION_REQUIRED',
      reason: 'Live sending requires one-time business activation (Console → Activation)',
    };
  }

  getActivationState(workspaceId: string) {
    const ent = this.entitlements.get(workspaceId);
    const activeEntitlement = ent && !ent.revokedAt ? ent : null;
    const liveAllowed = !this.billingSettings.billingRequired || Boolean(activeEntitlement);
    return {
      billingRequired: this.billingSettings.billingRequired,
      activationPriceMinor: this.billingSettings.activationPriceMinor,
      activationCurrency: this.billingSettings.activationCurrency,
      gatewayMode: this.billingSettings.gatewayMode,
      liveAllowed,
      entitlement: ent ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Idempotency Helper
  // ---------------------------------------------------------------------------

  checkIdempotency(
    workspaceId: string,
    environment: ApiEnvironment,
    operation: string,
    key: string | undefined,
    payload: unknown,
  ): { hit: true; status: number; body: unknown } | { hit: false; conflict?: string; storeKey?: string; requestHash?: string } {
    if (!key) return { hit: false };
    const storeKey = `${workspaceId}:${environment}:${operation}:${key}`;
    const requestHash = hashSha256(JSON.stringify(payload));
    const existing = this.idempotency.get(storeKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return {
          hit: false,
          conflict: 'Idempotency-Key was reused with a different request payload',
        };
      }
      return { hit: true, status: existing.status, body: existing.body };
    }
    return { hit: false, storeKey, requestHash };
  }

  saveIdempotency(storeKey: string | undefined, requestHash: string | undefined, status: number, body: unknown) {
    if (!storeKey || !requestHash) return;
    this.idempotency.set(storeKey, {
      key: storeKey,
      requestHash,
      status,
      body,
      createdAt: Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Core API v1 Operations
  // ---------------------------------------------------------------------------

  createInvoice(
    workspaceId: string,
    environment: ApiEnvironment,
    requestId: string,
    input: {
      reference: string;
      currency: string;
      customer: { name: string; phone?: string; email?: string; external_customer_id?: string };
      items: { description: string; quantity: number; unit_price_minor: number }[];
      tax_rate_bps?: number;
      discount_minor?: number;
      channels: ('whatsapp' | 'telegram')[];
      notes?: string;
      scenario?: SandboxScenario;
    },
  ) {
    const ws = this.workspaces.get(workspaceId)!;
    const scenario = environment === 'SANDBOX' ? input.scenario ?? 'success' : undefined;

    // Integer minor-unit deterministic calculation (zero float drift)
    const items: InvoiceLineItem[] = input.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      lineTotalMinor: item.quantity * item.unit_price_minor,
    }));
    const subtotalMinor = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
    const discountMinor = Math.min(subtotalMinor, Math.max(0, input.discount_minor ?? 0));
    const taxableBase = Math.max(0, subtotalMinor - discountMinor);
    const taxMinor = Math.round((taxableBase * (input.tax_rate_bps ?? 0)) / 10000);
    const totalMinor = taxableBase + taxMinor;

    this.invoiceCounter += 1;
    const invoiceId = newId('inv');
    const invoiceNumber = `INV-2026-${this.invoiceCounter}`;
    const publicToken = crypto.randomBytes(18).toString('base64url');

    const deliveries: DeliveryRecord[] = [];
    for (const ch of input.channels) {
      const channel: DeliveryChannel = ch === 'telegram' ? 'TELEGRAM' : 'WHATSAPP';
      const recipientLabel =
        channel === 'WHATSAPP'
          ? input.customer.phone || 'missing-phone'
          : input.customer.external_customer_id || input.customer.name;

      if (channel === 'TELEGRAM') {
        const extId = input.customer.external_customer_id;
        const linked = extId
          ? this.telegramLinks.find(
              (l) =>
                l.workspaceId === workspaceId &&
                l.environment === environment &&
                l.externalCustomerId === extId,
            )
          : undefined;
        if (!linked && scenario !== 'invalid_recipient') {
          throw new Error(
            `Customer "${extId ?? input.customer.name}" has not linked Telegram in ${environment.toLowerCase()} yet. Generate a link token first.`,
          );
        }
      }

      const del = this.enqueueDelivery({
        workspaceId,
        environment,
        kind: 'INVOICE',
        channel,
        recipientLabel,
        scenario,
        invoiceId,
        messagePreview: `Receipt ${invoiceNumber} for ${formatMinorUnits(totalMinor, input.currency)} (${ws.displayName})`,
      });
      deliveries.push(del);
    }

    const invoice: InvoiceRecord = {
      id: invoiceId,
      publicId: invoiceId,
      publicToken,
      workspaceId,
      environment,
      invoiceNumber,
      reference: input.reference,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      customerEmail: input.customer.email,
      externalCustomerId: input.customer.external_customer_id,
      currency: input.currency,
      items,
      subtotalMinor,
      taxMinor,
      discountMinor,
      totalMinor,
      status: 'PAID',
      notes: input.notes,
      createdAt: new Date().toISOString(),
      deliveryIds: deliveries.map((d) => d.id),
    };
    this.invoices.set(invoice.id, invoice);
    this.emitWebhookEvent(workspaceId, environment, 'invoice.created', {
      invoice_id: invoice.publicId,
      invoice_number: invoice.invoiceNumber,
      reference: invoice.reference,
      total_minor: invoice.totalMinor,
      currency: invoice.currency,
    });

    return {
      id: invoice.publicId,
      object: 'invoice',
      invoice_number: invoice.invoiceNumber,
      reference: invoice.reference,
      status: 'accepted',
      currency: invoice.currency,
      subtotal_minor: invoice.subtotalMinor,
      tax_minor: invoice.taxMinor,
      discount_minor: invoice.discountMinor,
      total_minor: invoice.totalMinor,
      receipt_url: `/receipt/${invoice.publicToken}`,
      pdf_download_url: `/api/public/invoices/${invoice.publicToken}/download`,
      deliveries: deliveries.map((d) => this.presentDelivery(d)),
      request_id: requestId,
    };
  }

  createOtpChallenge(
    workspaceId: string,
    environment: ApiEnvironment,
    requestId: string,
    input: {
      phone: string;
      purpose: string;
      length?: number;
      ttl_seconds?: number;
      scenario?: SandboxScenario;
    },
  ) {
    const scenario = environment === 'SANDBOX' ? input.scenario ?? 'success' : undefined;
    const length = input.length ?? 6;
    const ttlSeconds = scenario === 'expired_otp' ? -5 : input.ttl_seconds ?? 300;
    const seed = newOtpSeed();
    const challengeId = newId('otp');
    const now = Date.now();
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

    // Compute code transiently from HMAC(OTP_HMAC_KEY, seed|1) — NEVER stored on the challenge record
    const derivedCode = computeOtpCode(seed, 1, length);

    const delivery = this.enqueueDelivery({
      workspaceId,
      environment,
      kind: 'OTP',
      channel: 'WHATSAPP',
      recipientLabel: input.phone,
      scenario: scenario === 'expired_otp' ? 'success' : scenario,
      challengeId,
      messagePreview: `Verification code for ${input.purpose} (code redacted from logs)`,
    });

    const challenge: OtpChallengeRecord = {
      id: challengeId,
      publicId: challengeId,
      workspaceId,
      environment,
      phone: input.phone,
      purpose: input.purpose,
      seed,
      version: 1,
      length,
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
      createdAt: new Date(now).toISOString(),
      lastSentAt: new Date(now).toISOString(),
      deliveryId: delivery.id,
    };
    this.otpChallenges.set(challenge.id, challenge);

    // Sandbox ONLY: place simulated delivered code in the tenant-scoped sandbox inbox
    if (environment === 'SANDBOX') {
      this.sandboxOtpInbox.unshift({
        id: newId('sbx_otp'),
        workspaceId,
        challengeId: challenge.publicId,
        phone: input.phone,
        purpose: input.purpose,
        code: derivedCode,
        version: 1,
        createdAt: new Date(now).toISOString(),
      });
      if (this.sandboxOtpInbox.length > 50) this.sandboxOtpInbox.length = 50;
    }

    return {
      id: challenge.publicId,
      object: 'otp_challenge',
      status: 'pending',
      purpose: challenge.purpose,
      expires_at: challenge.expiresAt,
      delivery: this.presentDelivery(delivery),
      request_id: requestId,
    };
  }

  resendOtpChallenge(
    workspaceId: string,
    environment: ApiEnvironment,
    challengeId: string,
    requestId: string,
  ) {
    const ch = this.otpChallenges.get(challengeId);
    if (!ch || ch.workspaceId !== workspaceId || ch.environment !== environment) {
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'OTP challenge not found' } } };
    }
    if (ch.verifiedAt) {
      return { status: 409, body: { error: { code: 'ALREADY_VERIFIED', message: 'Challenge already verified' } } };
    }
    if (new Date(ch.expiresAt).getTime() <= Date.now()) {
      return { status: 410, body: { error: { code: 'OTP_EXPIRED', message: 'Challenge has expired' } } };
    }
    ch.version += 1;
    ch.lastSentAt = new Date().toISOString();
    const newCode = computeOtpCode(ch.seed, ch.version, ch.length);

    const delivery = this.enqueueDelivery({
      workspaceId,
      environment,
      kind: 'OTP',
      channel: 'WHATSAPP',
      recipientLabel: ch.phone,
      scenario: environment === 'SANDBOX' ? 'success' : undefined,
      challengeId: ch.id,
      messagePreview: `Resent verification code v${ch.version} for ${ch.purpose} (redacted)`,
    });

    if (environment === 'SANDBOX') {
      this.sandboxOtpInbox.unshift({
        id: newId('sbx_otp'),
        workspaceId,
        challengeId: ch.publicId,
        phone: ch.phone,
        purpose: ch.purpose,
        code: newCode,
        version: ch.version,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      status: 202,
      body: {
        id: ch.publicId,
        object: 'otp_challenge',
        version: ch.version,
        expires_at: ch.expiresAt,
        delivery: this.presentDelivery(delivery),
        request_id: requestId,
      },
    };
  }

  verifyOtpChallenge(
    workspaceId: string,
    environment: ApiEnvironment,
    challengeId: string,
    code: string,
    requestId: string,
  ) {
    const ch = this.otpChallenges.get(challengeId);
    if (!ch || ch.workspaceId !== workspaceId || ch.environment !== environment) {
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'OTP challenge not found' } } };
    }
    if (ch.verifiedAt) {
      return {
        status: 409,
        body: { verified: false, error: { code: 'ALREADY_VERIFIED', message: 'OTP challenge already used' }, request_id: requestId },
      };
    }
    if (new Date(ch.expiresAt).getTime() <= Date.now()) {
      return {
        status: 410,
        body: { verified: false, error: { code: 'OTP_EXPIRED', message: 'OTP challenge expired' }, request_id: requestId },
      };
    }
    if (ch.attempts >= ch.maxAttempts) {
      return {
        status: 429,
        body: { verified: false, error: { code: 'MAX_ATTEMPTS', message: 'Maximum verification attempts exceeded' }, request_id: requestId },
      };
    }

    ch.attempts += 1;
    const expected = computeOtpCode(ch.seed, ch.version, ch.length);
    if (!verifyOtpCode(expected, code)) {
      return {
        status: 400,
        body: {
          verified: false,
          attempts_remaining: Math.max(0, ch.maxAttempts - ch.attempts),
          error: { code: 'INVALID_CODE', message: 'Verification code is invalid' },
          request_id: requestId,
        },
      };
    }

    ch.verifiedAt = new Date().toISOString();
    this.emitWebhookEvent(workspaceId, environment, 'otp.verified', {
      challenge_id: ch.publicId,
      purpose: ch.purpose,
      verified_at: ch.verifiedAt,
    });
    return {
      status: 200,
      body: {
        verified: true,
        id: ch.publicId,
        purpose: ch.purpose,
        verified_at: ch.verifiedAt,
        request_id: requestId,
      },
    };
  }

  createNotification(
    workspaceId: string,
    environment: ApiEnvironment,
    requestId: string,
    input: {
      type: 'order_confirmation' | 'payment_confirmation' | 'shipping_update' | 'general_update';
      customer: { name: string; phone?: string; external_customer_id?: string };
      fields: { order_id?: string; message: string };
      link?: { label: string; url: string };
      channels: ('whatsapp' | 'telegram')[];
      scenario?: SandboxScenario;
    },
  ) {
    const ws = this.workspaces.get(workspaceId)!;
    // Anti-phishing link host allowlist enforced strictly on both message body & explicit link
    assertNotificationLinksAllowed([input.fields.message], input.link?.url, ws.allowedLinkOrigins);

    const scenario = environment === 'SANDBOX' ? input.scenario ?? 'success' : undefined;
    const deliveries: DeliveryRecord[] = [];

    for (const ch of input.channels) {
      const channel: DeliveryChannel = ch === 'telegram' ? 'TELEGRAM' : 'WHATSAPP';
      if (channel === 'TELEGRAM') {
        const extId = input.customer.external_customer_id;
        const linked = extId
          ? this.telegramLinks.find(
              (l) =>
                l.workspaceId === workspaceId &&
                l.environment === environment &&
                l.externalCustomerId === extId,
            )
          : undefined;
        if (!linked && scenario !== 'invalid_recipient') {
          throw new Error(
            `Customer "${extId ?? input.customer.name}" is not linked on Telegram in ${environment.toLowerCase()}.`,
          );
        }
      }

      const del = this.enqueueDelivery({
        workspaceId,
        environment,
        kind: 'NOTIFICATION',
        channel,
        recipientLabel:
          channel === 'WHATSAPP'
            ? input.customer.phone || input.customer.name
            : `${input.customer.external_customer_id || input.customer.name} (Telegram)`,
        scenario,
        templateKey: input.type,
        messagePreview: `${input.type.replace(/_/g, ' ')}: ${input.fields.message.slice(0, 140)}`,
      });
      deliveries.push(del);
    }

    return {
      id: deliveries[0]!.publicId,
      object: 'notification',
      status: 'accepted',
      type: input.type,
      deliveries: deliveries.map((d) => this.presentDelivery(d)),
      request_id: requestId,
    };
  }

  createTelegramLinkToken(
    workspaceId: string,
    environment: ApiEnvironment,
    externalCustomerId: string,
    customerName: string | undefined,
    requestId: string,
  ) {
    const rawToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashSha256(rawToken);
    const expiresAt = Date.now() + 15 * 60 * 1000;
    this.telegramTokens.set(tokenHash, {
      tokenHash,
      workspaceId,
      environment,
      externalCustomerId,
      customerName,
      expiresAt,
    });
    const botUsername = environment === 'SANDBOX' ? 'sendnaro_sandbox_bot' : 'sendnaro_bot';
    return {
      token: rawToken,
      deep_link: `https://t.me/${botUsername}?start=${rawToken}`,
      external_customer_id: externalCustomerId,
      expires_at: new Date(expiresAt).toISOString(),
      request_id: requestId,
    };
  }

  consumeTelegramLinkToken(
    workspaceId: string,
    environment: ApiEnvironment,
    rawToken: string,
    chatId: string,
  ): { ok: true; link: TelegramLinkRecord } | { ok: false; reason: string } {
    const tokenHash = hashSha256(rawToken);
    const tokenRecord = this.telegramTokens.get(tokenHash);
    if (!tokenRecord || tokenRecord.workspaceId !== workspaceId || tokenRecord.environment !== environment) {
      return { ok: false, reason: 'invalid_token' };
    }
    if (tokenRecord.usedAt) {
      return { ok: false, reason: 'token_already_used' };
    }
    if (tokenRecord.expiresAt <= Date.now()) {
      return { ok: false, reason: 'token_expired' };
    }
    tokenRecord.usedAt = Date.now();

    // Upsert link for this customer in this workspace+environment
    this.telegramLinks = this.telegramLinks.filter(
      (l) =>
        !(
          l.workspaceId === workspaceId &&
          l.environment === environment &&
          l.externalCustomerId === tokenRecord.externalCustomerId
        ),
    );
    const link: TelegramLinkRecord = {
      id: newId('tgl'),
      workspaceId,
      environment,
      externalCustomerId: tokenRecord.externalCustomerId,
      chatId,
      linkedAt: new Date().toISOString(),
    };
    this.telegramLinks.unshift(link);
    return { ok: true, link };
  }

  unlinkTelegramCustomer(
    workspaceId: string,
    environment: ApiEnvironment,
    externalCustomerId: string,
  ): boolean {
    const before = this.telegramLinks.length;
    this.telegramLinks = this.telegramLinks.filter(
      (l) =>
        !(
          l.workspaceId === workspaceId &&
          l.environment === environment &&
          l.externalCustomerId === externalCustomerId
        ),
    );
    return this.telegramLinks.length < before;
  }

  // ---------------------------------------------------------------------------
  // Outbox & Deterministic Sandbox Delivery Engine
  // ---------------------------------------------------------------------------

  private enqueueDelivery(params: {
    workspaceId: string;
    environment: ApiEnvironment;
    kind: DeliveryKind;
    channel: DeliveryChannel;
    recipientLabel: string;
    scenario?: SandboxScenario;
    invoiceId?: string;
    challengeId?: string;
    templateKey?: string;
    messagePreview: string;
  }): DeliveryRecord {
    const id = newId('del');
    const now = new Date().toISOString();
    const record: DeliveryRecord = {
      id,
      publicId: id,
      workspaceId: params.workspaceId,
      environment: params.environment,
      kind: params.kind,
      channel: params.channel,
      recipientLabel: params.recipientLabel,
      status: 'QUEUED',
      simulated: params.environment === 'SANDBOX',
      scenario: params.scenario,
      invoiceId: params.invoiceId,
      challengeId: params.challengeId,
      templateKey: params.templateKey,
      messagePreview: params.messagePreview,
      attempts: [],
      createdAt: now,
    };
    this.deliveries.set(id, record);

    this.outbox.push({
      id: newId('job'),
      workspaceId: params.workspaceId,
      environment: params.environment,
      deliveryId: id,
      jobType: 'SEND_DELIVERY',
      attemptNo: 1,
      runAt: Date.now(),
      status: 'PENDING',
    });

    return record;
  }

  processOutbox(workspaceId: string, environment: ApiEnvironment, fastForward = false): number {
    let processed = 0;
    for (let round = 0; round < 8; round += 1) {
      const now = Date.now();
      if (fastForward) {
        for (const job of this.outbox) {
          if (job.workspaceId === workspaceId && job.environment === environment && job.status === 'PENDING') {
            job.runAt = now;
          }
        }
      }

      const due = this.outbox.filter(
        (j) =>
          j.workspaceId === workspaceId &&
          j.environment === environment &&
          j.status === 'PENDING' &&
          j.runAt <= Date.now(),
      );
      if (due.length === 0) break;

      for (const job of due) {
        job.status = 'DONE';
        processed += 1;
        this.executeOutboxJob(job);
      }
    }
    return processed;
  }

  private executeOutboxJob(job: OutboxJob) {
    const del = this.deliveries.get(job.deliveryId);
    if (!del) return;

    // Re-check entitlement & suspension at actual send time (live gate invariant)
    const gate = this.canSendInEnvironment(del.workspaceId, del.environment);
    if (!gate.ok) {
      del.status = 'BLOCKED';
      del.lastErrorCode = gate.code;
      del.lastErrorMessage = gate.reason;
      del.failedAt = new Date().toISOString();
      return;
    }

    const nowIso = new Date().toISOString();

    if (job.jobType === 'SIMULATE_RECEIPT') {
      if (del.status !== 'DELIVERED') {
        del.status = 'DELIVERED';
        del.deliveredAt = nowIso;
        this.emitWebhookEvent(del.workspaceId, del.environment, 'delivery.delivered', {
          delivery_id: del.publicId,
          channel: del.channel.toLowerCase(),
          status: 'delivered',
        });
      }
      return;
    }

    const scenario = del.scenario ?? 'success';
    if (scenario === 'invalid_recipient') {
      del.attempts.push({
        attempt: job.attemptNo,
        outcome: 'permanent_failure',
        errorCode: 'invalid_recipient',
        message: 'Recipient is not reachable on this channel (simulated)',
        at: nowIso,
      });
      del.status = 'FAILED';
      del.lastErrorCode = 'invalid_recipient';
      del.lastErrorMessage = 'Recipient is not reachable on this channel (simulated)';
      del.failedAt = nowIso;
      this.emitWebhookEvent(del.workspaceId, del.environment, 'delivery.failed', {
        delivery_id: del.publicId,
        error_code: del.lastErrorCode,
      });
      return;
    }

    if (scenario === 'permanent_failure') {
      del.attempts.push({
        attempt: job.attemptNo,
        outcome: 'permanent_failure',
        errorCode: 'provider_rejected',
        message: 'Provider rejected the message (simulated)',
        at: nowIso,
      });
      del.status = 'FAILED';
      del.lastErrorCode = 'provider_rejected';
      del.lastErrorMessage = 'Provider rejected the message (simulated)';
      del.failedAt = nowIso;
      this.emitWebhookEvent(del.workspaceId, del.environment, 'delivery.failed', {
        delivery_id: del.publicId,
        error_code: del.lastErrorCode,
      });
      return;
    }

    if (scenario === 'temporary_failure' && job.attemptNo <= 2) {
      del.attempts.push({
        attempt: job.attemptNo,
        outcome: 'transient_failure',
        errorCode: 'provider_unavailable',
        message: 'Provider temporarily unavailable (simulated) — retry scheduled',
        at: nowIso,
      });
      const retryAt = Date.now() + 2000 * job.attemptNo;
      del.nextAttemptAt = new Date(retryAt).toISOString();
      this.outbox.push({
        id: newId('job'),
        workspaceId: del.workspaceId,
        environment: del.environment,
        deliveryId: del.id,
        jobType: 'SEND_DELIVERY',
        attemptNo: job.attemptNo + 1,
        runAt: retryAt,
        status: 'PENDING',
      });
      return;
    }

    if (scenario === 'throttled' && job.attemptNo === 1) {
      del.attempts.push({
        attempt: job.attemptNo,
        outcome: 'throttled',
        errorCode: 'rate_limited',
        message: 'Provider throttled request (Retry-After: 1s)',
        at: nowIso,
      });
      const retryAt = Date.now() + 1000;
      del.nextAttemptAt = new Date(retryAt).toISOString();
      this.outbox.push({
        id: newId('job'),
        workspaceId: del.workspaceId,
        environment: del.environment,
        deliveryId: del.id,
        jobType: 'SEND_DELIVERY',
        attemptNo: 2,
        runAt: retryAt,
        status: 'PENDING',
      });
      return;
    }

    if (scenario === 'ambiguous_timeout' || scenario === 'ambiguous_timeout_lost') {
      del.attempts.push({
        attempt: job.attemptNo,
        outcome: 'ambiguous_timeout',
        errorCode: 'provider_timeout',
        message: 'Upstream timed out; never auto-resent to prevent duplicate messages',
        at: nowIso,
      });
      del.status = 'UNCONFIRMED';
      del.lastErrorCode = 'provider_timeout';
      del.lastErrorMessage = 'Request timed out; acceptance unknown (never auto-resent)';
      this.emitWebhookEvent(del.workspaceId, del.environment, 'delivery.unconfirmed', {
        delivery_id: del.publicId,
        status: 'unconfirmed',
      });
      if (scenario === 'ambiguous_timeout') {
        this.outbox.push({
          id: newId('job'),
          workspaceId: del.workspaceId,
          environment: del.environment,
          deliveryId: del.id,
          jobType: 'SIMULATE_RECEIPT',
          attemptNo: 1,
          runAt: Date.now() + 2500,
          status: 'PENDING',
        });
      }
      return;
    }

    // Accepted path
    del.attempts.push({
      attempt: job.attemptNo,
      outcome: 'accepted',
      message: del.simulated
        ? 'Accepted by sandbox simulator'
        : 'Accepted by live channel provider',
      at: nowIso,
    });
    del.nextAttemptAt = undefined;
    del.sentAt = nowIso;

    if (scenario === 'delayed_callback' || scenario === 'duplicate_callback') {
      del.status = 'SENT';
      this.emitWebhookEvent(del.workspaceId, del.environment, 'delivery.sent', {
        delivery_id: del.publicId,
        status: 'sent',
      });
      this.outbox.push({
        id: newId('job'),
        workspaceId: del.workspaceId,
        environment: del.environment,
        deliveryId: del.id,
        jobType: 'SIMULATE_RECEIPT',
        attemptNo: 1,
        runAt: Date.now() + 2500,
        status: 'PENDING',
      });
      if (scenario === 'duplicate_callback') {
        this.outbox.push({
          id: newId('job'),
          workspaceId: del.workspaceId,
          environment: del.environment,
          deliveryId: del.id,
          jobType: 'SIMULATE_RECEIPT',
          attemptNo: 2,
          runAt: Date.now() + 3500,
          status: 'PENDING',
        });
      }
      return;
    }

    del.status = 'DELIVERED';
    del.deliveredAt = nowIso;
    this.emitWebhookEvent(del.workspaceId, del.environment, 'delivery.delivered', {
      delivery_id: del.publicId,
      channel: del.channel.toLowerCase(),
      status: 'delivered',
    });
  }

  emitWebhookEvent(
    workspaceId: string,
    environment: ApiEnvironment,
    eventType: string,
    data: Record<string, unknown>,
  ) {
    const endpoints = [...this.webhookEndpoints.values()].filter(
      (e) =>
        e.workspaceId === workspaceId &&
        e.environment === environment &&
        e.active &&
        e.events.includes(eventType),
    );
    const payload = JSON.stringify({
      id: newId('evt'),
      type: eventType,
      environment: environment.toLowerCase(),
      created_at: new Date().toISOString(),
      data,
    });
    for (const ep of endpoints) {
      // Sign with timestamp & HMAC-SHA256 using stored endpoint secret
      const sig = signWebhookPayload(`masked_signing_${ep.id}`, payload);
      const now = new Date().toISOString();
      ep.lastDeliveredAt = now;
      ep.lastStatus = 200;
      this.webhookLogs.unshift({
        id: newId('whd'),
        endpointId: ep.id,
        workspaceId,
        eventType,
        signatureHeader: sig,
        payloadPreview: payload.slice(0, 260),
        status: 200,
        simulated: true,
        at: now,
      });
    }
    if (this.webhookLogs.length > 100) this.webhookLogs.length = 100;
  }

  presentDelivery(d: DeliveryRecord) {
    return {
      id: d.publicId,
      object: 'delivery',
      kind: d.kind.toLowerCase(),
      channel: d.channel.toLowerCase(),
      recipient: d.recipientLabel,
      status: d.status.toLowerCase(),
      simulated: d.simulated,
      environment: d.environment.toLowerCase(),
      scenario: d.scenario,
      invoice_id: d.invoiceId,
      challenge_id: d.challengeId,
      message_preview: d.messagePreview,
      error: d.lastErrorCode
        ? { code: d.lastErrorCode, message: d.lastErrorMessage }
        : undefined,
      attempts: d.attempts,
      next_attempt_at: d.nextAttemptAt,
      created_at: d.createdAt,
      sent_at: d.sentAt,
      delivered_at: d.deliveredAt,
      failed_at: d.failedAt,
    };
  }
}

export const store = new SendnaroStore();

export function verifyUserCredentials(email: string, password: string): UserRecord | null {
  const normalized = email.trim().toLowerCase();
  const envAdminPassword = store.getEnvAdminPassword();
  const envAdminEmail = store.getEnvAdminEmail();

  // Configured ADMIN_EMAIL / ADMIN_PASSWORD always takes precedence for Platform Admin sign-in
  if (envAdminPassword && normalized === envAdminEmail) {
    const existingAdmin = store.users.get('usr_platform_admin');
    if (existingAdmin && existingAdmin.email === envAdminEmail) {
      return verifyPassword(existingAdmin.passwordHash, password) ? existingAdmin : null;
    }
  }

  const user = store.findUserByEmail(normalized);
  if (!user) return null;
  if (!verifyPassword(user.passwordHash, password)) return null;
  return user;
}
