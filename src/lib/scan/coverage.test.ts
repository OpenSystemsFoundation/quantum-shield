import { describe, expect, it } from 'vitest';
import { buildMockSession } from '../auth/oauth.js';
import { runScan } from './engine.js';
import { stripApexComments } from './scanners.js';
import { expandRegions } from '../rules/engine.js';

describe('scan coverage', () => {
  it('records a per-category outcome for every scanner and stamps the generator', async () => {
    const report = await runScan(
      { scanId: 'coverage-test', session: buildMockSession(), overlays: [], mock: true },
      () => {},
    );

    expect(report.coverage.length).toBeGreaterThanOrEqual(9);
    const byId = new Map(report.coverage.map((c) => [c.id, c]));
    for (const id of [
      'certificates',
      'connected-apps',
      'named-credentials',
      'remote-sites',
      'sso',
      'shield-encryption',
      'apex-crypto',
      'session-login',
      'packages',
    ]) {
      const entry = byId.get(id as never);
      expect(entry, `coverage entry for ${id}`).toBeDefined();
      expect(['scanned', 'partial', 'failed', 'skipped']).toContain(entry!.status);
    }

    // The fixture org has Shield disabled — that must surface as an honest
    // skip with a reason, not as a clean scan.
    const shield = byId.get('shield-encryption');
    expect(shield!.status).toBe('skipped');
    expect(shield!.detail).toMatch(/Shield Platform Encryption/i);

    expect(report.generator.name).toBe('QuantumShield');
    expect(report.generator.mode).toBe('browser');
  });

  it('attaches rule-declared overlay ids to findings', async () => {
    const report = await runScan(
      { scanId: 'overlay-test', session: buildMockSession(), overlays: ['nis2'], mock: true },
      () => {},
    );
    const withOverlays = report.findings.filter((f) => (f.overlayIds ?? []).length > 0);
    expect(withOverlays.length).toBeGreaterThan(0);
    // Plaintext HTTP maps to GDPR + NIS 2 among others.
    const http = report.findings.find((f) => f.id.startsWith('R-HTTP-ENDPOINT'));
    expect(http?.overlayIds).toContain('gdpr');
    expect(http?.overlayIds).toContain('nis2');
  });

  it('mentions unverified categories in the posture sentence only when present', async () => {
    const report = await runScan(
      { scanId: 'posture-test', session: buildMockSession(), overlays: [], mock: true },
      () => {},
    );
    const unverified = report.coverage.filter((c) => c.status === 'failed' || c.status === 'partial');
    if (unverified.length === 0) {
      expect(report.summary.postureSentence).not.toMatch(/could not be fully scanned/);
    } else {
      expect(report.summary.postureSentence).toMatch(/could not be fully scanned/);
    }
  });
});

describe('stripApexComments', () => {
  it('blanks line and block comments while preserving line numbers', () => {
    const src = [
      "// Crypto.generateDigest('MD5', data);",
      '/* Crypto.sign(',
      "   'RSA', data, key); */",
      "Blob d = Crypto.generateDigest('SHA-256', data);",
    ].join('\n');
    const stripped = stripApexComments(src);
    expect(stripped).not.toContain('MD5');
    expect(stripped).not.toContain("'RSA'");
    expect(stripped).toContain("generateDigest('SHA-256'");
    expect(stripped.split('\n').length).toBe(src.split('\n').length);
  });

  it('leaves string literals untouched, including ones containing slashes', () => {
    const src = "String url = 'https://example.com//path'; Blob d = Crypto.generateDigest('MD5', data);";
    const stripped = stripApexComments(src);
    expect(stripped).toContain("'https://example.com//path'");
    expect(stripped).toContain("'MD5'");
  });

  it('handles escaped quotes inside strings', () => {
    const src = "String s = 'it\\'s // not a comment'; Crypto.generateDigest('SHA1', b);";
    const stripped = stripApexComments(src);
    expect(stripped).toContain("'SHA1'");
  });
});

describe('expandRegions', () => {
  it('implies EU for member states', () => {
    expect(expandRegions(['NL']).has('EU')).toBe(true);
    expect(expandRegions(['de']).has('EU')).toBe(true);
    expect(expandRegions(['UK']).has('EU')).toBe(false);
    expect(expandRegions(['US']).has('EU')).toBe(false);
  });
});
