import { describe, expect, it } from 'vitest';
import { evaluateCoverage } from './scan.js';
import type { CategoryCoverage } from '../../src/lib/pdf/types.js';

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
