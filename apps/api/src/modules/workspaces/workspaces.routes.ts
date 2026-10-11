import { Router } from 'express';
import {
  acceptInvitationSchema,
  AppError,
  createWorkspaceSchema,
  inviteMemberSchema,
  transferOwnershipSchema,
  updateBusinessProfileSchema,
  updateMemberRoleSchema,
  updateWorkspaceSettingsSchema,
} from '@invoicetap/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { writeAuditLog } from '../../services/audit.service.js';
import { prisma } from '@invoicetap/database';
import * as workspacesService from './workspaces.service.js';

export const workspacesRouter = Router();

workspacesRouter.use(requireAuth);

workspacesRouter.post(
  '/workspaces',
  validateBody(createWorkspaceSchema),
  async (req, res, next) => {
    try {
      const workspace = await workspacesService.createWorkspace(req.auth!.userId, req.body);
      await writeAuditLog({
        workspaceId: workspace.id,
        actorUserId: req.auth!.userId,
        action: 'workspace.created',
        entityType: 'Workspace',
        entityId: workspace.id,
      });
      res.status(201).json({ data: workspace });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.get('/workspaces/mine', async (req, res, next) => {
  try {
    const workspaces = await workspacesService.listMyWorkspaces(req.auth!.userId);
    res.json({ data: workspaces });
  } catch (err) {
    next(err);
  }
});

workspacesRouter.get('/workspaces/:workspaceId', requireWorkspace, async (req, res, next) => {
  try {
    const workspace = await workspacesService.getWorkspace(req.workspace!.workspaceId);
    res.json({ data: workspace });
  } catch (err) {
    next(err);
  }
});

workspacesRouter.patch(
  '/workspaces/:workspaceId/settings',
  requireWorkspace,
  requirePermission('workspace:manage'),
  validateBody(updateWorkspaceSettingsSchema),
  async (req, res, next) => {
    try {
      const workspace = await workspacesService.updateWorkspaceSettings(
        req.workspace!.workspaceId,
        req.body,
      );
      res.json({ data: workspace });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.patch(
  '/workspaces/:workspaceId/business-profile',
  requireWorkspace,
  requirePermission('workspace:manage'),
  validateBody(updateBusinessProfileSchema),
  async (req, res, next) => {
    try {
      const profile = await workspacesService.updateBusinessProfile(
        req.workspace!.workspaceId,
        req.body,
      );
      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.get(
  '/workspaces/:workspaceId/members',
  requireWorkspace,
  requirePermission('settings:read'),
  async (req, res, next) => {
    try {
      res.json({ data: await workspacesService.listMembers(req.workspace!.workspaceId) });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.patch(
  '/workspaces/:workspaceId/members/:memberId',
  requireWorkspace,
  requirePermission('workspace:invite'),
  validateBody(updateMemberRoleSchema),
  async (req, res, next) => {
    try {
      const member = await workspacesService.updateMemberRole(
        req.workspace!.workspaceId,
        req.params.memberId!,
        req.body.role,
      );
      res.json({ data: member });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.delete(
  '/workspaces/:workspaceId/members/:memberId',
  requireWorkspace,
  requirePermission('workspace:remove_member'),
  async (req, res, next) => {
    try {
      await workspacesService.removeMember(
        req.workspace!.workspaceId,
        req.params.memberId!,
        req.auth!.userId,
      );
      await writeAuditLog({
        workspaceId: req.workspace!.workspaceId,
        actorUserId: req.auth!.userId,
        action: 'workspace.member_removed',
        entityType: 'WorkspaceMember',
        entityId: req.params.memberId,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.post(
  '/workspaces/:workspaceId/invitations',
  requireWorkspace,
  requirePermission('workspace:invite'),
  validateBody(inviteMemberSchema),
  async (req, res, next) => {
    try {
      const invite = await workspacesService.inviteMember(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.body,
      );
      // Email delivery is dispatched by the caller (apps/web) via the email service using this invite's token.
      res.status(201).json({ data: invite });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.get(
  '/workspaces/:workspaceId/invitations',
  requireWorkspace,
  requirePermission('workspace:invite'),
  async (req, res, next) => {
    try {
      res.json({ data: await workspacesService.listInvitations(req.workspace!.workspaceId) });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.delete(
  '/workspaces/:workspaceId/invitations/:invitationId',
  requireWorkspace,
  requirePermission('workspace:invite'),
  async (req, res, next) => {
    try {
      await workspacesService.revokeInvitation(
        req.workspace!.workspaceId,
        req.params.invitationId!,
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.post(
  '/invitations/accept',
  validateBody(acceptInvitationSchema),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
      if (!user) throw new Error('User not found');
      const member = await workspacesService.acceptInvitation(
        req.auth!.userId,
        user.email,
        req.body.token,
      );
      res.json({ data: member });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.post(
  '/workspaces/:workspaceId/transfer-ownership',
  requireWorkspace,
  requirePermission('workspace:transfer_ownership'),
  validateBody(transferOwnershipSchema),
  async (req, res, next) => {
    try {
      const workspace = await workspacesService.transferOwnership(
        req.workspace!.workspaceId,
        req.auth!.userId,
        req.body.newOwnerMemberId,
        req.body.currentPassword,
      );
      await writeAuditLog({
        workspaceId: req.workspace!.workspaceId,
        actorUserId: req.auth!.userId,
        action: 'workspace.ownership_transferred',
        entityType: 'Workspace',
        entityId: workspace.id,
      });
      res.json({ data: workspace });
    } catch (err) {
      next(err);
    }
  },
);

workspacesRouter.delete(
  '/workspaces/:workspaceId/members/me',
  requireWorkspace,
  async (req, res, next) => {
    try {
      if (req.workspace!.role === 'WORKSPACE_OWNER') {
        throw new AppError('FORBIDDEN', 'Transfer ownership before leaving the workspace');
      }
      await prisma.workspaceMember.update({
        where: {
          workspaceId_userId: { workspaceId: req.workspace!.workspaceId, userId: req.auth!.userId },
        },
        data: { removedAt: new Date() },
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
