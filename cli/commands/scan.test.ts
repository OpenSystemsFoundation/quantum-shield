import { describe, expect, it } from 'vitest';
import { evaluateCoverage } from './scan.js';
import type { CategoryCoverage, Finding } from '../../src/lib/pdf/types.js';

function cov(
  status: CategoryCoverage['status'],
  label: string,
  detail?: string,
): CategoryCoverage {
  return {
    id: 'tls-probe',
    label,
    status,
    assetCount: 0,
    findingCount: 0,
    detail,
  };
}

describe('evaluateCoverage', () => {
  it('returns exit 0 for fully scanned coverage', () => {
    const result = evaluateCoverage([cov('scanned', 'Certificates')], false);
    expect(result.exitCode).toBe(0);
    expect(result.incomplete).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('treats skipped categories as success but reports them', () => {
    const skippedEntry = cov('skipped', 'Shield Platform Encryption', 'not licensed');
    const result = evaluateCoverage([cov('scanned', 'Certificates'), skippedEntry], false);
    expect(result.exitCode).toBe(0);
    expect(result.incomplete).toEqual([]);
    expect(result.skipped).toEqual([skippedEntry]);
  });

  it('returns exit 3 when a category failed', () => {
    const failedEntry = cov('failed', 'Named Credentials', 'HTTP 500');
    const result = evaluateCoverage([cov('scanned', 'Certificates'), failedEntry], false);
    expect(result.exitCode).toBe(3);
    expect(result.incomplete).toEqual([failedEntry]);
  });

  it('returns exit 3 when a category is partial', () => {
    const partialEntry = cov('partial', 'Apex Crypto Usage', 'tooling query timed out');
    const result = evaluateCoverage([partialEntry], false);
    expect(result.exitCode).toBe(3);
    expect(result.incomplete).toEqual([partialEntry]);
  });

  it('downgrades incomplete coverage to exit 0 with allowPartial', () => {
    const failedEntry = cov('failed', 'Named Credentials', 'HTTP 500');
    const result = evaluateCoverage([failedEntry], true);
    expect(result.exitCode).toBe(0);
    // Still reported so the caller can print what was missed.
    expect(result.incomplete).toEqual([failedEntry]);
  });
});

describe('normaliseApiVersion', () => {
  it('accepts the common spellings and returns NN.0', async () => {
    const { normaliseApiVersion } = await import('./scan.js');
    expect(normaliseApiVersion('62.0')).toBe('62.0');
    expect(normaliseApiVersion('v62.0')).toBe('62.0');
    expect(normaliseApiVersion('62')).toBe('62.0');
    expect(normaliseApiVersion('V66')).toBe('66.0');
  });

  it('rejects anything that would corrupt the request path', async () => {
    const { normaliseApiVersion } = await import('./scan.js');
    for (const bad of ['', 'latest', '62.5', '6', '62.0/../x', 'v']) {
      expect(normaliseApiVersion(bad), bad).toBeUndefined();
    }
  });
});

function finding(id: string, severity: Finding['severity'], extra: Partial<Finding> = {}): Finding {
  return {
    id,
    category: 'certificates',
    severity,
    regulatoryStatus: 'advisory',
    migrationPosture: 'plan-2030',
    effort: 'low',
    hndlExposure: false,
    title: `finding ${id}`,
    asset: { kind: 'certificate', name: `cert-${id}`, identifier: id },
    currentCrypto: 'RSA-2048',
    recommendedReplacement: 'ML-DSA-65',
    rationale: '',
    citations: [],
    ...extra,
  };
}

describe('parseSeverity / findingsAtOrAbove', () => {
  it('accepts severities case-insensitively and rejects others', async () => {
    const { parseSeverity } = await import('./scan.js');
    expect(parseSeverity('HIGH')).toBe('high');
    expect(parseSeverity(' critical ')).toBe('critical');
    expect(parseSeverity('severe')).toBeUndefined();
  });

  it('treats the threshold as inclusive, with critical highest', async () => {
    const { findingsAtOrAbove } = await import('./scan.js');
    const all = [finding('a', 'low'), finding('b', 'medium'), finding('c', 'high'), finding('d', 'critical')];
    expect(findingsAtOrAbove(all, 'high').map((f) => f.id)).toEqual(['c', 'd']);
    expect(findingsAtOrAbove(all, 'low')).toHaveLength(4);
    expect(findingsAtOrAbove(all, 'critical').map((f) => f.id)).toEqual(['d']);
  });
});

describe('rankFindings', () => {
  it('orders by severity, then HNDL exposure, then deadline', async () => {
    const { rankFindings } = await import('./scan.js');
    const ranked = rankFindings([
      finding('low', 'low'),
      finding('high-late', 'high', { deadline: '2035-01-01' }),
      finding('high-early', 'high', { deadline: '2030-01-01' }),
      finding('high-hndl', 'high', { hndlExposure: true, deadline: '2040-01-01' }),
      finding('crit', 'critical'),
    ]);
    expect(ranked.map((f) => f.id)).toEqual(['crit', 'high-hndl', 'high-early', 'high-late', 'low']);
  });

  it('prefers an explicit priority rank when findings carry one', async () => {
    const { rankFindings } = await import('./scan.js');
    const a = { ...finding('a', 'critical'), priority: { rank: 2 } } as unknown as Finding;
    const b = { ...finding('b', 'low'), priority: { rank: 1 } } as unknown as Finding;
    expect(rankFindings([a, b]).map((f) => f.id)).toEqual(['b', 'a']);
  });
});
