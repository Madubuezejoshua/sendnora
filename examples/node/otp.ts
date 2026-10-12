import { sendnaro, SendnaroError, type SendnaroConfig } from './client';

/** Step 1 (your backend): the customer typed their WhatsApp number on your site. */
export async function startPhoneVerification(
  config: SendnaroConfig,
  phone: string,
  customerRef: string,
) {
  const { body } = await sendnaro<{ id: string; expires_at: string; resend_available_at?: string }>(
    config,
    'POST',
    '/otp/challenges',
    {
      phone,
      purpose: 'phone_verification', // allow-listed: login | phone_verification | transaction_confirmation | account_recovery
      customer_ref: customerRef,
    },
  );
  // The response never contains the code. Return only the challenge id to your front end.
  return { challengeId: body.id, expiresAt: body.expires_at };
}

/**
 * Step 2 (your backend): the customer typed the code they received on WhatsApp.
 * Only a successful result here may complete the action on your side.
 *
 * Note: this proves access to that WhatsApp number. It does not prove identity and it does not
 * verify an email address; verify email addresses by email.
 */
export async function confirmPhoneVerification(
  config: SendnaroConfig,
  challengeId: string,
  phone: string,
  code: string,
) {
  try {
    await sendnaro(config, 'POST', `/otp/challenges/${challengeId}/verify`, {
      code,
      phone,
      purpose: 'phone_verification',
    });
    return { verified: true as const };
  } catch (err) {
    if (
      err instanceof SendnaroError &&
      ['otp_invalid', 'otp_expired', 'otp_locked'].includes(err.code)
    ) {
      return { verified: false as const, reason: err.code, message: err.message };
    }
    throw err;
  }
}

/** Sandbox only: read the code a simulated phone "received". Unavailable with live keys. */
export async function readSandboxInbox(config: SendnaroConfig, phone: string) {
  const { body } = await sendnaro<{ messages: { challenge_id: string; code: string }[] }>(
    config,
    'GET',
    `/sandbox/otp-inbox?phone=${encodeURIComponent(phone)}`,
  );
  return body.messages;
}
