import { describe, expect, it } from 'vitest';
import type { CryptoAsset } from '@lib/pdf';
import { evaluate, ruleCatalogForOverlays } from './engine.js';

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
      'NIST-SP-800-131A-r3',
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

  it('evaluates session timeout captures from the rule docs', () => {
    const finding = findSingle({
      kind: 'connected-app',
      name: 'SessionSettings',
      identifier: 'session-settings',
      location: 'Timeout configured to 12 h',
    });

    expect(finding.currentCrypto).toBe('Session lifetime: 12 hours');
    expect(finding.severity).toBe('medium');
  });
});