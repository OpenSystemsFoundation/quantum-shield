import { test, expect } from '@playwright/test';

interface QuantumShieldWindow {
  pdfSize: number;
  renderMs: number;
  header: string;
  cbomJson: string;
  csv: string;
  report: {
    org: { orgName: string };
    findings: Array<{ id: string; title: string; citations: Array<{ sourceId: string }> }>;
  };
}

declare global {
  interface Window {
    __quantumShield?: QuantumShieldWindow;
  }
}

test.describe('PDF preview (dev)', () => {
  // First dev-server compile of the page can exceed the 30s default on slow machines.
  test.setTimeout(120_000);

  test('renders a valid PDF client-side', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/dev/pdf-preview');

    await expect(page.getByTestId('render-status')).toContainText(/Rendered in \d+ ms/, {
      timeout: 60_000,
    });

    const snapshot = await page.evaluate(() => window.__quantumShield ?? null);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.header).toBe('%PDF-');
    expect(snapshot!.pdfSize).toBeGreaterThan(10_000);
    expect(snapshot!.renderMs).toBeLessThan(8_000);

    await expect(page.getByTestId('pdf-iframe')).toBeVisible();

    // Network resource failures (e.g. external webfonts blocked in sandboxes)
    // are environmental — only real script/page errors fail the test.
    const critical = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
    expect(critical, `Console errors: ${critical.join('\n')}`).toEqual([]);
  });

  test('fixture report references EU sources', async ({ page }) => {
    await page.goto('/dev/pdf-preview');
    await expect(page.getByTestId('render-status')).toContainText(/Rendered in/, { timeout: 60_000 });

    const sources = await page.evaluate(() => {
      const snap = window.__quantumShield;
      if (!snap) return [];
      const all = new Set<string>();
      for (const f of snap.report.findings) {
        for (const c of f.citations) all.add(c.sourceId);
      }
      return [...all];
    });

    expect(sources).toEqual(
      expect.arrayContaining([
        'BSI-TR-02102-1',
        'ENISA-PQC-2024',
        'NCSC-NL-PQC-factsheet',
        'nis2-directive',
        'dora-regulation',
        'gdpr-art32',
      ]),
    );
  });

  test('CBOM JSON is valid CycloneDX 1.6', async ({ page }) => {
    await page.goto('/dev/pdf-preview');
    await expect(page.getByTestId('render-status')).toContainText(/Rendered in/, { timeout: 60_000 });

    const cbomRaw = await page.evaluate(() => window.__quantumShield?.cbomJson ?? '');
    expect(cbomRaw).not.toBe('');
    const cbom = JSON.parse(cbomRaw);
    expect(cbom.bomFormat).toBe('CycloneDX');
    expect(cbom.specVersion).toBe('1.6');
    expect(cbom.serialNumber).toMatch(/^urn:uuid:/);
    expect(Array.isArray(cbom.components)).toBe(true);
    expect(cbom.components.length).toBeGreaterThan(0);
    const VALID_ASSET_TYPES = ['algorithm', 'certificate', 'protocol', 'related-crypto-material'];
    for (const c of cbom.components) {
      expect(c.type).toBe('cryptographic-asset');
      // quantumSafe is not a CycloneDX cryptoProperties field — it must live
      // in the component's generic properties instead (spec validity).
      expect(c.cryptoProperties).not.toHaveProperty('quantumSafe');
      expect(VALID_ASSET_TYPES).toContain(c.cryptoProperties.assetType);
      const qs = (c.properties ?? []).find(
        (p: { name: string }) => p.name === 'quantumshield:quantum-safe',
      );
      expect(qs, `quantum-safe property on ${c.name}`).toBeTruthy();
    }
  });

  test('findings CSV has expected shape', async ({ page }) => {
    await page.goto('/dev/pdf-preview');
    await expect(page.getByTestId('render-status')).toContainText(/Rendered in/, { timeout: 60_000 });

    const csv = await page.evaluate(() => window.__quantumShield?.csv ?? '');
    const lines = csv.split('\r\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0]).toContain('id,category,severity,regulatoryStatus');
    expect(lines[1]).toMatch(/^F-/);
  });

  test('PDF download button yields valid PDF bytes', async ({ page }) => {
    await page.goto('/dev/pdf-preview');
    await expect(page.getByTestId('render-status')).toContainText(/Rendered in/, { timeout: 60_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-pdf').click();
    const download = await downloadPromise;

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(path!);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const tail = buf.subarray(-8).toString('ascii');
    expect(tail).toMatch(/%%EOF/);
    expect(buf.byteLength).toBeGreaterThan(10_000);
  });
});
