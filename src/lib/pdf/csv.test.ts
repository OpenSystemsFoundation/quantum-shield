import { describe, expect, it } from 'vitest';
import { buildFindingsCsv } from './csv.js';
import type { Finding, Report } from './types.js';

function mkFinding(partial: Partial<Finding> = {}): Finding {
  return {
    id: 'F-1',
    category: 'certificates',
    severity: 'high',
    regulatoryStatus: 'advisory',
    migrationPosture: 'advisory',
    effort: 'low',
    hndlExposure: false,
    title: 'plain title',
    asset: { kind: 'certificate', name: 'cert', identifier: 'abc' },
    currentCrypto: 'RSA-2048',
    recommendedReplacement: 'ML-DSA',
    rationale: 'r',
    citations: [],
    ...partial,
  };
}

function mkReport(findings: Finding[]): Report {
  return {
    schemaVersion: '1',
    generatedAt: '2026-04-22T10:00:00.000Z',
    scanStartedAt: '2026-04-22T09:59:00.000Z',
    scanFinishedAt: '2026-04-22T10:00:00.000Z',
    generator: { name: 'QuantumShield', version: '0.1.0', mode: 'cli' },
    coverage: [],
    org: {
      orgId: '00D000000000001',
      instanceUrl: 'https://acme.my.salesforce.com',
      orgName: 'Acme EU',
      orgType: 'production',
      apiVersion: '62.0',
      userLicense: 'Salesforce',
    },
    findings,
    overlays: [],
    sourceVersions: [],
    summary: {
      totalFindings: findings.length,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byCategory: {
        certificates: 0,
        'connected-apps': 0,
        'named-credentials': 0,
        'remote-sites': 0,
        sso: 0,
        'shield-encryption': 0,
        'apex-crypto': 0,
        'session-login': 0,
        packages: 0,
      },
      hndlFindings: 0,
      postureSentence: 'clean',
    },
    cbom: [],
  };
}

describe('buildFindingsCsv formula-injection escaping (OWASP)', () => {
  it('neutralises fields starting with =, +, -, @', () => {
    const payloads = ['=HYPERLINK("http://evil")', '+cmd|/c calc', '-2+3', '@SUM(A1)'];
    for (const payload of payloads) {
      const csv = buildFindingsCsv(mkReport([mkFinding({ title: payload })]));
      const dataLine = csv.split('\r\n')[1];
      // The raw payload must never appear at the start of a cell — it must be
      // quoted with a leading single quote.
      expect(dataLine).toContain(`"'${payload.replace(/"/g, '""')}"`);
      expect(dataLine.split(',').some((cell) => cell.startsWith(payload[0]))).toBe(false);
    }
  });

  it('neutralises tab and carriage-return prefixed payloads', () => {
    const csv = buildFindingsCsv(mkReport([mkFinding({ title: '\t=1+1', asset: { kind: 'certificate', name: '\r=2+2', identifier: 'abc' } })]));
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain(`"'\t=1+1"`);
    expect(dataLine).toContain(`"'\r=2+2"`);
  });

  it('leaves ordinary fields untouched', () => {
    const csv = buildFindingsCsv(mkReport([mkFinding({ title: 'plain title' })]));
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('plain title');
    expect(dataLine).not.toContain("'plain title");
  });

  it('does not treat interior special characters as triggers and still quotes commas/quotes', () => {
    const csv = buildFindingsCsv(
      mkReport([mkFinding({ title: 'uses a = sign, and "quotes"' })]),
    );
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('"uses a = sign, and ""quotes"""');
  });
});
