import { prisma } from '@sendnaro/database';
import { decryptSecret } from '@sendnaro/database/encryption';
import { AppError, getCurrency } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { PaystackProvider } from './paystack.provider.js';
import { FlutterwaveProvider } from './flutterwave.provider.js';
import type { PaymentGatewayProvider } from './provider.interface.js';

/**
 * Resolves the gateway adapter to use for a workspace: a workspace-level
 * credential (encrypted at rest, set via the payment settings screen)
 * takes priority; otherwise falls back to the platform's own credentials
 * from environment variables. Either way, the plaintext secret key never
 * leaves this module.
 */
export async function resolvePaymentProvider(
  workspaceId: string,
  key: 'PAYSTACK' | 'FLUTTERWAVE',
): Promise<PaymentGatewayProvider> {
  const env = parseApiEnv();
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: key } },
  });

  const workspaceSecret =
    config?.isEnabled && config.encryptedSecretKey
      ? decryptSecret(config.encryptedSecretKey, env.APP_ENCRYPTION_KEY)
      : undefined;

  if (key === 'PAYSTACK') {
    const secretKey = workspaceSecret ?? env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new AppError('CONFLICT', 'Paystack is not configured for this workspace');
    return new PaystackProvider(secretKey);
  }

  const secretKey = workspaceSecret ?? env.FLUTTERWAVE_SECRET_KEY;
  const webhookHash = env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
  if (!secretKey || !webhookHash)
    throw new AppError('CONFLICT', 'Flutterwave is not configured for this workspace');
  return new FlutterwaveProvider(
    secretKey,
    webhookHash,
    (currency) => getCurrency(currency).minorUnitDigits,
  );
}

/**
 * Webhooks arrive without workspace context, so signature verification for
 * an inbound webhook always uses the PLATFORM's own secret (workspace-level
 * gateway credentials are only ever used for that workspace's own
 * outbound initialize/verify calls, not for verifying platform-wide
 * webhook traffic). This is deliberate: it means workspace-level "bring
 * your own gateway" payments must be verified server-side via
 * verifyTransaction using the workspace's own key at initialize/return
 * time, not via the shared webhook endpoint.
 */
export function getPlatformWebhookProvider(
  key: 'PAYSTACK' | 'FLUTTERWAVE',
): PaymentGatewayProvider {
  const env = parseApiEnv();
  if (key === 'PAYSTACK') {
    if (!env.PAYSTACK_SECRET_KEY)
      throw new AppError('CONFLICT', 'Paystack is not configured on this platform');
    return new PaystackProvider(env.PAYSTACK_SECRET_KEY);
  }
  if (!env.FLUTTERWAVE_SECRET_KEY || !env.FLUTTERWAVE_WEBHOOK_SECRET_HASH) {
    throw new AppError('CONFLICT', 'Flutterwave is not configured on this platform');
  }
  return new FlutterwaveProvider(
    env.FLUTTERWAVE_SECRET_KEY,
    env.FLUTTERWAVE_WEBHOOK_SECRET_HASH,
    (currency) => getCurrency(currency).minorUnitDigits,
  );
}
