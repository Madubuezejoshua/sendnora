import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prisma } from '@invoicetap/database';
import { hashPassword } from '@invoicetap/database/password';

/**
 * End-to-end coverage of the core product loop: log in, create a customer,
 * create and issue an invoice, and confirm the public invoice link works.
 *
 * Fixture setup (user + workspace) goes through Prisma directly rather than
 * the real registration + email-verification flow — Playwright can't easily
 * intercept the dev email adapter's server-side console output, and this
 * keeps the test focused on what it's actually verifying (the authenticated
 * app flow) rather than re-testing email delivery, which auth.test.ts and
 * the manual registration flow already cover independently.
 *
 * Requires a running Postgres (DATABASE_URL) with migrations applied — see
 * TESTING.md. Not executed in the environment that produced this build (no
 * local database was available there); run it yourself before relying on it.
 */

const PASSWORD = 'E2eTestPassword123!';

test.describe('core invoice flow', () => {
  let email: string;

  test.beforeEach(async () => {
    email = `e2e-${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    const user = await prisma.user.create({
      data: { email, name: 'E2E Test User', passwordHash, emailVerified: new Date() },
    });
    await prisma.workspace.create({
      data: {
        slug: `e2e-ws-${randomUUID()}`,
        name: 'E2E Test Workspace',
        ownerId: user.id,
        countryCode: 'NG',
        timezone: 'Africa/Lagos',
        defaultCurrency: 'USD',
        onboardingCompletedAt: new Date(),
        members: { create: { userId: user.id, role: 'WORKSPACE_OWNER', joinedAt: new Date() } },
        businessProfile: { create: { displayName: 'E2E Test Workspace' } },
        subscription: {
          create: {
            planCode: 'BUSINESS',
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            provider: 'MANUAL',
          },
        },
      },
    });
  });

  test.afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { owner: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  test('user logs in, creates a customer, creates and issues an invoice', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' }); // let React hydrate before submitting
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // the workspace cookie is set by a redirect hop; wait for the dashboard shell before deep-linking
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    await page.goto('/customers/new');
    await page.getByLabel('Name').fill('Playwright Test Customer');
    await page.getByLabel('Email').fill('playwright-customer@example.com');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page).toHaveURL(/\/customers\/[a-z0-9]+/i);

    await page.goto('/invoices/new');
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Playwright Test Customer' }).click();
    await page.getByPlaceholder('Item description').fill('Website design');
    await page.getByLabel('Unit price').fill('1000');
    await page.getByLabel('Unit price').blur();
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(/\/invoices\/(?!new)[a-z0-9]+/i);
    await expect(page.getByText(/^draft$/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Issue invoice' }).click();
    await expect(page.getByText(/^issued$/i)).toBeVisible({ timeout: 20_000 });

    const publicLink = page.getByRole('link', { name: 'View public invoice page' });
    const href = await publicLink.getAttribute('href');
    expect(href).toContain('/i/');

    await page.goto(href!);
    await expect(page.getByText('Playwright Test Customer')).toBeVisible({ timeout: 20_000 });
  });
});
