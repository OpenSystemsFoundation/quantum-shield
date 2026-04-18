import { test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('capture PDF bytes and preview screenshot', async ({ page }) => {
  await page.goto('/dev/pdf-preview');
  await page.getByTestId('render-status').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__quantumShield);

  await mkdir('test-results/artifacts', { recursive: true });

  await page.screenshot({
    path: 'test-results/artifacts/pdf-preview.png',
    fullPage: false,
  });

  const bytesArr = (await page.evaluate(async () => {
    const snap = (window as unknown as { __quantumShield?: { pdfSize: number } }).__quantumShield;
    if (!snap) return null;
    const resp = await fetch(
      (document.querySelector('[data-testid="pdf-iframe"]') as HTMLIFrameElement).src,
    );
    const buf = new Uint8Array(await resp.arrayBuffer());
    return Array.from(buf);
  })) as number[] | null;

  if (bytesArr) {
    await writeFile('test-results/artifacts/demo-report.pdf', Buffer.from(bytesArr));
  }
});
