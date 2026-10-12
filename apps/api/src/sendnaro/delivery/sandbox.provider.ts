import type { ChannelProvider, ProviderOutcome, SendRequest } from './provider.js';

/**
 * Deterministic stand-in for WhatsApp/Telegram. It sits at the provider boundary only: everything
 * upstream (key auth, validation, outbox, state machine, webhooks) is the production code.
 * Results are always marked simulated; a sandbox send can never reach a real provider.
 *
 * Scenarios (set via the `scenario` request field; rejected for live keys):
 *   success             accepted immediately
 *   invalid_recipient   permanent failure (number is not on WhatsApp)
 *   temporary_failure   transient failure on attempts 1-2, then accepted
 *   permanent_failure   permanent provider rejection
 *   throttled           throttled on attempt 1 (retry-after 1s), then accepted
 *   delayed_callback    accepted; the "delivered" receipt arrives later
 *   duplicate_callback  accepted; the "delivered" receipt arrives twice
 *   ambiguous_timeout   attempt 1 times out after maybe accepting; a late receipt confirms delivery
 *   ambiguous_timeout_lost  same, but no receipt ever arrives (must NOT be re-sent)
 *   expired_otp         (OTP only) the challenge is created already expired
 */
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

export function isSandboxScenario(value: string): value is SandboxScenario {
  return (SANDBOX_SCENARIOS as readonly string[]).includes(value);
}

export const sandboxProvider: ChannelProvider = {
  name: 'sandbox',
  async send(req: SendRequest): Promise<ProviderOutcome> {
    const id = `sim_${req.deliveryId}`;
    switch (req.scenario ?? 'success') {
      case 'invalid_recipient':
        return {
          kind: 'permanent',
          code: 'invalid_recipient',
          message: 'Recipient is not reachable on this channel (simulated)',
        };
      case 'permanent_failure':
        return {
          kind: 'permanent',
          code: 'provider_rejected',
          message: 'Provider rejected the message (simulated)',
        };
      case 'temporary_failure':
        return req.attemptNo <= 2
          ? {
              kind: 'transient',
              code: 'provider_unavailable',
              message: 'Provider temporarily unavailable (simulated)',
            }
          : { kind: 'accepted', providerMessageId: id, simulated: true };
      case 'throttled':
        return req.attemptNo <= 1
          ? {
              kind: 'throttled',
              code: 'rate_limited',
              message: 'Provider throttled the request (simulated)',
              retryAfterSeconds: 1,
            }
          : { kind: 'accepted', providerMessageId: id, simulated: true };
      case 'ambiguous_timeout':
      case 'ambiguous_timeout_lost':
        return req.attemptNo <= 1
          ? {
              kind: 'ambiguous',
              code: 'provider_timeout',
              message: 'Request timed out; acceptance unknown (simulated)',
            }
          : { kind: 'accepted', providerMessageId: id, simulated: true };
      default:
        return { kind: 'accepted', providerMessageId: id, simulated: true };
    }
  },
};
