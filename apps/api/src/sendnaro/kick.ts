import { waitUntil } from '@vercel/functions';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { drainOutbox } from './outbox.js';

/**
 * On Vercel there is no always-on worker, so after answering a request that queued work we ask the
 * platform to keep the function alive (waitUntil) long enough to run this business's due jobs, which
 * gives near-immediate delivery. This is an OPTIMISATION, never the guarantee: the work is already
 * durable in the outbox and the /cron/outbox endpoint (or the in-process worker elsewhere) picks up
 * anything this call does not finish. Disabled outside Vercel so tests and local runs stay deterministic.
 */
export function kickAfterAccept(req: Request, res: Response, next: NextFunction): void {
  if (process.env.VERCEL) {
    res.on('finish', () => {
      if (req.method !== 'POST' || res.statusCode !== 202 || !req.sn) return;
      waitUntil(
        drainOutbox({ workspaceId: req.sn.workspaceId, limit: 10, maxRounds: 3 }).catch((err) =>
          logger.warn({ err }, 'post-accept outbox drain failed (cron will pick it up)'),
        ),
      );
    });
  }
  next();
}
