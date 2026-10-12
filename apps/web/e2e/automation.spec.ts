import { test, expect, type Page } from '@playwright/test';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { createOwner, signIn } from './support';

/**
 * Journeys B-E through the real UI: every click calls the real /api/v1 endpoints with a sandbox key
 * (only the WhatsApp/Telegram provider step is simulated).
 */
async function openPlayground(page: Page) {
  const { email, workspace } = await createOwner({ name: 'Auto Co' });
  await signIn(page, email);
  await page.goto('/console', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create sandbox key' }).click();
  await expect(page.getByLabel('Sandbox key')).toHaveValue(/^sn_test_/);
  return { email, workspace };
}

const lastResponse = (page: Page) => page.getByLabel('API responses').locator('details').first();

test.describe('sandbox playground exercises the real pipeline', () => {
  test('invoice: paid purchase -> PDF -> simulated WhatsApp delivery', async ({
    page,
    request,
  }) => {
    const { workspace } = await openPlayground(page);
    await page.getByRole('button', { name: 'Send sample purchase' }).click();
    const link = page.getByRole('link', { name: 'Open generated PDF' });
    await expect(link).toBeVisible({ timeout: 60_000 });

    const pdf = await request.get((await link.getAttribute('href'))!);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const doc = await prisma.issuedDocument.findFirstOrThrow({
      where: { workspaceId: workspace.id },
      include: { deliveries: true },
    });
    expect(doc.number).toMatch(/^SBX-RCT-/);
    expect(doc.deliveries[0]!.status).toBe('SANDBOX_SIMULATED');
    await expect(lastResponse(page)).toContainText('sandbox_simulated');
    await page.screenshot({
      path: '../../test-evidence/screens/console-playground.png',
      fullPage: true,
    });
  });

  test('WhatsApp code: sent, readable only in the sandbox inbox, verified once', async ({
    page,
  }) => {
    await openPlayground(page);
    await page.getByRole('tab', { name: 'WhatsApp code' }).click();
    await page.getByRole('button', { name: 'Send code' }).click();
    const badge = page.getByText(/Sandbox inbox code: \d{6}/);
    await expect(badge).toBeVisible({ timeout: 60_000 });
    const code = /(\d{6})/.exec((await badge.textContent())!)![1]!;

    await page.getByLabel('Code received').fill(code);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText('/verify')).toBeVisible();
    await expect(lastResponse(page)).toContainText('"status": "verified"');
    // Single use: the same code is refused the second time.
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(lastResponse(page)).toContainText('otp_invalid');
  });

  test('Telegram: unconnected customer fails honestly; after linking, delivery succeeds', async ({
    page,
  }) => {
    const { workspace } = await openPlayground(page);

    // Not connected yet: a Telegram delivery is recorded as failed, nothing is "sent".
    await page.getByRole('checkbox', { name: 'telegram' }).check();
    await page.getByRole('button', { name: 'Send sample purchase' }).click();
    await expect(page.getByText('telegram_not_connected').first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole('tab', { name: 'Telegram' }).click();
    await page.getByRole('button', { name: 'Create link' }).click();
    await expect(page.getByText(/https:\/\/t\.me\//).first()).toBeVisible();
    await page.getByRole('button', { name: 'Simulate customer pressing Start' }).click();
    await expect(lastResponse(page)).toContainText('"linked": true');

    await page.getByRole('tab', { name: 'Invoice' }).click();
    await page.getByRole('button', { name: 'Send sample purchase' }).click();
    await expect
      .poll(
        async () =>
          prisma.delivery.count({
            where: { workspaceId: workspace.id, channel: 'TELEGRAM', status: 'SANDBOX_SIMULATED' },
          }),
        { timeout: 60_000 },
      )
      .toBe(1);
    const rows = await prisma.delivery.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      rows.some(
        (d) =>
          d.channel === 'TELEGRAM' &&
          d.status === 'FAILED' &&
          d.lastErrorCode === 'telegram_not_connected',
      ),
    ).toBe(true);
  });

  test('scenarios: transient failure is retried with bounded attempts; permanent failure stops', async ({
    page,
  }) => {
    const { workspace } = await openPlayground(page);
    await page.getByRole('tab', { name: 'Scenarios' }).click();

    await page.getByLabel('Provider behaviour').selectOption('temporary_failure');
    await page.getByRole('button', { name: 'Send and fast-forward retries' }).click();
    await expect(lastResponse(page)).toContainText('sandbox_simulated', { timeout: 60_000 });
    await expect(lastResponse(page)).toContainText('transient_failure');

    await page.getByLabel('Provider behaviour').selectOption('invalid_recipient');
    await page.getByRole('button', { name: 'Send, no waiting' }).click();
    await expect
      .poll(
        () => prisma.delivery.count({ where: { workspaceId: workspace.id, status: 'FAILED' } }),
        { timeout: 60_000 },
      )
      .toBe(1);
    await expect(lastResponse(page)).toContainText('"status": "failed"');
    const failed = await prisma.delivery.findFirstOrThrow({
      where: { workspaceId: workspace.id, status: 'FAILED' },
      include: { attempts: true },
    });
    expect(failed.lastErrorCode).toBe('invalid_recipient');
    expect(failed.attempts).toHaveLength(1); // permanent => no retry
  });

  test('deliveries page: history, filters, detail with attempts, and sanitized content', async ({
    page,
  }) => {
    const { workspace } = await openPlayground(page);
    await page.getByRole('tab', { name: 'Scenarios' }).click();
    await page.getByLabel('Provider behaviour').selectOption('temporary_failure');
    await page.getByRole('button', { name: 'Send and fast-forward retries' }).click();
    await expect(lastResponse(page)).toContainText('sandbox_simulated', { timeout: 60_000 });

    await page.goto('/console/deliveries', { waitUntil: 'networkidle' });
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('sandbox simulated');
    await expect(rows.first()).not.toContainText('8012345678'); // recipient is masked
    await page.getByLabel('Status').selectOption('failed');
    await expect(page.getByText('No deliveries yet')).toBeVisible();
    await page.getByLabel('Status').selectOption('');
    await rows.first().getByRole('link', { name: 'Details' }).click();
    await expect(page.getByRole('heading', { name: 'Attempts' })).toBeVisible();
    await expect(page.getByText('transient failure')).toHaveCount(2);
    await expect(page.locator('body')).not.toContainText(workspace.id);
    await page.screenshot({ path: '../../test-evidence/screens/console-delivery-detail.png' });
  });

  test('outgoing webhooks: register, receive a signed event, verify the signature', async ({
    page,
  }) => {
    const { workspace } = await openPlayground(page);
    const received: { raw: string; sig: string }[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({
          raw: Buffer.concat(chunks).toString('utf8'),
          sig: String(req.headers['sendnaro-signature']),
        });
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;

    await page.goto('/console/settings?tab=webhooks', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add endpoint' }).click();
    await page.getByLabel('Endpoint URL').fill(url);
    await page.getByRole('button', { name: 'Add endpoint' }).last().click();
    const secret = (await page.locator('code.break-all').textContent())!.trim();
    expect(secret).toMatch(/^whsec_/);
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Send test event' }).click();
    await expect.poll(() => received.length, { timeout: 60_000 }).toBeGreaterThan(0);
    const [t, v1] = [
      /t=(\d+)/.exec(received[0]!.sig)![1]!,
      /v1=([0-9a-f]+)/.exec(received[0]!.sig)![1]!,
    ];
    expect(createHmac('sha256', secret).update(`${t}.${received[0]!.raw}`).digest('hex')).toBe(v1);
    expect(JSON.parse(received[0]!.raw).type).toBe('delivery.sent');
    server.close();
    expect(
      await prisma.merchantWebhookEndpoint.count({ where: { workspaceId: workspace.id } }),
    ).toBe(1);

    // Live endpoints must be public https (SSRF protection is enforced in the UI flow too).
    await page.getByRole('button', { name: 'Add endpoint' }).first().click();
    await page.getByLabel('Endpoint URL').fill('https://127.0.0.1/hook');
    await page.getByRole('radio', { name: 'live' }).check();
    await page.getByRole('button', { name: 'Add endpoint' }).last().click();
    await expect(page.getByText(/private or\s+reserved address/).first()).toBeVisible();
  });
});
