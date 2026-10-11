/**
 * Integration test helpers. These tests exercise the real Express app
 * against a real Postgres database — they need `DATABASE_URL` pointed at a
 * disposable database with migrations applied. See TESTING.md:
 *
 *   docker compose up -d
 *   npm run db:migrate:deploy --workspace=@sendnaro/database
 *   npm test --workspace=@sendnaro/api
 *
 * We bypass Auth.js entirely here (it lives in apps/web) and mint API
 * tokens directly with signApiToken, exactly as apps/web would after
 * validating a session — this is the same trust boundary the real app
 * uses, just without a browser in the loop.
 */
import { randomUUID } from 'node:crypto';
import { signApiToken } from '@sendnaro/shared/server/api-token';
import { prisma } from '@sendnaro/database';
import { hashPassword } from '@sendnaro/database/password';
import { createApp } from '../../src/app.js';
import { parseApiEnv } from '@sendnaro/config/env';

export function getTestEnv() {
  return parseApiEnv();
}

export function buildTestApp() {
  return createApp(getTestEnv());
}

export async function createTestUser(
  overrides: { email?: string; isPlatformAdmin?: boolean } = {},
) {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;
  const passwordHash = await hashPassword('TestPassword123!');
  return prisma.user.create({
    data: {
      email,
      name: 'Test User',
      passwordHash,
      emailVerified: new Date(),
      isPlatformAdmin: overrides.isPlatformAdmin ?? false,
    },
  });
}

export async function createTestWorkspace(
  ownerId: string,
  overrides: { name?: string; planCode?: string } = {},
) {
  const workspace = await prisma.workspace.create({
    data: {
      slug: `test-ws-${randomUUID()}`,
      name: overrides.name ?? 'Test Workspace',
      ownerId,
      countryCode: 'NG',
      timezone: 'Africa/Lagos',
      defaultCurrency: 'NGN',
      members: { create: { userId: ownerId, role: 'WORKSPACE_OWNER', joinedAt: new Date() } },
      businessProfile: { create: { displayName: 'Test Workspace' } },
      subscription: {
        create: {
          planCode: overrides.planCode ?? 'BUSINESS',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          provider: 'MANUAL',
        },
      },
    },
  });
  return workspace;
}

export async function mintToken(
  userId: string,
  activeWorkspaceId?: string,
  isPlatformAdmin = false,
) {
  const env = getTestEnv();
  return signApiToken({ sub: userId, activeWorkspaceId, isPlatformAdmin }, env.API_TOKEN_SECRET);
}

/** Convenience: creates a user + workspace + a ready-to-use bearer token in one call. */
export async function setupWorkspaceContext(overrides: { planCode?: string } = {}) {
  const user = await createTestUser();
  const workspace = await createTestWorkspace(user.id, overrides);
  const token = await mintToken(user.id, workspace.id);
  return { user, workspace, token };
}
