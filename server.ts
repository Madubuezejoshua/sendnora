import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import {
  adminRouter,
  apiV1Router,
  authRouter,
  consoleRouter,
  publicRouter,
  sandboxRelayRouter,
} from './server/routes.ts';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers compatible with AI Studio iframe preview (frameguard disabled for iframe embedding)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Attach opaque request_id to every request & response
  app.use((req, res, next) => {
    const incoming = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].slice(0, 64) : '';
    const id = incoming && /^[A-Za-z0-9_.-]+$/.test(incoming) ? incoming : `req_${crypto.randomBytes(6).toString('hex')}`;
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  // Mount raw-body WhatsApp webhook before express.json()
  app.use('/api/v1', (req, res, next) => {
    if (req.path === '/webhooks/whatsapp' && req.method === 'POST') {
      apiV1Router(req, res, next);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sendnaro' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/v1', apiV1Router);
  app.use('/api/sandbox', sandboxRelayRouter);
  app.use('/api/console', consoleRouter);
  app.use('/api/admin', adminRouter);

  // Structured API 404 & error handlers (never leak stack traces)
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `No API route for ${req.method} ${req.path}`,
        request_id: req.requestId,
      },
    });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message =
      status < 500 && err instanceof Error ? err.message : 'An unexpected internal error occurred';
    res.status(status).json({
      error: {
        code: status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
        message,
        request_id: req.requestId,
      },
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sendnaro listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Sendnaro server:', err);
  process.exit(1);
});
