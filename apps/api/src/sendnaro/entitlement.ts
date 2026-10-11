import { prisma, type ApiEnvironment } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';

/**
 * Billing settings live in ApplicationSetting (authoritative, server-side). `billing_required`
 * defaults to FALSE when the row is absent and is never rewritten by a restart or redeploy:
 * the seed only inserts missing keys.
 */
const KEYS = {
  billingRequired: 'billing_required',
  activationPriceMinor: 'activation_price_minor',
  activationCurrency: 'activation_currency',
} as const;

export interface BillingSettings {
  billingRequired: boolean;
  activationPriceMinor: number | null;
  activationCurrency: string;
}

export async function getBillingSettings(): Promise<BillingSettings> {
  const rows = await prisma.applicationSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const price = byKey.get(KEYS.activationPriceMinor);
  return {
    billingRequired: byKey.get(KEYS.billingRequired) === true,
    activationPriceMinor: typeof price === 'number' ? price : null,
    activationCurrency:
      typeof byKey.get(KEYS.activationCurrency) === 'string'
        ? (byKey.get(KEYS.activationCurrency) as string)
        : 'NGN',
  };
}

export async function saveBillingSettings(patch: Partial<BillingSettings>): Promise<void> {
  const writes: [string, unknown][] = [];
  if (patch.billingRequired !== undefined) writes.push([KEYS.billingRequired, patch.billingRequired]);
  if (patch.activationPriceMinor !== undefined)
    writes.push([KEYS.activationPriceMinor, patch.activationPriceMinor]);
  if (patch.activationCurrency !== undefined)
    writes.push([KEYS.activationCurrency, patch.activationCurrency]);
  for (const [key, value] of writes) {
    await prisma.applicationSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }
}

/** Seeds defaults WITHOUT overwriting an owner's earlier choice. */
export async function seedBillingDefaults(): Promise<void> {
  await prisma.applicationSetting.createMany({
    data: [
      { key: KEYS.billingRequired, value: false, description: 'Require a paid one-time activation for live sending' },
      { key: KEYS.activationCurrency, value: 'NGN', description: 'Activation price currency' },
    ],
    skipDuplicates: true,
  });
}

export async function hasActiveEntitlement(workspaceId: string): Promise<boolean> {
  const e = await prisma.entitlement.findUnique({ where: { workspaceId } });
  return Boolean(e && !e.revokedAt);
}

/**
 * THE shared live-send gate. Called by the API (before any side effect), the queued job processor,
 * retries and any admin resend. Authentication alone never implies permission to send.
 *
 *  - suspended business          -> blocked in both environments
 *  - sandbox                     -> always allowed (free, simulated)
 *  - live + billing disabled     -> allowed
 *  - live + billing enabled      -> allowed only with an active (paid or complimentary) entitlement
 */
export async function assertCanSend(workspaceId: string, environment: ApiEnvironment): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { suspendedAt: true, deletedAt: true },
  });
  if (!workspace || workspace.deletedAt) throw new AppError('UNAUTHENTICATED', 'Invalid API key');
  if (workspace.suspendedAt) {
    throw new AppError('BUSINESS_SUSPENDED', 'This business account is suspended');
  }
  if (environment === 'SANDBOX') return;

  const { billingRequired } = await getBillingSettings();
  if (billingRequired && !(await hasActiveEntitlement(workspaceId))) {
    throw new AppError(
      'ACTIVATION_REQUIRED',
      'Live sending requires a one-time Sendnaro activation. Activate this business in the console.',
    );
  }
}
