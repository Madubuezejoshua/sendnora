import { describe, expect, it } from 'vitest';
import { roleHasPermission } from './roles.js';

describe('roleHasPermission', () => {
  it('grants VIEWER read-only access', () => {
    expect(roleHasPermission('VIEWER', 'invoice:read')).toBe(true);
    expect(roleHasPermission('VIEWER', 'invoice:write')).toBe(false);
    expect(roleHasPermission('VIEWER', 'workspace:manage')).toBe(false);
  });

  it('grants STAFF write access but not deletion or workspace management', () => {
    expect(roleHasPermission('STAFF', 'invoice:write')).toBe(true);
    expect(roleHasPermission('STAFF', 'invoice:delete')).toBe(false);
    expect(roleHasPermission('STAFF', 'workspace:manage')).toBe(false);
  });

  it('grants WORKSPACE_OWNER every permission including ownership transfer', () => {
    expect(roleHasPermission('WORKSPACE_OWNER', 'workspace:transfer_ownership')).toBe(true);
    expect(roleHasPermission('WORKSPACE_OWNER', 'invoice:delete')).toBe(true);
  });

  it('denies WORKSPACE_ADMIN the ownership-transfer permission', () => {
    expect(roleHasPermission('WORKSPACE_ADMIN', 'workspace:transfer_ownership')).toBe(false);
    expect(roleHasPermission('WORKSPACE_ADMIN', 'invoice:delete')).toBe(true);
  });

  it('grants ACCOUNTANT payment and report access but not customer deletion', () => {
    expect(roleHasPermission('ACCOUNTANT', 'payment:refund')).toBe(true);
    expect(roleHasPermission('ACCOUNTANT', 'report:read')).toBe(true);
    expect(roleHasPermission('ACCOUNTANT', 'customer:delete')).toBe(false);
  });
});
