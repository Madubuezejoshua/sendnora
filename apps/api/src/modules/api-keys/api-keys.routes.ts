import { Router } from 'express';
import { createApiKeySchema } from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import * as apiKeyService from '../../services/api-key.service.js';

export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth, requireWorkspace);

apiKeysRouter.get('/api-keys', requirePermission('settings:read'), async (req, res, next) => {
  try {
    res.json({ data: await apiKeyService.listApiKeys(req.workspace!.workspaceId) });
  } catch (err) {
    next(err);
  }
});

apiKeysRouter.post(
  '/api-keys',
  requirePermission('settings:write'),
  validateBody(createApiKeySchema),
  async (req, res, next) => {
    try {
      const result = await apiKeyService.createApiKey(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.body.name,
      );
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

apiKeysRouter.post(
  '/api-keys/:id/revoke',
  requirePermission('settings:write'),
  async (req, res, next) => {
    try {
      await apiKeyService.revokeApiKey(req.workspace!.workspaceId, req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
