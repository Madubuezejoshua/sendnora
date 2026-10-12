import type { ApiEnvironment } from '@sendnaro/database';

export interface SnContext {
  workspaceId: string;
  environment: ApiEnvironment;
  /** Absent for events that arrive through a signed payment source rather than an API key. */
  apiKeyId?: string;
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
