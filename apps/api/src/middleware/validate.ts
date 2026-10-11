import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Parses and replaces req.body/query/params with the validated (and
 * type-coerced/defaulted) result. Throws (via next) a ZodError on failure,
 * which the central error handler turns into a 400 VALIDATION_ERROR with
 * per-field messages — see middleware/error-handler.ts.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as unknown as Request['query'];
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as unknown as Request['params'];
      next();
    } catch (err) {
      next(err);
    }
  };
}
