import { describe, expect, it } from 'vitest';
import { buildCbomJson } from './cbom.js';
import { buildVexJson } from './vex.js';
import { classifyCryptoAsset } from './crypto-classification.js';
import { demoReport } from './fixtures/demo-report.js';
import { QSHIELD_HOMEPAGE, QSHIELD_VERSION } from '../version.js';
import type { CbomComponent, Report } from './types.js';

// CycloneDX 1.6 closed enums (bom-1.6.schema.json). Every emitted value MUST
// be in these sets or downstream schema validation rejects the CBOM.
const CDX_ASSET_TYPES = new Set([
  'algorithm',
  'certificate',
  'protocol',
  'related-crypto-material',
]);

const CDX_PRIMITIVES = new Set([
  'drbg',
  'mac',
  'block-cipher',
  'stream-cipher',
  'signature',
  'hash',
  'pke',
  'xof',
  'kdf',
  'key-agree',
  'kem',
  'ae',
  'combiner',
  'other',
  'unknown',
]);

const CDX_EXECUTION_ENVIRONMENTS = new Set([
  'software-plain-ram',
  'software-encrypted-ram',
  'software-tee',
  'hardware',
  'other',
  'unknown',
]);

const CDX_RELATED_MATERIAL_TYPES = new Set([
  'private-key',
  'public-key',
  'secret-key',
  'key',
  'ciphertext',
  'signature',
  'digest',
  'initialization-vector',
  'nonce',
  'seed',
  'salt',
  'shared-secret',
  'tag',
  'additional-data',
  'password',
  'credential',
  'token',
  'other',
  'unknown',
]);

const CDX_PROTOCOL_TYPES = new Set(['tls', 'ssh', 'ipsec', 'ike', 'sstp', 'wpa', 'other', 'unknown']);

function mkReport(partial: Partial<Report> = {}): Report {
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

  it('rates SHA-384 at level 4 and SHA-512 at level 5', () => {
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'SHA-384', location: '', quantumSafe: false }).nistQuantumSecurityLevel).toBe(4);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'SHA-512', location: '', quantumSafe: false }).nistQuantumSecurityLevel).toBe(5);
  });

  it('recognises ML-KEM / ML-DSA as quantum-safe with FIPS labels', () => {
    const kem = classifyCryptoAsset({ name: 'x', type: 'protocol', algorithm: 'ML-KEM', keySize: 768, location: '', quantumSafe: false });
    expect(kem.quantumSafe).toBe(true);
    expect(kem.legalAlgorithmName).toContain('FIPS 203');
    const dsa = classifyCryptoAsset({ name: 'x', type: 'key', algorithm: 'ML-DSA', keySize: 65, location: '', quantumSafe: false });
    expect(dsa.legalAlgorithmName).toContain('FIPS 204');
  });

  it('resolves NIST CSOR OIDs within the correct family', () => {
    // ML-KEM lives under 2.16.840.1.101.3.4.4.*
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-KEM-768', location: '', quantumSafe: true }).oid).toBe('2.16.840.1.101.3.4.4.2');
    // ML-DSA lives under 2.16.840.1.101.3.4.3.* and must never pick up an ML-KEM arc
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-DSA', keySize: 65, location: '', quantumSafe: true }).oid).toBe('2.16.840.1.101.3.4.3.18');
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-DSA-44', location: '', quantumSafe: true }).oid).toBe('2.16.840.1.101.3.4.3.17');
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-DSA-87', location: '', quantumSafe: true }).oid).toBe('2.16.840.1.101.3.4.3.19');
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'SLH-DSA-SHA2-128s', location: '', quantumSafe: true }).oid).toBe('2.16.840.1.101.3.4.3.20');
    // Unknown SLH-DSA variant: omit the OID rather than emit a wrong one.
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'SLH-DSA', location: '', quantumSafe: true }).oid).toBeUndefined();
  });

  it('assigns FIPS 204 security categories: ML-DSA-44 → 2, ML-DSA-65 → 3, ML-DSA-87 → 5', () => {
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-DSA-44', location: '', quantumSafe: true }).nistQuantumSecurityLevel).toBe(2);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-DSA-65', location: '', quantumSafe: true }).nistQuantumSecurityLevel).toBe(3);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-DSA-87', location: '', quantumSafe: true }).nistQuantumSecurityLevel).toBe(5);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-KEM-512', location: '', quantumSafe: true }).nistQuantumSecurityLevel).toBe(1);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'ML-KEM-1024', location: '', quantumSafe: true }).nistQuantumSecurityLevel).toBe(5);
  });

  it('reports quantum security level 0 for RSA at every key size', () => {
    for (const keySize of [2048, 3072, 4096, 15360]) {
      const cls = classifyCryptoAsset({ name: 'x', type: 'certificate', algorithm: 'RSA', keySize, location: '', quantumSafe: false });
      expect(cls.nistQuantumSecurityLevel, `RSA-${keySize}`).toBe(0);
      expect(cls.quantumSafe).toBe(false);
    }
  });

  it('classifies HMAC as a mac and Apex AES encryption with the CBC OID', () => {
    const mac = classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'HMAC-SHA256', location: '', quantumSafe: null });
    expect(mac.primitive).toBe('mac');
    expect(mac.oid).toBe('1.2.840.113549.2.9');
    expect(mac.quantumSafe).toBe(true);
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'HMAC-SHA1', location: '', quantumSafe: null }).quantumSafe).toBeNull();

    const aes = classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'AES', keySize: 128, location: '', quantumSafe: null, usage: 'encryption' });
    expect(aes.oid).toBe('2.16.840.1.101.3.4.1.2');
    expect(aes.nistQuantumSecurityLevel).toBe(1);
    expect(aes.quantumSafe).toBe(true);
    // The bare AES arc is not an algorithm OID.
    expect(classifyCryptoAsset({ name: 'x', type: 'key', algorithm: 'AES', keySize: 256, location: '', quantumSafe: null }).oid).toBeUndefined();
  });

  it('keeps unknown quantum safety as null instead of false', () => {
    expect(classifyCryptoAsset({ name: 'x', type: 'protocol', algorithm: 'TLS (version and cipher not probed)', location: '', quantumSafe: null }).quantumSafe).toBeNull();
    expect(classifyCryptoAsset({ name: 'x', type: 'algorithm', algorithm: 'UNRESOLVED', location: '', quantumSafe: null }).quantumSafe).toBeNull();
  });

  it('only emits CycloneDX-valid primitives', () => {
    const inputs: CbomComponent[] = [
      { name: 'a', type: 'certificate', algorithm: 'RSA', keySize: 2048, location: '', quantumSafe: false },
      { name: 'b', type: 'key', algorithm: 'ECDSA', keySize: 256, location: '', quantumSafe: false },
      { name: 'c', type: 'algorithm', algorithm: 'SHA-256', location: '', quantumSafe: true },
      { name: 'd', type: 'protocol', algorithm: 'HTTP (no TLS)', location: '', quantumSafe: false },
      { name: 'e', type: 'protocol', algorithm: 'OAuth', location: '', quantumSafe: false },
      { name: 'f', type: 'library', algorithm: 'unknown', location: '', quantumSafe: false },
      { name: 'g', type: 'algorithm', algorithm: 'ML-KEM-768', location: '', quantumSafe: true },
      { name: 'h', type: 'algorithm', algorithm: 'HMAC-SHA1', location: '', quantumSafe: null },
      { name: 'i', type: 'algorithm', algorithm: 'UNRESOLVED', location: '', quantumSafe: null },
      { name: 'j', type: 'key', algorithm: 'HARDCODED-HMAC-KEY', location: '', quantumSafe: null },
    ];
    for (const c of inputs) {
      const cls = classifyCryptoAsset(c);
      expect(CDX_PRIMITIVES.has(cls.primitive), `primitive "${cls.primitive}" for ${c.name}`).toBe(true);
    }
  });
});

describe('buildCbomJson (CycloneDX 1.6)', () => {
  it('gives each asset type only its own properties object', () => {
    const report = mkReport({
      cbom: [
        {
          name: 'rsa-cert',
          type: 'certificate',
          algorithm: 'RSA',
          keySize: 2048,
          location: 'Certificate/abc',
          quantumSafe: false,
          notValidAfter: '2027-06-01T12:00:00.000+0000',
        },
        { name: 'aes-key', type: 'key', algorithm: 'AES', keySize: 256, location: 'TenantSecret/xyz', quantumSafe: true },
        {
          name: 'Signer.cls',
          type: 'algorithm',
          algorithm: 'RSA-SHA384',
          location: 'Signer.cls:4',
          quantumSafe: false,
          usage: 'signature',
        },
        {
          name: 'https://api.example.com (probed)',
          type: 'protocol',
          algorithm: 'TLS_AES_256_GCM_SHA384',
          location: 'x',
          quantumSafe: null,
          protocol: 'tls',
          protocolVersion: '1.3',
        },
        {
          name: 'Partner API',
          type: 'protocol',
          algorithm: 'TLS (version and cipher not probed)',
          location: 'https://api.example.com/v1',
          quantumSafe: null,
          protocol: 'tls',
        },
        { name: 'Legacy', type: 'protocol', algorithm: 'HTTP (no TLS)', location: 'http://x.example', quantumSafe: false, protocol: 'http' },
      ],
    });
    const parsed = JSON.parse(buildCbomJson(report));
    expect(parsed.bomFormat).toBe('CycloneDX');
    expect(parsed.specVersion).toBe('1.6');
    const [cert, aes, algo, probed, unprobed, http] = parsed.components;
    const prop = (comp: { properties: Array<{ name: string; value: string }> }, name: string) =>
      comp.properties.find((p) => p.name === name)?.value;

    expect(cert.cryptoProperties.assetType).toBe('certificate');
    expect(cert.cryptoProperties.algorithmProperties).toBeUndefined();
    expect(cert.cryptoProperties.certificateProperties.notValidAfter).toBe('2027-06-01T12:00:00.000Z');
    expect(prop(cert, 'quantumshield:public-key-algorithm')).toBe('RSA-2048');

    expect(aes.cryptoProperties.assetType).toBe('related-crypto-material');
    expect(aes.cryptoProperties.algorithmProperties).toBeUndefined();
    expect(aes.cryptoProperties.relatedCryptoMaterialProperties).toEqual({ type: 'secret-key', size: 256 });

    expect(algo.cryptoProperties.assetType).toBe('algorithm');
    expect(algo.cryptoProperties.oid).toBe('1.2.840.113549.1.1.12');
    expect(algo.cryptoProperties.algorithmProperties.primitive).toBe('signature');
    expect(algo.cryptoProperties.algorithmProperties.executionEnvironment).toBe('other');
    expect(algo.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel).toBe(0);

    expect(probed.cryptoProperties.algorithmProperties).toBeUndefined();
    expect(probed.cryptoProperties.protocolProperties).toEqual({
      type: 'tls',
      version: '1.3',
      cipherSuites: [{ name: 'TLS_AES_256_GCM_SHA384' }],
    });
    expect(prop(probed, 'quantumshield:quantum-safe')).toBe('unknown');

    // An HTTPS endpoint is TLS even when it was not probed; no version is invented.
    expect(unprobed.cryptoProperties.protocolProperties).toEqual({ type: 'tls' });
    expect(http.cryptoProperties.protocolProperties).toEqual({ type: 'other' });
    expect(prop(http, 'quantumshield:quantum-safe')).toBe('false');
  });

  it('moves quantumSafe out of cryptoProperties into spec-legal name/value properties', () => {
    const report = mkReport({
      cbom: [
        { name: 'rsa-cert', type: 'certificate', algorithm: 'RSA', keySize: 2048, location: 'Certificate/abc', quantumSafe: false },
        { name: 'aes-key', type: 'key', algorithm: 'AES', keySize: 256, location: 'TenantSecret/xyz', quantumSafe: false },
      ],
    });
    const parsed = JSON.parse(buildCbomJson(report));
    for (const component of parsed.components) {
      expect(component.cryptoProperties.quantumSafe).toBeUndefined();
    }
    const props = (name: string, comp: { properties: Array<{ name: string; value: string }> }) =>
      comp.properties.find((p) => p.name === name)?.value;
    expect(props('quantumshield:quantum-safe', parsed.components[0])).toBe('false');
    expect(props('quantumshield:quantum-safe', parsed.components[1])).toBe('true');
    expect(props('quantumshield:execution-environment', parsed.components[0])).toBe('salesforce-hyperforce');
  });

  it('stamps the shared tool version into metadata', () => {
    const parsed = JSON.parse(buildCbomJson(mkReport()));
    expect(parsed.metadata.tools[0].version).toBe(QSHIELD_VERSION);
  });

  it('emits only schema-valid enum values for every component of the demo report', () => {
    const parsed = JSON.parse(buildCbomJson(demoReport));
    expect(parsed.components.length).toBeGreaterThan(0);
    for (const component of parsed.components) {
      const cp = component.cryptoProperties;
      expect(CDX_ASSET_TYPES.has(cp.assetType), `assetType "${cp.assetType}" on ${component.name}`).toBe(true);
      expect(cp.quantumSafe).toBeUndefined();
      if (cp.algorithmProperties) {
        const ap = cp.algorithmProperties;
        expect(CDX_PRIMITIVES.has(ap.primitive), `primitive "${ap.primitive}" on ${component.name}`).toBe(true);
        if (ap.executionEnvironment !== undefined) {
          expect(
            CDX_EXECUTION_ENVIRONMENTS.has(ap.executionEnvironment),
            `executionEnvironment "${ap.executionEnvironment}" on ${component.name}`,
          ).toBe(true);
        }
        if (ap.nistQuantumSecurityLevel !== undefined) {
          expect(ap.nistQuantumSecurityLevel).toBeGreaterThanOrEqual(0);
          expect(ap.nistQuantumSecurityLevel).toBeLessThanOrEqual(6);
          expect(Number.isInteger(ap.nistQuantumSecurityLevel)).toBe(true);
        }
      }
      if (cp.relatedCryptoMaterialProperties) {
        expect(CDX_RELATED_MATERIAL_TYPES.has(cp.relatedCryptoMaterialProperties.type)).toBe(true);
      }
      if (cp.protocolProperties) {
        expect(CDX_PROTOCOL_TYPES.has(cp.protocolProperties.type)).toBe(true);
      }
    }
  });
});

describe('buildVexJson (OpenVEX)', () => {
  it('emits one affected statement per non-advisory finding with action statement and HNDL notes', () => {
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
    // impact prose lives in status_notes — impact_statement is only legal on not_affected
    expect(stmt.status_notes).toContain('Harvest-now-decrypt-later');
    expect(stmt.status_notes).toContain('RSA-1024 is disallowed.');
    expect(stmt.products[0].identifiers.purl).toMatch(/pkg:salesforce/);
  });

  it('reports advisory findings as affected, not under_investigation', () => {
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
    expect(parsed.statements[0].status).toBe('affected');
    expect(parsed.statements[0].action_statement).toBe('Plan hybrid.');
    expect(parsed.statements[0].status_notes).toContain('advisory');
    expect(parsed.statements[0].status_notes).not.toContain('Harvest-now-decrypt-later');
  });

  it('turns incomplete scan coverage into under_investigation statements', () => {
    const report = mkReport({
      findings: [],
      coverage: [
        { id: 'certificates', label: 'Certificates & keys', status: 'scanned', assetCount: 2, findingCount: 0 },
        { id: 'sso', label: 'Single Sign-On', status: 'failed', assetCount: 0, findingCount: 0, detail: 'HTTP 500' },
        { id: 'shield-encryption', label: 'Shield Platform Encryption', status: 'skipped', assetCount: 0, findingCount: 0 },
      ],
    });
    const parsed = JSON.parse(buildVexJson(report));
    // A scan with no findings but failed categories must not be an empty VEX.
    expect(parsed.statements).toHaveLength(2);
    for (const stmt of parsed.statements) {
      expect(stmt.status).toBe('under_investigation');
      expect(stmt.vulnerability.name).toMatch(/^QSHIELD-COVERAGE:/);
      // OpenVEX 0.2.0: these fields are not legal on under_investigation.
      expect(stmt.justification).toBeUndefined();
      expect(stmt.impact_statement).toBeUndefined();
      expect(stmt.action_statement).toBeUndefined();
    }
    expect(parsed.statements[0].status_notes).toContain('HTTP 500');
    // No non-standard top-level fields.
    expect(Object.keys(parsed).sort()).toEqual(
      ['@context', '@id', 'author', 'statements', 'timestamp', 'tooling', 'version'].sort(),
    );
  });

  it('never emits justification or impact_statement outside not_affected statements', () => {
    const parsed = JSON.parse(buildVexJson(demoReport));
    expect(parsed.statements.length).toBeGreaterThan(0);
    for (const stmt of parsed.statements) {
      if (stmt.status !== 'not_affected') {
        expect(stmt.justification, `justification on ${stmt['@id']} (${stmt.status})`).toBeUndefined();
        expect(stmt.impact_statement, `impact_statement on ${stmt['@id']} (${stmt.status})`).toBeUndefined();
      }
    }
  });

  it('builds document and statement IDs from the real project homepage', () => {
    const parsed = JSON.parse(buildVexJson(demoReport));
    expect(parsed['@id'].startsWith(`${QSHIELD_HOMEPAGE}/vex/`)).toBe(true);
    expect(parsed['@id']).not.toContain('https://quantum-shield/');
    for (const stmt of parsed.statements) {
      expect(stmt['@id'].startsWith(`${QSHIELD_HOMEPAGE}/vex/`)).toBe(true);
    }
    expect(parsed.tooling).toContain(QSHIELD_VERSION);
  });
});
