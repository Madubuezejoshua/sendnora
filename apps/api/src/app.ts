import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import type { ApiEnv } from '@invoicetap/config/env';
import { logger } from './config/logger.js';
import { healthRouter } from './modules/health/health.routes.js';
import { paymentsWebhookRouter } from './modules/payments/payments.routes.js';
import { whatsappWebhookRouter } from './modules/whatsapp/whatsapp-webhook.routes.js';
import { apiV1Router } from './routes.js';
import { standardRateLimit } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createApp(env: ApiEnv): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // The API serves JSON/PDF only — no HTML pages that would need a CSP.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }),
  );

  app.use(compression());

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id = typeof existing === 'string' ? existing : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );

  // Webhook routes MUST be mounted before express.json() — they parse the raw body themselves for signature verification.
  app.use('/api/v1', paymentsWebhookRouter);
  app.use('/api/v1', whatsappWebhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(healthRouter);

  app.use('/api/v1', standardRateLimit, apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
