import { describe, expect, it } from 'vitest';
import { buildCbomJson } from './cbom.js';
import { buildVexJson } from './vex.js';
import { classifyCryptoAsset } from './crypto-classification.js';
import type { CbomComponent, Report } from './types.js';

function mkReport(partial: Partial<Report> = {}): Report {
  return {
    schemaVersion: '1',
    generatedAt: '2026-04-22T10:00:00.000Z',
    scanStartedAt: '2026-04-22T09:59:00.000Z',
    scanFinishedAt: '2026-04-22T10:00:00.000Z',
    org: {
      orgId: '00D000000000001',
      instanceUrl: 'https://acme.my.salesforce.com',
      orgName: 'Acme EU',
      orgType: 'production',
      apiVersion: '62.0',
      userLicense: 'Salesforce',
    },
    findings: [],
    overlays: [],
    sourceVersions: [],
    summary: {
      totalFindings: 0,
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
    ...partial,
  };
}

describe('crypto classification', () => {
  it('marks RSA-2048 as quantum-unsafe with a populated OID and zero security level', () => {
    const c: CbomComponent = {
      name: 'saml-signer',
      type: 'certificate',
      algorithm: 'RSA',
      keySize: 2048,
      location: 'Certificate/a01...',
      quantumSafe: false,
    };
    const cls = classifyCryptoAsset(c);
    expect(cls.quantumSafe).toBe(false);
    expect(cls.legalAlgorithmName).toBe('RSA-2048');
    expect(cls.oid).toBe('1.2.840.113549.1.1.1');
    expect(cls.nistQuantumSecurityLevel).toBe(0);
  });

  it('marks AES-256 as quantum-safe at NIST security level 5', () => {
    const c: CbomComponent = {
      name: 'shield-tenant-secret',
      type: 'key',
      algorithm: 'AES',
      keySize: 256,
      location: 'TenantSecret/a02...',
      quantumSafe: false,
    };
    const cls = classifyCryptoAsset(c);
    expect(cls.quantumSafe).toBe(true);
    expect(cls.nistQuantumSecurityLevel).toBe(5);
    expect(cls.legalAlgorithmName).toBe('AES-256');
  });

  it('flags MD5 and SHA-1 as quantum-unsafe hash functions', () => {
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'MD5', location: '', quantumSafe: false }).nistQuantumSecurityLevel).toBe(0);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'SHA-1', location: '', quantumSafe: false }).nistQuantumSecurityLevel).toBe(0);
  });

  it('recognises ML-KEM / ML-DSA as quantum-safe with FIPS labels', () => {
    const kem = classifyCryptoAsset({ name: 'x', type: 'protocol', algorithm: 'ML-KEM', keySize: 768, location: '', quantumSafe: false });
    expect(kem.quantumSafe).toBe(true);
    expect(kem.legalAlgorithmName).toContain('FIPS 203');
    const dsa = classifyCryptoAsset({ name: 'x', type: 'key', algorithm: 'ML-DSA', keySize: 65, location: '', quantumSafe: false });
    expect(dsa.legalAlgorithmName).toContain('FIPS 204');
  });
});

describe('buildCbomJson (CycloneDX 1.6)', () => {
  it('populates executionEnvironment, nistQuantumSecurityLevel and oid per component', () => {
    const report = mkReport({
      cbom: [
        { name: 'rsa-cert', type: 'certificate', algorithm: 'RSA', keySize: 2048, location: 'Certificate/abc', quantumSafe: false },
        { name: 'aes-key', type: 'key', algorithm: 'AES', keySize: 256, location: 'TenantSecret/xyz', quantumSafe: false },
      ],
    });
    const parsed = JSON.parse(buildCbomJson(report));
    expect(parsed.bomFormat).toBe('CycloneDX');
    expect(parsed.specVersion).toBe('1.6');
    expect(parsed.components).toHaveLength(2);

    const rsa = parsed.components[0];
    expect(rsa.cryptoProperties.quantumSafe).toBe(false);
    expect(rsa.cryptoProperties.oid).toBe('1.2.840.113549.1.1.1');
    expect(rsa.cryptoProperties.algorithmProperties.executionEnvironment).toBe('salesforce-hyperforce');
    expect(rsa.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel).toBe(0);

    const aes = parsed.components[1];
    expect(aes.cryptoProperties.quantumSafe).toBe(true);
    expect(aes.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel).toBe(5);
  });
});

describe('buildVexJson (OpenVEX)', () => {
  it('emits one affected statement per non-advisory finding with action + HNDL impact', () => {
    const report = mkReport({
      findings: [
        {
          id: 'R-RSA-1024:certificate:abc',
          category: 'certificates',
          severity: 'critical',
          regulatoryStatus: 'already-non-compliant',
          migrationPosture: 'replace-now',
          effort: 'low',
          hndlExposure: true,
          title: 'RSA-1024 in active use',
          asset: { kind: 'certificate', name: 'legacy', identifier: 'abc' },
          currentCrypto: 'RSA-1024',
          recommendedReplacement: 'Rotate to ML-DSA.',
          rationale: 'RSA-1024 is disallowed.',
          citations: [],
        },
      ],
    });

    const parsed = JSON.parse(buildVexJson(report));
    expect(parsed['@context']).toBe('https://openvex.dev/ns/v0.2.0');
    expect(parsed.statements).toHaveLength(1);
    const stmt = parsed.statements[0];
    expect(stmt.status).toBe('affected');
    expect(stmt.action_statement).toContain('ML-DSA');
    expect(stmt.impact_statement).toContain('Harvest-now-decrypt-later');
    expect(stmt.products[0].identifiers.purl).toMatch(/pkg:salesforce/);
  });

  it('emits under_investigation for advisory findings', () => {
    const report = mkReport({
      findings: [
        {
          id: 'R-ADV:certificate:xyz',
          category: 'certificates',
          severity: 'low',
          regulatoryStatus: 'advisory',
          migrationPosture: 'advisory',
          effort: 'low',
          hndlExposure: false,
          title: 'advisory only',
          asset: { kind: 'certificate', name: 'n', identifier: 'xyz' },
          currentCrypto: 'RSA-3072',
          recommendedReplacement: 'Plan hybrid.',
          rationale: 'advisory',
          citations: [],
        },
      ],
    });
    const parsed = JSON.parse(buildVexJson(report));
    expect(parsed.statements[0].status).toBe('under_investigation');
    expect(parsed.statements[0].impact_statement).toBeUndefined();
  });
});
