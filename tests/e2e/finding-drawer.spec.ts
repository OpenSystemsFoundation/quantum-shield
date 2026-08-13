import { test, expect } from '@playwright/test';

test.describe('Finding detail drawer', () => {
  // Mock scan + first dev-server compile can exceed the 30s default on slow machines.
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/connect');
    await page.getByTestId('dev-mock-connect').click();
    await page.waitForURL('**/app');
    await page.getByTestId('start-scan-button').click();
    await page.waitForURL(/\/app\/report\/.+/, { timeout: 120_000 });
    await expect(page.getByTestId('findings-list')).toBeVisible();
  });

  test('click row opens drawer, click close hides it', async ({ page }) => {
    await expect(page.getByTestId('finding-drawer')).toHaveCount(0);

    await page.getByTestId('findings-list').locator('tbody tr').first().click();
    await expect(page.getByTestId('finding-drawer')).toBeVisible();

    await page.getByTestId('drawer-close').click();
    await expect(page.getByTestId('finding-drawer')).toHaveCount(0);
  });

  test('clicking the same row twice toggles the drawer closed', async ({ page }) => {
    const firstRow = page.getByTestId('findings-list').locator('tbody tr').first();
    await firstRow.click();
    await expect(page.getByTestId('finding-drawer')).toBeVisible();
    await firstRow.click();
    await expect(page.getByTestId('finding-drawer')).toHaveCount(0);
  });

  test('keyboard: Enter opens the drawer, closing restores focus to the row', async ({ page }) => {
    const firstRow = page.getByTestId('findings-list').locator('tbody tr').first();
    await firstRow.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByTestId('finding-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(firstRow).toBeFocused();
  });

  test('Escape key closes the drawer', async ({ page }) => {
    await page.getByTestId('findings-list').locator('tbody tr').first().click();
    await expect(page.getByTestId('finding-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('finding-drawer')).toHaveCount(0);
  });

  test('drag handle resizes the drawer', async ({ page }) => {
    await page.getByTestId('findings-list').locator('tbody tr').first().click();
    const drawer = page.getByTestId('finding-drawer');
    await expect(drawer).toBeVisible();

    const before = await drawer.evaluate((el) => el.getBoundingClientRect().height);
    const handle = page.getByTestId('drawer-handle');
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('handle bounding box missing');

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    // drag upward by 160px → drawer grows
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 160, { steps: 8 });
    await page.mouse.up();

    const after = await drawer.evaluate((el) => el.getBoundingClientRect().height);
    expect(after).toBeGreaterThan(before + 100);
  });
});
