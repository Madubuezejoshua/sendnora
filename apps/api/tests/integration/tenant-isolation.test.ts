import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp, mintToken, setupWorkspaceContext } from './setup.js';

/**
 * Proves the core multi-tenancy guarantee: a member of workspace A cannot
 * read or modify workspace B's records, even when they know B's record
 * ids, because every query is filtered by the workspaceId derived from the
 * verified API token — never a client-supplied value.
 */
describe('tenant isolation', () => {
  it('cannot read another workspace customer by id', async () => {
    const app = buildTestApp();
    const workspaceA = await setupWorkspaceContext();
    const workspaceB = await setupWorkspaceContext();

    const createRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${workspaceB.token}`)
      .send({ type: 'INDIVIDUAL', name: 'Workspace B Customer' });
    expect(createRes.status).toBe(201);
    const customerId = createRes.body.data.id;

    const readRes = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${workspaceA.token}`);
    expect(readRes.status).toBe(404);
  });

  it('cannot update another workspace customer by id', async () => {
    const app = buildTestApp();
    const workspaceA = await setupWorkspaceContext();
    const workspaceB = await setupWorkspaceContext();

    const createRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${workspaceB.token}`)
      .send({ type: 'INDIVIDUAL', name: 'Workspace B Customer 2' });
    const customerId = createRes.body.data.id;

    const updateRes = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${workspaceA.token}`)
      .send({ name: 'Hijacked name' });
    expect(updateRes.status).toBe(404);
  });

  it('list endpoints never return another workspace rows', async () => {
    const app = buildTestApp();
    const workspaceA = await setupWorkspaceContext();
    const workspaceB = await setupWorkspaceContext();

    await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${workspaceB.token}`)
      .send({ type: 'INDIVIDUAL', name: 'B Only Customer' });

    const listRes = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${workspaceA.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.every((c: { name: string }) => c.name !== 'B Only Customer')).toBe(
      true,
    );
  });

  it('rejects a request whose bearer token has no active workspace claim', async () => {
    const app = buildTestApp();
    const { user } = await setupWorkspaceContext();
    const tokenWithoutWorkspace = await mintToken(user.id, undefined);

    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenWithoutWorkspace}`);
    expect(res.status).toBe(403);
  });
});
