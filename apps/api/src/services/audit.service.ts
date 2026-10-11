import { prisma, type Prisma } from '@invoicetap/database';

export interface AuditLogInput {
  workspaceId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/** Fire-and-forget audit log write. Never throws — an audit failure must not fail the underlying action. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress,
      },
    });
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}
