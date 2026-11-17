import { describe, expect, it } from 'vitest';
import type { CryptoAsset } from '@lib/pdf';
import { evaluate, isHndlRelevant, ruleCatalogForOverlays } from './engine.js';
import { isQuantumVulnerableSignature } from './catalog.js';

const ctx = {
  scanId: 'scan-test',
  now: new Date('2030-01-01T00:00:00.000Z'),
};

function findSingle(asset: CryptoAsset) {
  const findings = evaluate(asset, ruleCatalogForOverlays([]), ctx);
  expect(findings).toHaveLength(1);
  return findings[0];
}

describe('docs-backed rule catalog', () => {
  it('loads generated rules from documentation', () => {
    const rules = ruleCatalogForOverlays([]);
    expect(rules.map((rule) => rule.id)).toEqual([
      'R-RSA-1024',
      'R-RSA-2048',
      'R-ECDSA',
      'R-WEAK-HASH',
      'R-HTTP-ENDPOINT',
      'R-AES-128',
      'R-CERT-EXPIRY',
      'R-APEX-CRYPTO',
      'R-SESSION-LENGTH',
      'R-INSTALLED-PACKAGE-CRYPTO',
    ]);
  });

  it('evaluates RSA-1024 from the rule docs', () => {
    const finding = findSingle({
      kind: 'certificate',
      name: 'Legacy cert',
      identifier: 'legacy-cert',
      algorithm: 'RSA',
      keySize: 1024,
      signatureHash: 'SHA256',
    });

    expect(finding.title).toBe('RSA-1024 in active use — already non-compliant');
    expect(finding.severity).toBe('critical');
    expect(finding.citations.map((citation) => citation.sourceId)).toEqual([
      'NIST-SP-800-131A-r2',
      'BSI-TR-02102-1',
      'NIST-FIPS-204',
    ]);
  });

  it('evaluates certificate expiry windows from the rule docs', () => {
    const finding = findSingle({
      kind: 'certificate',
      name: 'Soon to expire',
      identifier: 'soon-expiring-cert',
      expiresAt: '2030-02-01T00:00:00.000Z',
    });

    expect(finding.title).toBe('Certificate expires in 31 days');
    expect(finding.deadline).toBe('2030-02-01');
    expect(finding.currentCrypto).toBe('Unknown; expires 2030-02-01T00:00:00.000Z');
  });

  it('evaluates Apex hardcoded key findings from the rule docs', () => {
    const finding = findSingle({
      kind: 'apex-call',
      name: 'Crypto.signWithManagedIV',
      identifier: 'MyClass.cls:42',
      algorithm: 'HARDCODED-KEY',
    });

    expect(finding.title).toBe('Hardcoded cryptographic key in Apex');
    expect(finding.severity).toBe('critical');
    expect(finding.citations.map((citation) => citation.sourceId)).toEqual([
      'NIST-SP-800-53-r5',
      'NIST-SP-800-57-pt1-r5',
    ]);
  });

  it('rates a long session timeout as a low hygiene advisory, in minutes', () => {
    const finding = findSingle({
      kind: 'session-settings',
      name: 'SessionSettings',
      identifier: 'session-settings',
      location: 'Session timeout: 720 minutes',
    });

    expect(finding.currentCrypto).toContain('720 minutes');
    expect(finding.severity).toBe('low');
    expect(finding.regulatoryStatus).toBe('advisory');
    expect(finding.deadline).toBeUndefined();
    expect(finding.citations.map((c) => c.sourceId)).toEqual(['NIST-SP-800-53-r5']);
  });

  it('does not flag short session timeouts', () => {
    for (const minutes of [15, 60, 120]) {
      const findings = evaluate(
        { kind: 'session-settings', name: 'SessionSettings', identifier: 's', location: `Session timeout: ${minutes} minutes` },
        ruleCatalogForOverlays([]),
        ctx,
      );
      expect(findings, `${minutes} minutes`).toHaveLength(0);
    }
  });

  it('flags expired certificates however long ago they expired', () => {
    // ctx.now is 2030-01-01. Expired 12 hours ago, 45 days ago, 3 years ago.
    for (const expiresAt of ['2029-12-31T12:00:00.000Z', '2029-11-17T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) {
      const finding = findSingle({ kind: 'certificate', name: 'old', identifier: `c-${expiresAt}`, expiresAt });
      expect(finding.title, expiresAt).toBe(`Certificate expired on ${expiresAt.slice(0, 10)}`);
      expect(finding.severity).toBe('high');
    }
  });

  it('uses the SP 800-131A 2013 date for sub-2048 RSA and SHA-1 signatures', () => {
    const findings = evaluate(
      { kind: 'certificate', name: 'c', identifier: 'c', algorithm: 'RSA', keySize: 1024, signatureHash: 'SHA-1' },
      ruleCatalogForOverlays([]),
      ctx,
    );
    expect(findings.map((f) => [f.id.split(':')[0], f.deadline])).toEqual([
      ['R-RSA-1024', '2013-12-31'],
      ['R-WEAK-HASH', '2013-12-31'],
    ]);
  });

  it('reports RSA with an unknown key size instead of passing it silently', () => {
    const finding = findSingle({
      kind: 'saml-sso',
      name: 'Okta',
      identifier: 'saml-1',
      algorithm: 'RSA',
      signatureHash: 'SHA-256',
      usage: 'signature',
    });
    expect(finding.id).toContain('R-RSA-2048');
    expect(finding.title).toBe('RSA with an unknown key size — plan PQC migration');
    expect(finding.deadline).toBe('2030-12-31');
    // SAML request signing is a signature use: not harvestable.
    expect(finding.hndlExposure).toBe(false);
  });

  it('rates AES-128 as a low advisory with no deadline and no HNDL exposure', () => {
    const finding = findSingle({
      kind: 'apex-call',
      name: 'Cipher.cls',
      identifier: 'c:1:AES128',
      algorithm: 'AES',
      keySize: 128,
      usage: 'encryption',
    });
    expect(finding.id).toContain('R-AES-128');
    expect(finding.severity).toBe('low');
    expect(finding.regulatoryStatus).toBe('advisory');
    expect(finding.deadline).toBeUndefined();
    expect(finding.hndlExposure).toBe(false);
    expect(finding.citations.map((c) => c.sourceId)).toEqual(['NSA-CNSA-2.0']);
    expect(finding.overlayIds).toBeUndefined();
  });

  it('produces exactly one finding for an Apex ECDSA call', () => {
    const finding = findSingle({
      kind: 'apex-call',
      name: 'Signer.cls',
      identifier: 's:18:ECDSA-SHA256',
      algorithm: 'ECDSA-SHA256',
      usage: 'signature',
    });
    expect(finding.id).toContain('R-APEX-CRYPTO');
    expect(finding.hndlExposure).toBe(false);
  });

  it('does not match ECDSA inside a TLS cipher-suite name', () => {
    const findings = evaluate(
      {
        kind: 'tls-endpoint',
        name: 'x',
        identifier: 'https://x.example',
        algorithm: 'ECDHE-ECDSA-AES256-GCM-SHA384',
        tlsVersion: 'TLSv1.3',
      },
      ruleCatalogForOverlays([]),
      ctx,
    );
    expect(findings).toHaveLength(0);
  });

  it('separates bare SHA-1 digests (high, 2030) from MD5 (critical) and SHA-1 signatures (critical, 2013)', () => {
    const apex = (algorithm: string) =>
      findSingle({ kind: 'apex-call', name: 'A.cls', identifier: `a:1:${algorithm}`, algorithm });
    const sha1 = apex('SHA-1');
    expect([sha1.severity, sha1.regulatoryStatus, sha1.deadline]).toEqual(['high', 'deprecated-by-date', '2030-12-31']);
    const md5 = apex('MD5');
    expect([md5.severity, md5.regulatoryStatus, md5.deadline]).toEqual(['critical', 'already-non-compliant', undefined]);
    const rsaSha1 = apex('RSA-SHA1');
    expect([rsaSha1.severity, rsaSha1.deadline]).toEqual(['critical', '2013-12-31']);
    const hmac = apex('HMAC-SHA1');
    expect([hmac.severity, hmac.deadline]).toEqual(['high', '2030-12-31']);
  });

  it('lists unresolved Apex algorithms as a low advisory and inventories strong ones without a finding', () => {
    const unresolved = findSingle({ kind: 'apex-call', name: 'A.cls', identifier: 'a:1:U', algorithm: 'UNRESOLVED' });
    expect(unresolved.severity).toBe('low');
    for (const algorithm of ['SHA-256', 'SHA-512', 'SHA3-256', 'HMAC-SHA256', 'HMAC-SHA512']) {
      const findings = evaluate(
        { kind: 'apex-call', name: 'A.cls', identifier: `a:1:${algorithm}`, algorithm },
        ruleCatalogForOverlays([]),
        ctx,
      );
      expect(findings, algorithm).toHaveLength(0);
    }
    const aes256 = evaluate(
      { kind: 'apex-call', name: 'A.cls', identifier: 'a:1:AES256', algorithm: 'AES', keySize: 256, usage: 'encryption' },
      ruleCatalogForOverlays([]),
      ctx,
    );
    expect(aes256).toHaveLength(0);
  });
});

describe('quantum-vulnerable signature predicate', () => {
  it('matches classical public-key algorithms by token', () => {
    for (const algo of ['RSA', 'RSA-SHA256', 'ECDSA-SHA384', 'DSA', 'Ed25519', 'ECDH']) {
      expect(isQuantumVulnerableSignature(algo), algo).toBe(true);
    }
  });

  it('never matches post-quantum algorithms on their DSA suffix', () => {
    for (const algo of ['ML-DSA-65', 'ML-DSA', 'SLH-DSA-SHA2-128s', 'ML-KEM-768', 'AES', 'HMAC-SHA256', undefined]) {
      expect(isQuantumVulnerableSignature(algo), String(algo)).toBe(false);
    }
  });
});

describe('harvest-now-decrypt-later relevance', () => {
  it('applies to key establishment and encryption, not to signatures', () => {
    const base = { name: 'n', identifier: 'i' };
    expect(isHndlRelevant({ ...base, kind: 'tls-endpoint' })).toBe(true);
    expect(isHndlRelevant({ ...base, kind: 'apex-call', usage: 'encryption' })).toBe(true);
    expect(isHndlRelevant({ ...base, kind: 'apex-call', usage: 'signature' })).toBe(false);
    expect(isHndlRelevant({ ...base, kind: 'certificate' })).toBe(false);
    expect(isHndlRelevant({ ...base, kind: 'saml-sso' })).toBe(false);
    expect(isHndlRelevant({ ...base, kind: 'oidc-provider' })).toBe(false);
    expect(isHndlRelevant({ ...base, kind: 'shield-key', usage: 'key-material' })).toBe(false);
  });
});
