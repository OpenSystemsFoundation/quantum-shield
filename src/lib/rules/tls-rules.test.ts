import { describe, expect, it } from 'vitest';
import type { CryptoAsset } from '@lib/pdf';
import { evaluate } from './engine.js';
import { isStaticRsaKeyExchange, tlsProbeRules } from './tls-rules.js';

const ctx = { scanId: 'scan-test', now: new Date('2026-04-22T00:00:00.000Z') };

function probedAsset(partial: Partial<CryptoAsset>): CryptoAsset {
  return {
    kind: 'tls-endpoint',
    name: 'https://api.example.com (probed)',
    identifier: 'https://api.example.com',
    endpointUrl: 'https://api.example.com',
    ...partial,
  };
}

describe('tls probe rules', () => {
  it('flags TLS 1.2 endpoints as HNDL-exposed', () => {
    const findings = evaluate(probedAsset({ tlsVersion: 'TLSv1.2' }), tlsProbeRules(), ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].hndlExposure).toBe(true);
  });

  it('records hybrid-capable TLS 1.3 endpoints as a low advisory about the Salesforce side', () => {
    const findings = evaluate(
      probedAsset({ tlsVersion: 'TLSv1.3', kexGroup: 'X25519MLKEM768', hybridKem: true }),
      tlsProbeRules(),
      ctx,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toContain('R-TLS-HYBRID-SF-SIDE');
    expect(findings[0].severity).toBe('low');
    expect(findings[0].hndlExposure).toBe(false);
    expect(findings[0].rationale).toMatch(/not by Salesforce/);
  });

  it('flags static RSA key exchange on TLS 1.2 as critical, alongside the TLS 1.2 finding', () => {
    const findings = evaluate(
      probedAsset({ tlsVersion: 'TLSv1.2', algorithm: 'AES256-GCM-SHA384' }),
      tlsProbeRules(),
      ctx,
    );
    expect(findings).toHaveLength(2);
    const rsa = findings.find((f) => f.id.includes('R-TLS-RSA-KEX'));
    expect(rsa?.severity).toBe('critical');
    expect(rsa?.migrationPosture).toBe('replace-now');
  });

  it('does not flag ECDHE suites on TLS 1.2 as static RSA', () => {
    const findings = evaluate(
      probedAsset({ tlsVersion: 'TLSv1.2', algorithm: 'ECDHE-RSA-AES256-GCM-SHA384' }),
      tlsProbeRules(),
      ctx,
    );
    expect(findings.map((f) => f.id).some((id) => id.includes('R-TLS-RSA-KEX'))).toBe(false);
  });

  it('classifies cipher names by key exchange', () => {
    expect(isStaticRsaKeyExchange('AES128-SHA')).toBe(true);
    expect(isStaticRsaKeyExchange('DES-CBC3-SHA')).toBe(true);
    expect(isStaticRsaKeyExchange('ECDHE-ECDSA-AES128-GCM-SHA256')).toBe(false);
    expect(isStaticRsaKeyExchange('DHE-RSA-AES256-GCM-SHA384')).toBe(false);
    expect(isStaticRsaKeyExchange('TLS_AES_256_GCM_SHA384')).toBe(false);
    expect(isStaticRsaKeyExchange(undefined)).toBe(false);
  });

  it('flags TLS 1.3 without a hybrid KEM at medium severity', () => {
    const findings = evaluate(
      probedAsset({ tlsVersion: 'TLSv1.3', kexGroup: 'X25519', hybridKem: false }),
      tlsProbeRules(),
      ctx,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].regulatoryStatus).toBe('advisory');
  });

  it('reports TLS 1.0 and 1.1 as obsolete (critical), not as a 2030 migration item', () => {
    for (const tlsVersion of ['TLSv1', 'TLSv1.1']) {
      const findings = evaluate(
        probedAsset({ tlsVersion, algorithm: 'ECDHE-RSA-AES128-SHA', hybridKem: false }),
        tlsProbeRules(),
        ctx,
      );
      expect(findings.map((f) => f.id.split(':')[0]), tlsVersion).toEqual(['R-TLS-OBSOLETE']);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].deadline).toBeUndefined();
    }
  });
});
