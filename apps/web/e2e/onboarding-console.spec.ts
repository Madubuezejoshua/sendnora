import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { createOwner, PASSWORD, readLatestEmail, signIn } from './support';

/** Journey A: a business signs up, verifies its email, sets up, and manages API keys. */
test.describe('business onboarding and console', () => {
  test('register -> email verification -> sign in -> create business -> console', async ({
    page,
  }) => {
    const email = `e2e-reg-${randomUUID()}@example.com`;
    await page.goto('/register', { waitUntil: 'networkidle' });
    await page.getByLabel('Full name').fill('Reg Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/check your email|verification/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Unverified accounts cannot sign in.
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText(/verify your email first/i)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);

    // The verification link comes from the real email, captured by the dev email sink.
    const mail = await readLatestEmail(email);
    expect(mail).toContain('Sendnaro');
    const link = /https?:\/\/\S+verify-email\?\S+/.exec(mail)?.[0];
    expect(link).toBeTruthy();
    await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByText(/verified|you can now log in/i).first()).toBeVisible();

    // First sign-in has no business yet: onboarding.
    await signIn(page, email, PASSWORD, /\/onboarding/);
    await page.getByLabel('Business name').fill('Reg Tester Shop');
    await page.getByRole('button', { name: /create|continue|finish/i }).click();
    await expect(page).toHaveURL(/\/console/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Integration' })).toBeVisible();
    await expect(page.getByText('Complete your business profile')).toBeVisible();
  });

  test('console shows only integration screens (no CRM or manual invoicing navigation)', async ({
    page,
  }) => {
    const { email } = await createOwner({ name: 'Nav Check' });
    await signIn(page, email);
    const nav = page.getByRole('navigation', { name: 'Console' });
    await expect(nav.getByRole('link')).toHaveText([
      'Integration',
      'API keys',
      'Deliveries',
      'Settings',
      'Activation',
    ]);
    for (const retired of [
      'Customers',
      'Products',
      'Quotes',
      'Invoices',
      'Expenses',
      'Recurring',
      'Reports',
    ]) {
      await expect(page.getByRole('link', { name: retired, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('radio', { name: 'sandbox' })).toBeChecked();
    // Every nav destination loads without an error page.
    for (const [label, heading] of [
      ['API keys', 'API keys'],
      ['Deliveries', 'Deliveries'],
      ['Settings', 'Settings'],
      ['Activation', 'Activation'],
    ]) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: '../../test-evidence/screens/console-activation.png' });
  });

  test('business profile saves, persists, and validates', async ({ page }) => {
    const { email, workspace } = await createOwner({ name: 'Profile Co' });
    await signIn(page, email);
    await page.goto('/console/settings', { waitUntil: 'networkidle' });
    await page.getByLabel('Business name').fill('Globex Retail');
    await page.getByLabel('Contact email').fill('ops@globex.test');
    await page.getByLabel('Website').fill('https://globex.test');
    await page.getByLabel('Address').fill('12 Allen Avenue\nIkeja');
    await page.getByLabel('Invoice footer').fill('Pay within 7 days');
    await page.getByLabel('Allowed link origins for notifications').fill('shop.globex.test');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByLabel('Business name')).toHaveValue('Globex Retail');
    await expect(page.getByLabel('Invoice footer')).toHaveValue('Pay within 7 days');
    const profile = await prisma.businessProfile.findUniqueOrThrow({
      where: { workspaceId: workspace.id },
    });
    expect(profile.displayName).toBe('Globex Retail');
    expect(profile.allowedLinkOrigins).toEqual(['shop.globex.test']);

    await page.getByLabel('Brand colour').fill('#12');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Could not save', { exact: true })).toBeVisible(); // server-side validation, not just the browser's
    await page.screenshot({ path: '../../test-evidence/screens/console-settings.png' });
  });

  test('API keys: shown once, work against the real API, rotate, revoke', async ({
    page,
    request,
  }) => {
    const { email, workspace } = await createOwner({ name: 'Keys Co' });
    await signIn(page, email);
    await page.goto('/console/keys', { waitUntil: 'networkidle' });
    await expect(page.getByText('No keys yet')).toBeVisible();

    await page.getByRole('button', { name: 'Create key' }).first().click();
    await page.getByLabel('Name').fill('Checkout backend');
    await page.getByRole('button', { name: 'Create key' }).last().click();
    const secret = (await page.getByTestId('new-key-secret').textContent())!.trim();
    expect(secret).toMatch(/^sn_test_[A-Za-z0-9_-]{43}$/);
    await page.getByRole('button', { name: 'I have saved it' }).click();

    // The secret is never shown again and is not stored in plain text.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('body')).not.toContainText(secret);
    const row = await prisma.apiKey.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect(row.hashedKey).not.toBe(secret);
    expect(JSON.stringify(row)).not.toContain(secret);

    // It authenticates against the public API through the same origin as the website.
    const ok = await request.get('/api/v1/ping', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).environment).toBe('sandbox');

    // Rotate: the old key stops working immediately.
    await page.getByRole('button', { name: 'Rotate' }).click();
    await page.getByRole('button', { name: 'Rotate', exact: true }).last().click();
    const rotated = (await page.getByTestId('new-key-secret').textContent())!.trim();
    await page.getByRole('button', { name: 'I have saved it' }).click();
    await expect
      .poll(async () =>
        (
          await request.get('/api/v1/ping', { headers: { Authorization: `Bearer ${secret}` } })
        ).status(),
      )
      .toBe(401);
    expect(
      (
        await request.get('/api/v1/ping', { headers: { Authorization: `Bearer ${rotated}` } })
      ).status(),
    ).toBe(200);

    // Revoke: the rotated key stops working.
    await page.getByRole('button', { name: 'Revoke' }).first().click();
    await page.getByRole('button', { name: 'Revoke', exact: true }).last().click();
    await expect(page.getByText('revoked', { exact: true })).toHaveCount(2); // the rotated-out key and this one
    await expect
      .poll(async () =>
        (
          await request.get('/api/v1/ping', { headers: { Authorization: `Bearer ${rotated}` } })
        ).status(),
      )
      .toBe(401);
    await page.screenshot({ path: '../../test-evidence/screens/console-keys.png' });
  });

  test('console works on a phone and by keyboard', async ({ page }) => {
    const { email } = await createOwner({ name: 'Mobile Co' });
    await signIn(page, email);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const url of [
      '/console',
      '/console/keys',
      '/console/deliveries',
      '/console/settings',
      '/console/activation',
    ]) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `${url} overflows at 375px`).toBe(false);
    }
    await page.goto('/console', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../../test-evidence/screens/console-mobile.png' });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});
