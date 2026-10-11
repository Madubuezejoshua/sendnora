import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { signApiToken } from '@invoicetap/shared/server/api-token';
import {
  buildTestApp,
  createTestUser,
  getTestEnv,
  mintToken,
  setupWorkspaceContext,
} from './setup.js';

describe('authentication', () => {
  it('rejects requests with no Authorization header', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/legacy/v1/customers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed bearer token', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .get('/api/legacy/v1/customers')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const app = buildTestApp();
    const { user, workspace } = await setupWorkspaceContext();
    const expiredToken = await signApiToken(
      { sub: user.id, activeWorkspaceId: workspace.id, isPlatformAdmin: false },
      getTestEnv().API_TOKEN_SECRET,
      -60,
    );
    const res = await request(app)
      .get('/api/legacy/v1/customers')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and grants workspace context', async () => {
    const app = buildTestApp();
    const { token } = await setupWorkspaceContext();
    const res = await request(app).get('/api/legacy/v1/customers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rejects platform-admin-only routes for a non-admin user', async () => {
    const app = buildTestApp();
    const { token } = await setupWorkspaceContext();
    const res = await request(app)
      .get('/api/console/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows platform-admin-only routes for a platform admin', async () => {
    const app = buildTestApp();
    const admin = await createTestUser({ isPlatformAdmin: true });
    const token = await mintToken(admin.id, undefined, true);
    const res = await request(app)
      .get('/api/console/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
