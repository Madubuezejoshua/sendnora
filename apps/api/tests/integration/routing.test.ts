import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './setup.js';

// Regression: routers with path-less `use(requireAuth)` used to shadow every router mounted after them.
describe('route mounting', () => {
  it('public document routes do not require auth', async () => {
    const res = await request(buildTestApp()).get('/api/v1/public/invoices/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('cron routes use the cron secret, not a user session', async () => {
    const app = buildTestApp();
    const denied = await request(app).post('/api/v1/cron/overdue-sweep');
    expect(denied.status).toBe(401);
    const ok = await request(app)
      .post('/api/v1/cron/overdue-sweep')
      .set('Authorization', `Bearer ${process.env.CRON_SECRET}`);
    expect(ok.status).toBe(200);
  });
});
