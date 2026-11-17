import { describe, expect, it } from 'vitest';
import type { Citation } from '@lib/pdf';
import { buildMockSession } from '../auth/oauth.js';
import { runScan } from '../scan/engine.js';
import { cite } from './citations.js';
import { ruleCatalogFor, ruleCatalogForOverlays, scopeCitationsToRegions } from './engine.js';

const ALL_REGIONS = ['US', 'EU', 'NL', 'DE', 'FR', 'UK', 'INTL'];

describe('ruleCatalogFor (regions never gate detection)', () => {
  it('returns the full catalog for every region selection', () => {
    const full = ruleCatalogForOverlays([]).map((r) => r.id);
    expect(ruleCatalogFor([], []).map((r) => r.id)).toEqual(full);
    for (const region of ALL_REGIONS) {
      expect(ruleCatalogFor([], [region]).map((r) => r.id), region).toEqual(full);
    }
    expect(ruleCatalogFor([], ['nl', 'eu']).map((r) => r.id)).toEqual(full);
  });

  it('never drops rules based on overlay selection', () => {
    expect(ruleCatalogFor(['pci-dss-4'], []).length).toBe(ruleCatalogFor([], []).length);
  });
});

describe('scans produce the same findings for every region', () => {
  const scan = (regions: string[]) =>
    runScan(
      { scanId: `region-${regions.join('-') || 'none'}`, session: buildMockSession(), overlays: [], regions, mock: true },
      () => {},
    );

  it("keeps every finding for ['UK'] and ['INTL']", async () => {
    // Regression: a UK-scoped scan used to lose 8 of 18 findings because
    // few rules cite a UK source.
    const baseline = await scan([]);
    expect(baseline.findings.length).toBeGreaterThan(0);
    const ids = baseline.findings.map((f) => f.id).sort();
    for (const regions of [['UK'], ['INTL'], ['US'], ['NL', 'EU']]) {
      const scoped = await scan(regions);
      expect(scoped.findings.map((f) => f.id).sort(), regions.join(',')).toEqual(ids);
      expect(scoped.summary.bySeverity).toEqual(baseline.summary.bySeverity);
      for (const finding of scoped.findings) {
        expect(finding.citations.length, finding.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('scopeCitationsToRegions', () => {
  const jurisdictions = (citations: Citation[]) => citations.map((c) => c.jurisdiction);
  const mixed = cite('NIST_SP_800_53', 'GDPR_ART_32', 'NIST_SP_800_131A', 'NCSC_NL_PQC');

  it('leaves citations untouched when no region is selected', () => {
    expect(scopeCitationsToRegions(mixed, [])).toEqual(mixed);
  });

  it('puts in-region sources first, then international ones, and drops the rest', () => {
    expect(jurisdictions(scopeCitationsToRegions(mixed, ['US']))).toEqual(['US', 'INTL']);
    // NL implies EU.
    expect(jurisdictions(scopeCitationsToRegions(mixed, ['NL']))).toEqual(['EU', 'NL', 'INTL']);
    expect(jurisdictions(scopeCitationsToRegions(mixed, ['INTL']))).toEqual(['INTL']);
  });

  it('keeps every citation when none matches the region', () => {
    const usOnly = cite('NIST_SP_800_53', 'NIST_IR_8547');
    expect(scopeCitationsToRegions(usOnly, ['UK'])).toEqual(usOnly);
  });
});
