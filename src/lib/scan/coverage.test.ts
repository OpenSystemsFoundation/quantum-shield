import { describe, expect, it } from 'vitest';
import { buildMockSession } from '../auth/oauth.js';
import { cbomComponentFor, runScan } from './engine.js';
import { deadlineSummaryLines } from '../pdf/sections.js';
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

describe('cbomComponentFor', () => {
  it('leaves assets with no cryptographic fact out of the CBOM', () => {
    for (const kind of ['session-settings', 'connected-app', 'oidc-provider', 'installed-package'] as const) {
      expect(cbomComponentFor({ kind, name: 'n', identifier: 'i' }), kind).toBeNull();
    }
    expect(cbomComponentFor({ kind: 'named-credential', name: 'n', identifier: 'i' })).toBeNull();
  });

  it('types HTTPS endpoints as TLS with unknown quantum safety, and HTTP as unsafe', () => {
    const https = cbomComponentFor({ kind: 'remote-site', name: 'r', identifier: 'i', endpointUrl: 'https://a.example/x' });
    expect(https).toMatchObject({ type: 'protocol', protocol: 'tls', quantumSafe: null });
    expect(https?.protocolVersion).toBeUndefined();
    const http = cbomComponentFor({ kind: 'remote-site', name: 'r', identifier: 'i', endpointUrl: 'http://a.example' });
    expect(http).toMatchObject({ type: 'protocol', protocol: 'http', quantumSafe: false });
  });

  it('carries the probed TLS version and a tri-state hybrid result', () => {
    const base = { kind: 'tls-endpoint' as const, name: 'p', identifier: 'https://a.example', tlsVersion: 'TLSv1.3', algorithm: 'TLS_AES_256_GCM_SHA384' };
    expect(cbomComponentFor({ ...base, hybridKem: true })).toMatchObject({ protocolVersion: '1.3', quantumSafe: true });
    expect(cbomComponentFor({ ...base, hybridKem: false })?.quantumSafe).toBe(false);
    expect(cbomComponentFor(base)?.quantumSafe).toBeNull();
  });

  it('records certificate expiry', () => {
    expect(
      cbomComponentFor({ kind: 'certificate', name: 'c', identifier: 'i', algorithm: 'RSA', keySize: 4096, expiresAt: '2027-01-01T00:00:00.000Z' }),
    ).toMatchObject({ type: 'certificate', notValidAfter: '2027-01-01T00:00:00.000Z', quantumSafe: false });
  });
});

describe('posture sentence and deadlines', () => {
  it('counts every replace-now finding as immediate and cites the 2030/2035 milestones', async () => {
    const report = await runScan(
      { scanId: 'posture-count', session: buildMockSession(), overlays: [], mock: true },
      () => {},
    );
    const immediate = report.findings.filter((f) => f.migrationPosture === 'replace-now').length;
    expect(immediate).toBeGreaterThan(report.summary.bySeverity.critical);
    expect(report.summary.postureSentence).toContain(`${immediate} should be remediated now`);
    expect(report.summary.postureSentence).toContain('deprecated after 2030, disallowed after 2035');
    expect(report.summary.postureSentence).not.toContain('2033');
  });

  it('never reports a past date as the earliest upcoming deadline', async () => {
    const report = await runScan(
      { scanId: 'deadline', session: buildMockSession(), overlays: [], mock: true },
      () => {},
    );
    const today = new Date().toISOString().slice(0, 10);
    if (report.summary.earliestDeadline) {
      expect(report.summary.earliestDeadline >= today).toBe(true);
    }
    const lines = deadlineSummaryLines({
      ...report,
      scanStartedAt: '2026-11-17T00:00:00.000Z',
      findings: [
        { ...report.findings[0], deadline: '2013-12-31' },
        { ...report.findings[0], deadline: '2030-12-31' },
        { ...report.findings[0], deadline: undefined },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Already past: 1 finding .*oldest 2013-12-31/);
    expect(lines[1]).toMatch(/^Next upcoming: 2030-12-31/);
  });
});
