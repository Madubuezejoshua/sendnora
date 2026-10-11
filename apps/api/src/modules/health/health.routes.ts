import { Router } from 'express';
import { prisma } from '@sendnaro/database';

export const healthRouter = Router();

/** Liveness — process is up. No dependencies checked, so this never false-negatives during a slow DB. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/** Readiness — safe to receive traffic (can reach the database). Used by the platform's load balancer / Railway healthcheck. */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});
