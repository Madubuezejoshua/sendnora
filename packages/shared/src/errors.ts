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
