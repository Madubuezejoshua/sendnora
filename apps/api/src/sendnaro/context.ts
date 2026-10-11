import type { ApiEnvironment } from '@sendnaro/database';

export interface SnContext {
  workspaceId: string;
  environment: ApiEnvironment;
  apiKeyId: string;
  scopes: string[];
  requestId: string;
  ip: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sn?: SnContext;
    }
  }
}

export {};
