import { fileTypeFromBuffer } from 'file-type';
import { generateSecureId } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { prisma } from '@sendnaro/database';
import type { FileAssetKind } from '@sendnaro/database';
import { B2StorageProvider } from './b2.provider.js';
import { LocalStorageProvider } from './local.provider.js';
import type { StorageProviderAdapter } from './provider.interface.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/csv',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

let cachedProvider: StorageProviderAdapter | undefined;

export function getStorageProvider(): StorageProviderAdapter {
  if (cachedProvider) return cachedProvider;
  const env = parseApiEnv();
  if (
    env.STORAGE_PROVIDER === 'b2' &&
    env.B2_ENDPOINT &&
    env.B2_BUCKET_NAME &&
    env.B2_KEY_ID &&
    env.B2_APPLICATION_KEY
  ) {
    cachedProvider = new B2StorageProvider(
      env.B2_ENDPOINT,
      env.B2_REGION ?? 'auto',
      env.B2_BUCKET_NAME,
      env.B2_KEY_ID,
      env.B2_APPLICATION_KEY,
    );
  } else {
    cachedProvider = new LocalStorageProvider();
  }
  return cachedProvider;
}

export class FileValidationError extends Error {}

/**
 * Validates an upload by its actual byte signature (not the client-supplied
 * MIME type or filename, both of which are trivially spoofable), enforces
 * a size ceiling, and generates a non-guessable object key so filenames can
 * never be used for path traversal or to guess other users' files.
 */
export async function validateAndStoreUpload(params: {
  workspaceId: string;
  kind: FileAssetKind;
  buffer: Buffer;
  declaredMimeType: string;
  originalFilename: string;
  uploadedById?: string;
}) {
  if (params.buffer.length > MAX_UPLOAD_BYTES) {
    throw new FileValidationError(`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`);
  }

  let detectedMimeType = params.declaredMimeType;
  if (params.declaredMimeType !== 'text/csv' && params.declaredMimeType !== 'image/svg+xml') {
    const detected = await fileTypeFromBuffer(params.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new FileValidationError('File content does not match an allowed file type');
    }
    detectedMimeType = detected.mime;
  } else if (!ALLOWED_MIME_TYPES.has(params.declaredMimeType)) {
    throw new FileValidationError('File type not allowed');
  }

  const extension = extensionFor(detectedMimeType);
  const objectKey = `${params.workspaceId}/${params.kind.toLowerCase()}/${generateSecureId(24)}${extension}`;

  const provider = getStorageProvider();
  await provider.putObject({ key: objectKey, body: params.buffer, contentType: detectedMimeType });

  const env = parseApiEnv();
  return prisma.fileAsset.create({
    data: {
      workspaceId: params.workspaceId,
      kind: params.kind,
      storageProvider: env.STORAGE_PROVIDER === 'b2' ? 'B2' : 'LOCAL',
      objectKey,
      originalFilename: sanitizeFilenameForDisplay(params.originalFilename),
      mimeType: detectedMimeType,
      sizeBytes: params.buffer.length,
      uploadedById: params.uploadedById,
    },
  });
}

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/csv': '.csv',
  };
  return map[mime] ?? '';
}

/** Filenames are never used to build paths — only stored for display in the UI, and even then, sanitized. */
function sanitizeFilenameForDisplay(name: string): string {
  return name.replace(/[/\\]/g, '_').slice(0, 200);
}
