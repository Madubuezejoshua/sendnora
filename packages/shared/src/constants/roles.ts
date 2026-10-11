/**
 * RBAC roles and permission matrix.
 *
 * PLATFORM_* roles operate the admin panel and are not tied to a workspace.
 * All other roles are scoped to a single WorkspaceMember row. Authorization
 * MUST be enforced server-side in apps/api/src/middleware/authorize.ts —
 * this module only defines the data; hiding a button in the UI is not
 * authorization.
 */
export const PLATFORM_ROLES = ['PLATFORM_ADMIN', 'PLATFORM_SUPPORT'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const WORKSPACE_ROLES = [
  'WORKSPACE_OWNER',
  'WORKSPACE_ADMIN',
  'ACCOUNTANT',
  'STAFF',
  'VIEWER',
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type Permission =
  | 'workspace:manage' // settings, billing, deletion
  | 'workspace:invite'
  | 'workspace:remove_member'
  | 'workspace:transfer_ownership'
  | 'customer:read'
  | 'customer:write'
  | 'customer:delete'
  | 'product:read'
  | 'product:write'
  | 'product:delete'
  | 'quote:read'
  | 'quote:write'
  | 'quote:send'
  | 'quote:delete'
  | 'invoice:read'
  | 'invoice:write'
  | 'invoice:issue'
  | 'invoice:void'
  | 'invoice:delete'
  | 'payment:record'
  | 'payment:refund'
  | 'receipt:read'
  | 'expense:read'
  | 'expense:write'
  | 'report:read'
  | 'settings:read'
  | 'settings:write';

const OWNER_ADMIN_PERMISSIONS: Permission[] = [
  'workspace:manage',
  'workspace:invite',
  'workspace:remove_member',
  'workspace:transfer_ownership',
  'customer:read',
  'customer:write',
  'customer:delete',
  'product:read',
  'product:write',
  'product:delete',
  'quote:read',
  'quote:write',
  'quote:send',
  'quote:delete',
  'invoice:read',
  'invoice:write',
  'invoice:issue',
  'invoice:void',
  'invoice:delete',
  'payment:record',
  'payment:refund',
  'receipt:read',
  'expense:read',
  'expense:write',
  'report:read',
  'settings:read',
  'settings:write',
];

/** Ownership transfer is deliberately excluded even for WORKSPACE_ADMIN. */
const ADMIN_PERMISSIONS = OWNER_ADMIN_PERMISSIONS.filter(
  (p) => p !== 'workspace:transfer_ownership',
);

const ACCOUNTANT_PERMISSIONS: Permission[] = [
  'customer:read',
  'customer:write',
  'product:read',
  'product:write',
  'quote:read',
  'quote:write',
  'quote:send',
  'invoice:read',
  'invoice:write',
  'invoice:issue',
  'invoice:void',
  'payment:record',
  'payment:refund',
  'receipt:read',
  'expense:read',
  'expense:write',
  'report:read',
  'settings:read',
];

const STAFF_PERMISSIONS: Permission[] = [
  'customer:read',
  'customer:write',
  'product:read',
  'product:write',
  'quote:read',
  'quote:write',
  'quote:send',
  'invoice:read',
  'invoice:write',
  'invoice:issue',
  'payment:record',
  'receipt:read',
  'expense:read',
  'expense:write',
];

const VIEWER_PERMISSIONS: Permission[] = [
  'customer:read',
  'product:read',
  'quote:read',
  'invoice:read',
  'receipt:read',
  'expense:read',
  'report:read',
  'settings:read',
];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  WORKSPACE_OWNER: OWNER_ADMIN_PERMISSIONS,
  WORKSPACE_ADMIN: ADMIN_PERMISSIONS,
  ACCOUNTANT: ACCOUNTANT_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles allowed to change another member's role or remove them. */
export const MEMBER_MANAGEMENT_ROLES: WorkspaceRole[] = ['WORKSPACE_OWNER', 'WORKSPACE_ADMIN'];
