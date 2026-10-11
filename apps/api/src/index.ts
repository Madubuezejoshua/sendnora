import { parseApiEnv } from '@invoicetap/config/env';
import { prisma } from '@invoicetap/database';
import { createApp } from './app.js';
import { logger } from './config/logger.js';

const env = parseApiEnv();
const app = createApp(env);

const server = app.listen(env.API_PORT, () => {
  logger.info(`InvoiceTap API listening on port ${env.API_PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
    }
    await prisma.$disconnect();
    process.exit(err ? 1 : 0);
  });

  // Force-exit if graceful shutdown hangs.
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
