import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type ApiErrorBody } from '@invoicetap/shared';
import { logger } from '../config/logger.js';
import { v1ErrorHandler } from '../sendnaro/v1/errors.js';

/**
 * Central error handler. Never leaks stack traces, Prisma internals, or raw
 * upstream provider responses to the client — only a typed error code plus
 * a safe message. Full detail is logged server-side, keyed by request id.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req.id as string | undefined) ?? undefined;

  // Body-parser failures happen before any router runs: answer with a client error, not a 500.
  const parserType = (err as { type?: string } | null)?.type;
  if (parserType === 'entity.parse.failed' || parserType === 'entity.too.large') {
    v1ErrorHandler(err, req, res, _next);
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, requestId }, 'Unhandled application error');
    }
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, requestId, fieldErrors: err.fieldErrors },
    };
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_root';
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    const body: ApiErrorBody = {
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', requestId, fieldErrors },
    };
    res.status(400).json(body);
    return;
  }

  // Prisma "record not found" style errors surface as generic 404s rather than leaking schema details.
  if (isPrismaKnownError(err) && err.code === 'P2025') {
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: 'Resource not found', requestId },
    };
    res.status(404).json(body);
    return;
  }
  if (isPrismaKnownError(err) && err.code === 'P2002') {
    const body: ApiErrorBody = {
      error: { code: 'CONFLICT', message: 'A record with this value already exists', requestId },
    };
    res.status(409).json(body);
    return;
  }

  logger.error({ err, requestId }, 'Unexpected error');
  const body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId },
  };
  res.status(500).json(body);
}

function isPrismaKnownError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
}
