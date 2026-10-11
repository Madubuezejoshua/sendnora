import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@sendnaro/shared';
import { logger } from '../../config/logger.js';
import { RateLimitedError } from '../limits.js';

/**
 * v1 error contract: { error: { code, message, request_id, fields? } }. `code` is a stable,
 * machine-readable snake_case identifier; `message` is safe to show; internals are never exposed.
 */
export function v1ErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const request_id = String(req.id ?? '');
  const send = (status: number, code: string, message: string, fields?: Record<string, string[]>) => {
    res.status(status).json({ error: { code, message, request_id, ...(fields ? { fields } : {}) } });
  };

  if (err instanceof RateLimitedError) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
    return send(429, 'rate_limited', err.message);
  }
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, request_id }, 'v1 application error');
    return send(err.status, err.code.toLowerCase(), err.message, err.fieldErrors);
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_body';
      fields[key] = [...(fields[key] ?? []), issue.message];
    }
    return send(400, 'validation_error', 'The request body is invalid', fields);
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') return send(400, 'invalid_json', 'The request body is not valid JSON');
  if (e?.type === 'entity.too.large') return send(413, 'payload_too_large', 'The request body is too large');

  logger.error({ err, request_id }, 'v1 unexpected error');
  return send(500, 'internal_error', 'An unexpected error occurred');
}

export function v1NotFound(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}`, request_id: String(req.id ?? '') },
  });
}
