import { describe, expect, it } from 'vitest';
import { renderReportPdf } from './renderer.js';
import { toWinAnsi } from './layout.js';
import { demoReport } from './fixtures/demo-report.js';
import type { Report } from './types.js';

function pdfHeader(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 5));
}

describe('toWinAnsi', () => {
  it('maps Latin-extended characters to WinAnsi-safe equivalents', () => {
    expect(toWinAnsi('Şirket Güvenliği')).toBe('Sirket Güvenligi');
    expect(toWinAnsi('Łódź')).toBe('Lódz');
    expect(toWinAnsi('İstanbul ılık')).toBe('Istanbul ilik');
    expect(toWinAnsi('Ćma ąę ňř')).toBe('Cma ae nr');
  });

  it('keeps WinAnsi-encodable text untouched', () => {
    const text = 'ACME Europe B.V. — “quotes” café ñ €';
    expect(toWinAnsi(text)).toBe(text);
  });

  it('replaces unencodable characters (CJK, emoji) with ?', () => {
    expect(toWinAnsi('東京')).toBe('??');
    expect(toWinAnsi('a\u{1F600}b')).toBe('a?b');
  });
});

describe('renderReportPdf', () => {
  it('renders the demo report to PDF bytes', async () => {
    const bytes = await renderReportPdf(demoReport);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdfHeader(bytes)).toBe('%PDF-');
  });

  it('never throws on Turkish / Polish / CJK org names', async () => {
    const names = ['Şirket Güvenliği A.Ş.', 'Łódź Ubezpieczenia Sp. z o.o.', '東京クオンタム株式会社'];
    for (const orgName of names) {
      const report: Report = structuredClone(demoReport);
      report.org.orgName = orgName;
      report.summary.postureSentence = `${orgName} has findings.`;
      const bytes = await renderReportPdf(report);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(pdfHeader(bytes)).toBe('%PDF-');
    }
  });

  it('never throws on non-WinAnsi finding titles and asset names', async () => {
    const report: Report = structuredClone(demoReport);
    report.findings[0].title = 'Zertifikat für Łukasz Ş 東京 with an extremely long unbroken identifier segment that must wrap instead of overrunning the page edge 0123456789012345678901234567890123456789';
    report.findings[0].asset.name = 'çok-uzun-bir-sertifika-adı-şğüö-' + 'x'.repeat(120);
    const bytes = await renderReportPdf(report);
    expect(pdfHeader(bytes)).toBe('%PDF-');
  });

  it('renders in cli generator mode with failed/partial coverage', async () => {
    const report: Report = structuredClone(demoReport);
    report.generator = { name: 'QuantumShield', version: '0.1.0', mode: 'cli' };
    report.coverage.push({
      id: 'tls-probe',
      label: 'Live TLS probe',
      status: 'failed',
      assetCount: 0,
      findingCount: 0,
      detail: 'Outbound probing blocked by network policy.',
    });
    const bytes = await renderReportPdf(report);
    expect(pdfHeader(bytes)).toBe('%PDF-');
  });
});
