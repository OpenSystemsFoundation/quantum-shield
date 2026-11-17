import { describe, expect, it } from 'vitest';
import type { CryptoAsset, DataProfile, Finding } from '@lib/pdf';
import type { QueryResult, ScanClient } from '@lib/scan/sfClient';
import { AuthError } from '@lib/scan/sfClient';
import {
  DEFAULT_ASSUMPTIONS,
  applyRiskSettings,
  buildDataProfile,
  prioritize,
  sanitizeSettings,
  scoreFinding,
  tierForClassification,
  tierForCompliance,
} from './index';

function finding(partial: Partial<Finding> & { asset: CryptoAsset }): Finding {
  return {
    id: `R-X:${partial.asset.kind}:${partial.asset.identifier}`,
    category: 'named-credentials',
    severity: 'medium',
    regulatoryStatus: 'deprecated-by-date',
    migrationPosture: 'plan-2030',
    effort: 'medium',
    hndlExposure: true,
    title: 't',
    currentCrypto: 'c',
    recommendedReplacement: 'r',
    rationale: 'why',
    citations: [],
    ...partial,
  };
}

const callout = (id: string): CryptoAsset => ({
  kind: 'named-credential',
  name: id,
  identifier: id,
  endpointUrl: `https://${id}.example`,
});

const profile = (orgTier: DataProfile['orgTier'], shieldTier?: DataProfile['shieldTier']): DataProfile => ({
  entries: [{ object: 'Contact', tier: orgTier, sources: ['default'], detail: 'd' }],
  orgTier,
  ...(shieldTier ? { shieldTier } : {}),
  objectsInspected: 1,
});

const SCAN_DATE = '2026-01-01T00:00:00.000Z';

describe('classification mapping', () => {
  it('maps Salesforce sensitivity levels', () => {
    expect(tierForClassification('Public')).toBeNull();
    expect(tierForClassification('Internal')).toBe('internal');
    expect(tierForClassification('Confidential')).toBe('confidential');
    expect(tierForClassification('Restricted')).toBe('regulated');
    expect(tierForClassification('MissionCritical')).toBe('regulated');
  });

  it('maps compliance categories, strongest wins', () => {
    expect(tierForCompliance('PII;GDPR')).toBe('personal');
    expect(tierForCompliance('GDPR;HIPAA')).toBe('regulated');
    expect(tierForCompliance('PCI')).toBe('regulated');
    expect(tierForCompliance('SOX')).toBe('confidential');
    expect(tierForCompliance('')).toBeNull();
  });
});

describe('scoreFinding (shelf life + migration vs years to quantum)', () => {
  it('flags a harvestable callout carrying long-lived data as act-now', () => {
    const p = scoreFinding(finding({ asset: callout('a'), effort: 'high' }), profile('regulated'), DEFAULT_ASSUMPTIONS, SCAN_DATE);
    // 25 + 4 − (2033 − 2026) = 22
    expect(p.shelfLifeYears).toBe(25);
    expect(p.migrationYears).toBe(4);
    expect(p.yearsToQuantum).toBe(7);
    expect(p.marginYears).toBe(22);
    expect(p.band).toBe('act-now');
    expect(p.dataTier).toBe('regulated');
  });

  it('gives the same callout slack when it only carries short-lived data', () => {
    const p = scoreFinding(finding({ asset: callout('a'), effort: 'low' }), profile('ephemeral'), DEFAULT_ASSUMPTIONS, SCAN_DATE);
    // 0 + 1 − 7 = −6
    expect(p.marginYears).toBe(-6);
    expect(p.band).toBe('monitor');
  });

  it('uses plan when the slack is under three years', () => {
    const p = scoreFinding(finding({ asset: callout('a'), effort: 'medium' }), profile('internal'), DEFAULT_ASSUMPTIONS, SCAN_DATE);
    // 3 + 2 − 7 = −2
    expect(p.band).toBe('plan');
  });

  it('ignores shelf life for signatures (nothing to decrypt later)', () => {
    const sig = finding({
      asset: { kind: 'saml-sso', name: 's', identifier: 's', algorithm: 'RSA', usage: 'signature' },
      hndlExposure: false,
      effort: 'medium',
    });
    const p = scoreFinding(sig, profile('regulated'), DEFAULT_ASSUMPTIONS, SCAN_DATE);
    expect(p.dataTier).toBe('none');
    expect(p.shelfLifeYears).toBe(0);
    expect(p.marginYears).toBe(-5);
    expect(p.band).toBe('monitor');
  });

  it('keeps classically weak findings at act-now whatever the timeline', () => {
    const weak = finding({ asset: callout('h'), hndlExposure: false, migrationPosture: 'replace-now', effort: 'low' });
    expect(scoreFinding(weak, profile('ephemeral'), DEFAULT_ASSUMPTIONS, SCAN_DATE).band).toBe('act-now');
  });

  it('uses the Shield tier for Shield keys and the reader override above all', () => {
    const key = finding({
      asset: { kind: 'shield-key', name: 'k', identifier: 'k', usage: 'encryption' },
      category: 'shield-encryption',
    });
    expect(scoreFinding(key, profile('personal', 'regulated'), DEFAULT_ASSUMPTIONS, SCAN_DATE).dataTier).toBe('regulated');
    const overridden = scoreFinding(key, profile('personal', 'regulated'), DEFAULT_ASSUMPTIONS, SCAN_DATE, {
      'shield-key:k': 'internal',
    });
    expect(overridden.dataTier).toBe('internal');
    expect(overridden.dataBasis).toMatch(/Set by you/);
  });

  it('assumes personal data when no profile was read', () => {
    expect(scoreFinding(finding({ asset: callout('a') }), undefined, DEFAULT_ASSUMPTIONS, SCAN_DATE).dataTier).toBe('personal');
  });
});

describe('prioritize', () => {
  it('ranks by band, then data at stake, then margin', () => {
    const findings = [
      finding({ asset: callout('low'), effort: 'low' }),
      finding({ asset: callout('regulated'), effort: 'high' }),
      finding({ asset: callout('plain'), hndlExposure: false, migrationPosture: 'replace-now', effort: 'low' }),
    ];
    const map = prioritize({
      findings,
      dataProfile: profile('personal'),
      scanDate: SCAN_DATE,
      overrides: { 'named-credential:low': 'ephemeral', 'named-credential:regulated': 'regulated' },
    });
    const order = [...map.entries()].sort((a, b) => a[1].rank - b[1].rank).map(([id]) => id.split(':')[2]);
    expect(order).toEqual(['regulated', 'plain', 'low']);
  });

  it('moves findings between bands when the quantum year changes', () => {
    const f = finding({ asset: callout('a'), effort: 'medium' });
    const early = prioritize({
      findings: [f],
      dataProfile: profile('internal'),
      scanDate: SCAN_DATE,
      assumptions: { ...DEFAULT_ASSUMPTIONS, quantumYear: 2030 },
    });
    const late = prioritize({
      findings: [f],
      dataProfile: profile('internal'),
      scanDate: SCAN_DATE,
      assumptions: { ...DEFAULT_ASSUMPTIONS, quantumYear: 2040 },
    });
    expect(early.get(f.id)?.band).toBe('act-now');
    expect(late.get(f.id)?.band).toBe('monitor');
  });
});

describe('applyRiskSettings', () => {
  it('returns a sorted copy with matching counts and assumptions, leaving the input alone', () => {
    const findings = [finding({ asset: callout('b'), effort: 'low' }), finding({ asset: callout('a'), effort: 'high' })];
    const report = {
      scanStartedAt: SCAN_DATE,
      findings,
      dataProfile: profile('regulated'),
      summary: { totalFindings: 2 },
    } as never;
    const out = applyRiskSettings(report, { ...DEFAULT_ASSUMPTIONS, quantumYear: 2050 }) as unknown as {
      findings: Finding[];
      riskAssumptions: { quantumYear: number };
      summary: { priorityCounts: Record<string, number> };
    };
    expect(out.findings.map((f) => f.priority?.rank)).toEqual([1, 2]);
    expect(out.riskAssumptions.quantumYear).toBe(2050);
    expect(out.summary.priorityCounts['act-now'] + out.summary.priorityCounts.plan + out.summary.priorityCounts.monitor).toBe(2);
    expect(findings[0].priority).toBeUndefined();
  });
});

describe('sanitizeSettings', () => {
  it('falls back to defaults on junk and drops unknown tiers', () => {
    const s = sanitizeSettings({
      assumptions: { quantumYear: 1999, shelfLifeYears: { personal: -4, regulated: 'x' }, migrationYears: { high: 400 } },
      overrides: { 'named-credential:a': 'regulated', 'named-credential:b': 'nonsense' },
    });
    expect(s.assumptions.quantumYear).toBe(DEFAULT_ASSUMPTIONS.quantumYear);
    expect(s.assumptions.shelfLifeYears.personal).toBe(0);
    expect(s.assumptions.shelfLifeYears.regulated).toBe(DEFAULT_ASSUMPTIONS.shelfLifeYears.regulated);
    expect(s.assumptions.migrationYears.high).toBe(30);
    expect(s.overrides).toEqual({ 'named-credential:a': 'regulated' });
  });
});

/** Minimal client answering by SOQL substring. */
function fakeClient(answers: Array<[RegExp, unknown[] | Error]>): ScanClient {
  const answer = async <T>(soql: string): Promise<QueryResult<T>> => {
    for (const [re, value] of answers) {
      if (re.test(soql)) {
        if (value instanceof Error) throw value;
        return { totalSize: value.length, done: true, records: value as T[] };
      }
    }
    return { totalSize: 0, done: true, records: [] };
  };
  return { query: answer, toolingQuery: answer, sobject: () => Promise.reject(new Error('no')) };
}

describe('buildDataProfile', () => {
  it('combines classification, Shield encryption and standard-object defaults', async () => {
    const client = fakeClient([
      [/FROM EntityDefinition WHERE QualifiedApiName IN/, [{ QualifiedApiName: 'Contact' }, { QualifiedApiName: 'Opportunity' }]],
      [/FROM EntityDefinition WHERE QualifiedApiName LIKE/, [{ QualifiedApiName: 'Patient__c' }, { QualifiedApiName: 'Topic' }]],
      [
        /SecurityClassification != null/,
        [{ QualifiedApiName: 'Diagnosis__c', EntityDefinition: { QualifiedApiName: 'Patient__c' }, SecurityClassification: 'MissionCritical', ComplianceGroup: 'HIPAA' }],
      ],
      [
        /ComplianceGroup != null/,
        [{ QualifiedApiName: 'Diagnosis__c', EntityDefinition: { QualifiedApiName: 'Patient__c' }, SecurityClassification: 'MissionCritical', ComplianceGroup: 'HIPAA' }],
      ],
      [/FROM EntityParticle/, [{ QualifiedApiName: 'Tax_Id__c', EntityDefinition: { QualifiedApiName: 'Opportunity' } }]],
    ]);
    const { profile: p, failures } = await buildDataProfile(client);
    expect(failures).toEqual([]);
    expect(p.orgTier).toBe('regulated');
    // Encrypted fields are at least confidential (Opportunity's default).
    expect(p.shieldTier).toBe('confidential');
    const diag = p.entries.find((e) => e.field === 'Diagnosis__c');
    expect(diag?.sources).toEqual(['classification', 'compliance']);
    expect(p.entries.find((e) => e.object === 'Contact' && !e.field)?.tier).toBe('personal');
    // 'Topic' matched LIKE '%__c' only because `_` is a SOQL wildcard.
    expect(p.objectsInspected).toBe(3);
  });

  it('records failures without failing, but lets auth errors through', async () => {
    const broken = fakeClient([[/FieldDefinition/, new Error('boom')]]);
    const { failures } = await buildDataProfile(
      fakeClient([
        [/FROM EntityDefinition WHERE QualifiedApiName IN/, [{ QualifiedApiName: 'Contact' }]],
        [/FieldDefinition/, new Error('boom')],
      ]),
    );
    expect(failures.length).toBe(2);
    await expect(buildDataProfile(broken)).resolves.toBeTruthy();
    await expect(buildDataProfile(fakeClient([[/EntityDefinition/, new AuthError('expired')]]))).rejects.toBeInstanceOf(AuthError);
  });
});
