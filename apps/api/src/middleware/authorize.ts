import type { NextFunction, Request, Response } from 'express';
import { AppError, roleHasPermission, type Permission } from '@sendnaro/shared';

/** Requires the caller's workspace role to have the given permission. Must run after requireWorkspace. */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.workspace) {
      next(new AppError('FORBIDDEN', 'No workspace context'));
      return;
    }
    if (!roleHasPermission(req.workspace.role, permission)) {
      next(new AppError('FORBIDDEN', `Missing permission: ${permission}`));
      return;
    }
    next();
  };
}

/** Requires the caller to be a platform admin (support staff use requirePlatformStaff for read-only areas). */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.isPlatformAdmin) {
    next(new AppError('FORBIDDEN', 'Platform admin access required'));
    return;
  }
  next();
}
