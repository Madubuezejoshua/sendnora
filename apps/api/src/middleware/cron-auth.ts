import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';

/**
 * Protects scheduled-job endpoints (recurring invoice generation, reminder
 * dispatch, overdue sweep). These are triggered by an external scheduler
 * (Railway cron, GitHub Actions schedule, or any HTTP-capable cron) hitting
 * the endpoint with `Authorization: Bearer <CRON_SECRET>` — there is no
 * user session involved. Constant-time comparison avoids leaking the
 * secret's length/prefix via response-time side channels.
 */
export function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const env = parseApiEnv();

  if (!provided || !safeCompare(provided, env.CRON_SECRET)) {
    next(new AppError('UNAUTHENTICATED', 'Invalid cron secret'));
    return;
  }
  next();
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
