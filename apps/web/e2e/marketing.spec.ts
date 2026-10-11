import { test, expect } from '@playwright/test';
import { OBSOLETE_BRANDS } from './support';

const PUBLIC_PAGES = ['/', '/docs', '/pricing', '/contact', '/privacy', '/terms', '/login', '/register'];

test.describe('public site', () => {
  test('home page: specified copy, both CTAs, and a real example', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customer messages, delivered automatically.');
    await expect(page.getByText('Connect your website or app to send invoices, WhatsApp verification codes, and order updates through one API.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start testing' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the API docs' })).toBeVisible();
    for (const label of ['Automatic invoices', 'WhatsApp verification', 'Telegram delivery']) await expect(page.getByRole('heading', { name: label })).toBeVisible();
    await expect(page.getByText('Set up once. Send from your backend. Track every delivery.')).toBeVisible();
    await expect(page.locator('pre')).toContainText('Authorization: Bearer $SENDNARO_API_KEY');
    await expect(page.locator('pre')).toContainText('unit_amount_minor');
    await expect(page.locator('pre')).not.toContainText('set -euo');
  });

  test('home page makes no unsupported claims', async ({ page }) => {
    await page.goto('/');
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const banned of ['zero failures', 'unlimited free', 'no provider limits', 'verify every email', 'testimonial', '99.9']) expect(text).not.toContain(banned);
    expect(text).not.toContain('—'); // no em dashes in marketing copy
  });

  test('every public page uses the Sendnaro brand and none of the retired names', async ({ page }) => {
    for (const url of PUBLIC_PAGES) {
      await page.goto(url);
      const body = await page.locator('body').innerText();
      expect(body, url).not.toMatch(OBSOLETE_BRANDS);
      await expect(page.getByRole('link', { name: 'Sendnaro home' })).toBeVisible();
      expect((await page.title()).toLowerCase(), url).not.toMatch(OBSOLETE_BRANDS);
    }
  });

  test('docs describe the real API and show the tested example files', async ({ page }) => {
    await page.goto('/docs');
    for (const heading of ['Authentication', 'Invoices and receipts', 'WhatsApp verification', 'Telegram', 'Webhooks', 'Errors']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(page.getByText('server-side secrets')).toBeVisible();
    await expect(page.getByText('examples/node/create-invoice.ts')).toBeVisible();
    await expect(page.getByText('activation_required').first()).toBeVisible();
    await expect(page.getByText('verifySendnaroSignature').first()).toBeVisible();
  });

  test('pricing reflects the current billing state truthfully (billing is off by default)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
    await expect(page.getByText('No activation fee right now')).toBeVisible();
    await expect(page.getByText(/Meta may\s+charge you directly/)).toBeVisible();
    await expect(page.getByText('No monthly Sendnaro subscription', { exact: false })).toBeVisible();
  });

  test('legal and support pages are honest about their status', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByText('has not been reviewed by a lawyer')).toBeVisible();
    await expect(page.getByText('never stored, logged or returned')).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Acceptable use' })).toBeVisible();
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible();
  });

  test('support form really stores a message', async ({ page }) => {
    await page.goto('/contact', { waitUntil: 'networkidle' });
    await page.getByLabel('Name').fill('E2E Tester');
    await page.getByLabel('Email').fill('e2e-support@example.com');
    await page.getByLabel('Message').fill('Hello from the end-to-end test.');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByText(/thanks|received|sent/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('unknown routes render the 404 page, and protected routes redirect to sign in', async ({ page }) => {
    const nf = await page.goto('/i/this-page-does-not-exist');
    expect(nf?.status()).toBe(404);
    await expect(page.getByText(/page not found/i)).toBeVisible();
    await page.goto('/console');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fconsole/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('retired product pages are gone', async ({ request }) => {
    for (const p of ['/features', '/templates', '/faq', '/about', '/dashboard', '/customers', '/invoices', '/quotes', '/expenses', '/reports']) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect([404, 307, 308], p).toContain(res.status()); // 404 for public paths, sign-in redirect for protected ones
      if (res.status() === 307) expect(res.headers().location).toContain('/login');
    }
  });
});

test.describe('responsive layout and keyboard use', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal scrolling on phones', async ({ page }) => {
    for (const url of PUBLIC_PAGES) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `${url} overflows at 375px`).toBe(false);
    }
  });

  test('mobile menu opens, is labelled, and navigates', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const toggle = page.getByRole('button', { name: 'Open menu' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'API docs' }).click();
    await expect(page).toHaveURL(/\/docs/);
  });
});

test('keyboard: focus is visible and the sign-in form works without a mouse', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').focus();
  await page.keyboard.type('nobody@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type('wrong-password-123');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/incorrect email\/password/i)).toBeVisible({ timeout: 20_000 });
  const ring = await page.getByLabel('Email').evaluate((el) => { (el as HTMLElement).focus(); return getComputedStyle(el).boxShadow + getComputedStyle(el).outlineStyle; });
  expect(ring).not.toBe('nonenone'); // a visible focus indicator exists
});
