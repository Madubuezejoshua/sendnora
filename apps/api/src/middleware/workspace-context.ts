import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';

/**
 * Establishes tenant context for the request. The workspace id comes ONLY
 * from the verified API token's `activeWorkspaceId` claim (set by
 * requireAuth) — never from a route param, query string, or request body.
 * Every module's data-access code must use `req.workspace.workspaceId` as
 * the workspace filter; this is what makes cross-tenant access structurally
 * impossible rather than merely "usually checked".
 *
 * A route CAN additionally carry a :workspaceId param for readability in
 * the URL, but it is validated against req.workspace.workspaceId (see
 * requireMatchingWorkspaceParam) rather than trusted on its own.
 */
export async function requireWorkspace(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    next(new AppError('UNAUTHENTICATED', 'Missing auth context'));
    return;
  }

  const workspaceId = req.auth.activeWorkspaceId;
  if (!workspaceId) {
    next(new AppError('FORBIDDEN', 'No active workspace selected'));
    return;
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.auth.userId } },
  });

  if (!membership || membership.removedAt) {
    next(new AppError('FORBIDDEN', 'You are not a member of this workspace'));
    return;
  }

  req.workspace = { workspaceId, role: membership.role };
  next();
}

/** For routes that echo the workspace id in the URL for readability (e.g. /workspaces/:workspaceId/...). */
export function requireMatchingWorkspaceParam(paramName = 'workspaceId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const paramValue = req.params[paramName];
    if (!req.workspace || paramValue !== req.workspace.workspaceId) {
      next(new AppError('FORBIDDEN', 'Workspace mismatch'));
      return;
    }
    next();
  };
}
