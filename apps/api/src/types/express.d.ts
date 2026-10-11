import type { WorkspaceRole } from '@sendnaro/shared';

export interface AuthContext {
  userId: string;
  isPlatformAdmin: boolean;
  activeWorkspaceId?: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      workspace?: WorkspaceContext;
    }
  }
}

export {};
