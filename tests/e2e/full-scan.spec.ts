import { test, expect } from '@playwright/test';

test.describe('Full mock scan flow', () => {
  test('connect → scan → report', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/connect');
    await page.getByTestId('dev-mock-connect').click();
    await page.waitForURL('**/app');

    await expect(page.getByTestId('session-org-name')).toHaveText('ACME Europe B.V.');
    await page.getByTestId('start-scan-button').click();

    await page.waitForURL(/\/app\/scan\/.+/);

    await expect(page.getByTestId('scanner-row-certificates')).toBeVisible();
    // Wait for redirect to the report view (happens when scan completes)
    await page.waitForURL(/\/app\/report\/.+/, { timeout: 30_000 });

    await expect(page.getByTestId('findings-list')).toBeVisible();
    const count = await page.getByTestId('findings-list').locator('tbody tr').count();

    const filteredText = await page.getByTestId('filtered-count').textContent();
    expect(filteredText).toMatch(/of \d+ total/);
    const total = Number(filteredText?.match(/of (\d+) total/)?.[1] ?? '-1');
    expect(total).toBeGreaterThanOrEqual(0);
    expect(count).toBe(total);

    // PDF download from the report view still works
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('report-download-pdf').click();
    const download = await downloadPromise;
    expect(await download.path()).toBeTruthy();

    // No unhandled errors (allow worker module import warning noise if any)
    const critical = consoleErrors.filter(
      (e) => !/Failed to load resource|Worker\s+constructor/.test(e),
    );
    expect(critical, `Console errors:\n${critical.join('\n')}`).toEqual([]);
  });
});
