export interface InitializeTransactionParams {
  reference: string;
  amountMinorUnits: number;
  currency: string;
  customerEmail: string;
  redirectUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  providerReference: string;
  raw: unknown;
}

export interface VerifyTransactionResult {
  successful: boolean;
  amountMinorUnits: number;
  currency: string;
  reference: string;
  paidAt: Date | null;
  raw: unknown;
}

/**
 * Every payment gateway integration implements this interface so
 * payments.service.ts never branches on "which provider" beyond selecting
 * the adapter. Webhook signature verification is intentionally a separate
 * method from event parsing: the raw body must be verified BEFORE it is
 * ever parsed as JSON/trusted.
 */
export interface PaymentGatewayProvider {
  readonly key: 'PAYSTACK' | 'FLUTTERWAVE';
  initializeTransaction(params: InitializeTransactionParams): Promise<InitializeTransactionResult>;
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  extractEventId(payload: Record<string, unknown>): string | undefined;
}
