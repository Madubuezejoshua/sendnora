import type { NextFunction, Request, Response } from 'express';
import { verifyApiToken } from '@sendnaro/shared/server/api-token';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';

/**
 * Verifies the short-lived API token minted by apps/web (see
 * packages/shared/src/server/api-token.ts for the full trust-boundary
 * design). Populates `req.auth` with the userId and platform-admin flag.
 * Does NOT establish a workspace context — see workspace-context.ts for
 * that, which additionally re-checks membership against the database on
 * every request rather than trusting the token's workspace claim alone
 * for anything beyond "which workspace did the user have active".
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHENTICATED', 'Missing bearer token'));
    return;
  }

  const token = header.slice('Bearer '.length);
  const env = parseApiEnv();

  try {
    const claims = await verifyApiToken(token, env.API_TOKEN_SECRET);
    req.auth = {
      userId: claims.sub,
      isPlatformAdmin: claims.isPlatformAdmin,
      activeWorkspaceId: claims.activeWorkspaceId,
    };
    next();
  } catch {
    next(new AppError('UNAUTHENTICATED', 'Invalid or expired session'));
  }
}
