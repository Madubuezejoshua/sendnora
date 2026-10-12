import { parseApiEnv } from '@sendnaro/config/env';
import { prisma } from '@sendnaro/database';
import { logger } from './config/logger.js';
import { startWorkerLoop } from './sendnaro/jobs.js';
import { runRetention } from './sendnaro/maintenance.js';

/**
 * Standalone outbox worker for deployments with a long-running process (a second Railway service, a VM,
 * `docker run`). It drains the outbox about once a second and runs retention cleanup every six hours.
 * Any number of workers can run side by side: jobs are claimed with FOR UPDATE SKIP LOCKED.
 */
parseApiEnv();
const stop = startWorkerLoop(1000);
const maintenance = setInterval(
  () =>
    runRetention()
      .then((r) => logger.info({ r }, 'Retention cleanup ran'))
      .catch((err) => logger.error({ err }, 'Retention cleanup failed')),
  6 * 3600_000,
);
logger.info('Sendnaro outbox worker running');

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, stopping worker`);
  stop();
  clearInterval(maintenance);
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
