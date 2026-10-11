import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { prisma } from '@sendnaro/database';
import { hashPassword } from '@sendnaro/database/password';

export const PASSWORD = 'E2eTestPassword123!';

/** A verified owner with a business, created directly in the database (the register UI has its own spec). */
export async function createOwner(opts: { name?: string; platformAdmin?: boolean } = {}) {
  const email = `e2e-${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: opts.name ?? 'E2E Owner',
      passwordHash: await hashPassword(PASSWORD),
      emailVerified: new Date(),
      isPlatformAdmin: opts.platformAdmin ?? false,
    },
  });
  const workspace = await prisma.workspace.create({
    data: {
      slug: `e2e-${randomUUID()}`,
      name: opts.name ? `${opts.name} Co` : 'E2E Business',
      ownerId: user.id,
      countryCode: 'NG',
      timezone: 'Africa/Lagos',
      defaultCurrency: 'NGN',
      onboardingCompletedAt: new Date(),
      members: { create: { userId: user.id, role: 'WORKSPACE_OWNER', joinedAt: new Date() } },
      businessProfile: { create: { displayName: opts.name ? `${opts.name} Co` : 'E2E Business', contactEmail: 'owner@example.com' } },
    },
  });
  return { user, workspace, email };
}

export async function signIn(page: Page, email: string, password = PASSWORD, landing: RegExp = /\/(console|admin)/) {
  await page.goto('/login', { waitUntil: 'networkidle' }); // let React hydrate before submitting
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(landing, { timeout: 60_000 });
}

/** The dev email sink writes each message to apps/web/.dev-emails (see lib/auth-email.ts). */
export async function readLatestEmail(to: string, timeoutMs = 20_000): Promise<string> {
  const dir = path.resolve(process.cwd(), '.dev-emails');
  const safe = to.replace(/[^a-zA-Z0-9@._-]/g, '_');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(`-${safe}.txt`)).sort() : [];
    if (files.length) return fs.readFileSync(path.join(dir, files[files.length - 1]!), 'utf8');
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email captured for ${to}`);
}

export const OBSOLETE_BRANDS = /invoice\s?tap|invoice\s?snap|invoice\s?map|tap\s?relay|tapvello|senaro/i;
