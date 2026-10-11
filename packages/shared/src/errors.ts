/**
 * Typed application error codes shared between the API (which throws/maps
 * these) and the web client (which switches on them for friendly copy).
 * The HTTP status is derived from the code via `ERROR_STATUS_MAP` so a new
 * error code can't accidentally ship without a status.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PLAN_LIMIT_EXCEEDED',
  'INVALID_STATE_TRANSITION',
  'IDEMPOTENCY_CONFLICT',
  'PAYMENT_VERIFICATION_FAILED',
  'WEBHOOK_SIGNATURE_INVALID',
  'STORAGE_ERROR',
  'INTERNAL_ERROR',
  // Sendnaro v1 API
  'ACTIVATION_REQUIRED',
  'SETUP_REQUIRED',
  'BUSINESS_SUSPENDED',
  'INSUFFICIENT_SCOPE',
  'SANDBOX_ONLY',
  'CONSENT_REQUIRED',
  'INVALID_PHONE',
  'LINK_NOT_ALLOWED',
  'UNPROCESSABLE',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_LOCKED',
  'ALREADY_LINKED',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PLAN_LIMIT_EXCEEDED: 402,
  INVALID_STATE_TRANSITION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PAYMENT_VERIFICATION_FAILED: 402,
  WEBHOOK_SIGNATURE_INVALID: 400,
  STORAGE_ERROR: 502,
  INTERNAL_ERROR: 500,
  ACTIVATION_REQUIRED: 403,
  SETUP_REQUIRED: 422,
  BUSINESS_SUSPENDED: 403,
  INSUFFICIENT_SCOPE: 403,
  SANDBOX_ONLY: 403,
  CONSENT_REQUIRED: 422,
  INVALID_PHONE: 422,
  LINK_NOT_ALLOWED: 422,
  UNPROCESSABLE: 422,
  OTP_INVALID: 422,
  OTP_EXPIRED: 422,
  OTP_LOCKED: 422,
  ALREADY_LINKED: 409,
  SERVICE_UNAVAILABLE: 503,
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS_MAP[code];
    this.fieldErrors = fieldErrors;
  }
}
