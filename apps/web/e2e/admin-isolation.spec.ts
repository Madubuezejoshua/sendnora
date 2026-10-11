import { test, expect } from '@playwright/test';
import { prisma } from '@sendnaro/database';
import { createOwner, signIn } from './support';

test.describe('platform admin and isolation', () => {
  test('admin billing panel: billing is off by default and cannot be enabled without a ready gateway', async ({ page }) => {
    const admin = await createOwner({ name: 'Admin Co', platformAdmin: true });
    await signIn(page, admin.email);
    await page.goto('/admin/billing', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Billing and access' })).toBeVisible();
    await expect(page.getByText('off (free live access)')).toBeVisible();
    await expect(page.getByText('not configured', { exact: true })).toBeVisible(); // no payment gateway key in this environment
    await expect(page.getByText('Payment gateway secret key is not configured')).toBeVisible();

    await page.getByRole('button', { name: 'Require activation payments…' }).click();
    await expect(page.getByText('Every business without a verified one-time activation will be blocked')).toBeVisible();
    await page.getByRole('button', { name: 'Require activation' }).click();
    await expect(page.getByText(/billing_not_ready|Could not save/).first()).toBeVisible(); // failed safely
    await page.keyboard.press('Escape');
    expect((await prisma.applicationSetting.findUnique({ where: { key: 'billing_required' } }))?.value).not.toBe(true);
    await page.screenshot({ path: '../../test-evidence/screens/admin-billing.png', fullPage: true });

    // The public site and the console agree: no activation fee.
    await page.goto('/pricing');
    await expect(page.getByText('No activation fee right now')).toBeVisible();
  });

  test('admin overview loads and non-admins are kept out', async ({ page, browser }) => {
    const admin = await createOwner({ name: 'Admin Two', platformAdmin: true });
    await signIn(page, admin.email);
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    const user = await createOwner({ name: 'Regular' });
    await signIn(other, user.email);
    await other.goto('/admin/billing');
    await expect(other).toHaveURL(/\/console/); // redirected away
    const api = await other.request.get('/api/proxy/admin/billing');
    expect(api.status()).toBe(403); // and the API refuses too, regardless of the UI
    await ctx.close();
  });

  test("a business cannot see another business's deliveries, documents or keys", async ({ page, browser }) => {
    const a = await createOwner({ name: 'Alpha' });
    const b = await createOwner({ name: 'Bravo' });
    const delivery = await prisma.delivery.create({
      data: { workspaceId: a.workspace.id, environment: 'SANDBOX', kind: 'NOTIFICATION', channel: 'WHATSAPP', status: 'SANDBOX_SIMULATED', toAddress: '+2348012345678', templateKey: 'order_confirmation', simulated: true },
    });
    const key = await prisma.apiKey.create({ data: { workspaceId: a.workspace.id, createdById: a.user.id, name: 'Alpha key', environment: 'SANDBOX', prefix: 'sn_test_abcd', lastFour: 'wxyz', hashedKey: `hash-${a.workspace.id}`, scopes: ['deliveries:read'] } });

    await signIn(page, a.email);
    await page.goto('/console/deliveries', { waitUntil: 'networkidle' });
    await expect(page.locator('tbody tr')).toHaveCount(1);

    const ctx = await browser.newContext();
    const pb = await ctx.newPage();
    await signIn(pb, b.email);
    await pb.goto('/console/deliveries', { waitUntil: 'networkidle' });
    await expect(pb.getByText('No deliveries yet')).toBeVisible();
    expect((await pb.request.get(`/api/proxy/deliveries/dlv_${delivery.id}`)).status()).toBe(404);
    expect((await pb.request.delete(`/api/proxy/keys/${key.id}`)).status()).toBe(404);
    await pb.goto('/console/keys', { waitUntil: 'networkidle' });
    await expect(pb.getByText('Alpha key')).toHaveCount(0);
    await ctx.close();
  });

  test('the browser relay refuses live keys, unauthenticated use and unknown endpoints', async ({ page, request }) => {
    const liveLike = `sn_live_${'a'.repeat(43)}`;
    expect((await request.get('/api/sandbox/ping', { headers: { 'X-Sandbox-Key': `sn_test_${'a'.repeat(43)}` }, maxRedirects: 0 })).status()).toBe(307); // not signed in: redirected to sign in
    const owner = await createOwner({ name: 'Relay' });
    await signIn(page, owner.email);
    const live = await page.request.get('/api/sandbox/ping', { headers: { 'X-Sandbox-Key': liveLike } });
    expect(live.status()).toBe(403);
    expect((await live.json()).error.code).toBe('sandbox_only');
    const unknown = await page.request.get('/api/sandbox/admin/stats', { headers: { 'X-Sandbox-Key': `sn_test_${'a'.repeat(43)}` } });
    expect(unknown.status()).toBe(404);
  });
});
