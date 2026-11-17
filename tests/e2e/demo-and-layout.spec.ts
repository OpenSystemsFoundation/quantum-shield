import { test, expect, type Page } from '@playwright/test';

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Public sample report', () => {
  test.setTimeout(120_000);

  test('opens from the landing page, is labelled, and creates no session or stored data', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('view-sample-report').click();
    await page.waitForURL('**/demo**');
    await expect(page.getByTestId('findings-list')).toBeVisible();
    await expect(page.getByTestId('demo-banner')).toContainText('Sample data — not your org');
    await expect(page.getByTestId('sign-out-button')).toHaveCount(0);

    const stored = await page.evaluate(async () => ({
      session: sessionStorage.getItem('qs.session.v1'),
      databases: (await indexedDB.databases()).map((d) => d.name),
    }));
    expect(stored.session).toBeNull();
    expect(stored.databases).not.toContain('quantum-shield');

    // The banner stays on screen while scrolling the report.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId('demo-banner')).toBeInViewport();

    // The sample grants no access to the app.
    await page.goto('/app');
    await page.waitForURL('**/connect**');
  });

  test('is linked from /connect', async ({ page }) => {
    await page.goto('/connect');
    await expect(page.getByTestId('view-sample-report')).toHaveAttribute('href', '/demo');
  });
});

test.describe('Phone layout (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(120_000);

  for (const path of ['/', '/install', '/security', '/privacy', '/connect', '/callback', '/demo']) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await overflow(page)).toBe(0);
    });
  }

  test('finding detail is a full-screen modal dialog that traps focus', async ({ page }) => {
    await page.goto('/demo');
    await page.getByTestId('finding-open').first().click();
    const drawer = page.getByTestId('finding-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(await drawer.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    await expect(page.getByTestId('drawer-sample-label')).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="finding-drawer"]'))).toBe(true);
    }
    expect(await overflow(page)).toBe(0);
  });
});

test.describe('Sign out', () => {
  test.setTimeout(120_000);

  test('confirms, offers to delete local scan data, and clears the session', async ({ page }) => {
    await page.goto('/connect');
    await page.getByTestId('dev-mock-connect').click();
    await page.waitForURL('**/app');
    await page.getByTestId('start-scan-button').click();
    await page.waitForURL(/\/app\/report\/.+/, { timeout: 120_000 });

    await page.getByTestId('sign-out-button').click();
    await expect(page.getByTestId('sign-out-dialog')).toBeVisible();
    await page.getByTestId('sign-out-delete-data').check();
    await page.getByTestId('sign-out-confirm').click();
    await page.waitForURL((url) => url.pathname === '/');

    const left = await page.evaluate(
      () =>
        new Promise<{ session: string | null; scans: number }>((resolve) => {
          const open = indexedDB.open('quantum-shield');
          open.onsuccess = () => {
            const count = open.result.transaction('scans').objectStore('scans').count();
            count.onsuccess = () =>
              resolve({ session: sessionStorage.getItem('qs.session.v1'), scans: count.result });
          };
        }),
    );
    expect(left).toEqual({ session: null, scans: 0 });
  });
});
