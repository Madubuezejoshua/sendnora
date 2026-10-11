import { test, expect } from '@playwright/test';

test.describe('marketing site', () => {
  test('homepage loads with hero and primary CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /get started free/i }).first()).toBeVisible();
  });

  test('pricing page lists all four plans', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Free', { exact: true })).toBeVisible();
    await expect(page.getByText('Starter', { exact: true })).toBeVisible();
    await expect(page.getByText('Business', { exact: true })).toBeVisible();
    await expect(page.getByText('Agency', { exact: true })).toBeVisible();
  });

  test('nav links to login and register', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Log in' }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('404 page renders for an unknown route', async ({ page }) => {
    const response = await page.goto('/i/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });
});
