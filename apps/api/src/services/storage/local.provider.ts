import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseApiEnv } from '@sendnaro/config/env';
import type { PutObjectParams, StorageProviderAdapter } from './provider.interface.js';

/**
 * Local filesystem storage for development, so file upload/download flows
 * (logos, PDFs, expense receipts) work with zero external setup. Files
 * live under .dev-storage/ (gitignored) and are served back through
 * GET /api/v1/files/local/:key — see modules/files/files.routes.ts.
 */
export class LocalStorageProvider implements StorageProviderAdapter {
  private readonly rootDir = path.resolve(process.cwd(), '.dev-storage');

  async putObject(params: PutObjectParams): Promise<void> {
    const filePath = this.resolveSafePath(params.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, params.body);
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    const env = parseApiEnv();
    return `${env.NEXT_PUBLIC_APP_URL}/api/v1/files/local/${encodeURIComponent(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveSafePath(key);
    await rm(filePath, { force: true });
  }

  async readObject(key: string): Promise<Buffer> {
    return readFile(this.resolveSafePath(key));
  }

  /** Rejects any key that would resolve outside rootDir (path traversal guard). */
  private resolveSafePath(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }
}
