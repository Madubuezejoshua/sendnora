import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@invoicetap/database';
import { AppError } from '@invoicetap/shared';
import { enforce, RateLimitedError } from './limits.js';
import { hashKey, parseBearerKey, type ApiScope } from './keys.js';
import './context.js';

const LAST_USED_REFRESH_MS = 60_000;

/**
 * Authenticates a merchant backend with its Sendnaro API key and attaches the tenant context.
 * The tenant and environment come ONLY from the key record: no body/query/header can override them.
 * Authorization (scope, suspension) is decided before any handler side effect runs.
 */
export function requireApiKey(scope: ApiScope | null) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = parseBearerKey(req.headers.authorization);
      if (!parsed) throw new AppError('UNAUTHENTICATED', 'Missing or malformed API key');

      const record = await prisma.apiKey.findUnique({
        where: { hashedKey: hashKey(parsed.key) },
        include: { workspace: { select: { id: true, deletedAt: true, suspendedAt: true } } },
      });
      if (
        !record ||
        record.revokedAt ||
        (record.expiresAt && record.expiresAt <= new Date()) ||
        record.environment !== parsed.environment || // prefix and record must agree
        record.workspace.deletedAt
      ) {
        throw new AppError('UNAUTHENTICATED', 'Invalid API key');
      }
      if (record.workspace.suspendedAt) {
        throw new AppError('BUSINESS_SUSPENDED', 'This business account is suspended');
      }
      if (scope && !record.scopes.includes(scope)) {
        throw new AppError('INSUFFICIENT_SCOPE', `This API key lacks the "${scope}" scope`);
      }

      await enforce(`key:${record.id}`, record.rateLimitPerMinute, 60, 'requests');

      if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
        await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
      }

      req.sn = {
        workspaceId: record.workspaceId,
        environment: record.environment,
        apiKeyId: record.id,
        scopes: record.scopes,
        requestId: String(req.id ?? ''),
        ip: req.ip ?? 'unknown',
      };
      next();
    } catch (err) {
      if (err instanceof RateLimitedError) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      next(err);
    }
  };
}
