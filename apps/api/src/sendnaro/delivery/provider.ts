import type { ApiEnvironment, DeliveryChannel, DeliveryKind } from '@sendnaro/database';

/** Result of one provider call. The engine, not the provider, decides what to do next. */
export type ProviderOutcome =
  | { kind: 'accepted'; providerMessageId: string; simulated?: boolean }
  | { kind: 'transient'; code: string; message: string; retryAfterSeconds?: number }
  | { kind: 'throttled'; code: string; message: string; retryAfterSeconds: number }
  | { kind: 'permanent'; code: string; message: string }
  // The provider may or may not have accepted the message (timeout after the request left us).
  | { kind: 'ambiguous'; code: string; message: string };

export interface SendRequest {
  deliveryId: string;
  workspaceId: string;
  environment: ApiEnvironment;
  channel: DeliveryChannel;
  kind: DeliveryKind;
  toAddress: string;
  templateKey: string;
  attemptNo: number;
  scenario: string | null;
  /** OTP code, computed just-in-time. Never persisted or logged. */
  otpCode?: string;
  /** Plain text body (notifications, Telegram messages). */
  text?: string;
  /** Short-lived link to the private invoice PDF. */
  document?: { url: string; filename: string; caption: string };
}

export interface ChannelProvider {
  readonly name: string;
  send(req: SendRequest): Promise<ProviderOutcome>;
}

type Override = (req: SendRequest) => Promise<ProviderOutcome> | ProviderOutcome;
let override: Override | null = null;

/**
 * Test seam: replaces ONLY the provider boundary for LIVE sends (the real auth, entitlement gate,
 * outbox, state machine and webhooks still run). Production code never calls this.
 */
export function setLiveProviderOverride(fn: Override | null): void {
  override = fn;
}

export function getLiveProviderOverride(): Override | null {
  return override;
}
