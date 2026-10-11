import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@sendnaro/shared';

/** Server-side role check for sensitive console actions (keys, channel secrets, webhooks, profile). */
export function requireOwnerOrAdmin(req: Request, _res: Response, next: NextFunction): void {
  const role = req.workspace?.role;
  if (role !== 'WORKSPACE_OWNER' && role !== 'WORKSPACE_ADMIN') {
    next(new AppError('FORBIDDEN', 'Only the business owner or an admin can do this'));
    return;
  }
  next();
}
