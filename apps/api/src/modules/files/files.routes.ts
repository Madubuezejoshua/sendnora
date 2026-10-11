import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '@invoicetap/shared';
import { prisma } from '@invoicetap/database';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import {
  FileValidationError,
  getStorageProvider,
  validateAndStoreUpload,
} from '../../services/storage/storage.service.js';
import { LocalStorageProvider } from '../../services/storage/local.provider.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const filesRouter = Router();
filesRouter.use(requireAuth, requireWorkspace);

filesRouter.post(
  '/files',
  requirePermission('settings:write'),
  upload.single('file'),
  validateBody(
    z.object({ kind: z.enum(['LOGO', 'INVOICE_ATTACHMENT', 'EXPENSE_RECEIPT', 'OTHER']) }),
  ),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('VALIDATION_ERROR', 'No file uploaded');
      const asset = await validateAndStoreUpload({
        workspaceId: req.workspace!.workspaceId,
        kind: req.body.kind,
        buffer: req.file.buffer,
        declaredMimeType: req.file.mimetype,
        originalFilename: req.file.originalname,
        uploadedById: req.auth!.userId,
      });
      const url = await getStorageProvider().getSignedDownloadUrl(asset.objectKey);
      res.status(201).json({ data: { ...asset, url } });
    } catch (err) {
      if (err instanceof FileValidationError) {
        next(new AppError('VALIDATION_ERROR', err.message));
        return;
      }
      next(err);
    }
  },
);

filesRouter.get(
  '/files/:fileId/download-url',
  requirePermission('settings:read'),
  async (req, res, next) => {
    try {
      const asset = await prisma.fileAsset.findFirst({
        where: { id: req.params.fileId!, workspaceId: req.workspace!.workspaceId },
      });
      if (!asset) throw new AppError('NOT_FOUND', 'File not found');
      const url = await getStorageProvider().getSignedDownloadUrl(asset.objectKey);
      res.json({ data: { url } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Local-development-only file server, used when STORAGE_PROVIDER=local so
 * the "signed URL" returned by LocalStorageProvider resolves to something
 * real. Not mounted behind auth because in dev the "signed URL" already
 * encodes the random object key — acceptable for local development only;
 * production always uses B2's real signed URLs instead of this route.
 */
export const localFilesRouter = Router();
localFilesRouter.get('/files/local/:key(*)', async (req, res, next) => {
  try {
    const provider = getStorageProvider();
    if (!(provider instanceof LocalStorageProvider)) {
      next(new AppError('NOT_FOUND', 'Not found'));
      return;
    }
    const buffer = await provider.readObject(decodeURIComponent(req.params.key!));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
