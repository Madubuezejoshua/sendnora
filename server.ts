import 'dotenv/config';
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

  // Serve semantic HTML directly to Meta's non-JS crawler so Privacy Policy,
  // Terms of Service, and Data Deletion URLs validate reliably in Meta App Settings.
  const LEGAL_BOT_PAGES: Record<string, { title: string; body: string }> = {
    '/privacy': {
      title: 'Privacy Policy — Sendnaro',
      body: '<h1>Sendnaro Privacy Policy</h1><p>Sendnaro provides business messaging APIs for automated WhatsApp invoices, receipts, OTP verification, and transactional notifications. We collect business account details, recipient phone numbers required to deliver requested transactional messages, and encrypted WhatsApp Cloud API credentials (AES-256-GCM). We never sell user data or use customer messaging data for advertising. To request deletion of your account or phone number data, visit /data-deletion or email privacy@sendnaro.com.</p>',
    },
    '/privacy-policy': {
      title: 'Privacy Policy — Sendnaro',
      body: '<h1>Sendnaro Privacy Policy</h1><p>Sendnaro provides business messaging APIs for automated WhatsApp invoices, receipts, OTP verification, and transactional notifications. We collect business account details, recipient phone numbers required to deliver requested transactional messages, and encrypted WhatsApp Cloud API credentials (AES-256-GCM). We never sell user data or use customer messaging data for advertising. To request deletion of your account or phone number data, visit /data-deletion or email privacy@sendnaro.com.</p>',
    },
    '/terms': {
      title: 'Terms of Service — Sendnaro',
      body: '<h1>Sendnaro Terms of Service</h1><p>By using Sendnaro, you agree to send only consented transactional invoices, receipts, OTP codes, and account updates in compliance with WhatsApp Business Messaging Policies. Unsolicited spam or abuse is prohibited.</p>',
    },
    '/data-deletion': {
      title: 'User Data Deletion — Sendnaro',
      body: '<h1>Sendnaro User Data Deletion</h1><p>To disconnect WhatsApp credentials or delete your Sendnaro account and associated phone number data, remove your channel in Console Settings or email privacy@sendnaro.com with subject Data Deletion Request. Verified requests are completed within 7 business days.</p>',
    },
  };

  app.get(['/privacy', '/privacy-policy', '/terms', '/data-deletion'], (req, res, next) => {
    const ua = String(req.headers['user-agent'] || '');
    if (/facebookexternalhit|Facebot|Meta-ExternalAgent|WhatsApp/i.test(ua)) {
      const normalizedPath = req.path.replace(/\/+$/, '') || '/privacy';
      const legal = LEGAL_BOT_PAGES[normalizedPath] ?? LEGAL_BOT_PAGES['/privacy']!;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${legal.title}</title></head><body>${legal.body}</body></html>`,
      );
      return;
    }
    next();
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
