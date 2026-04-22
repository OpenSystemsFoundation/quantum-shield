import { describe, expect, it } from 'vitest';
import type { CryptoAsset } from '@lib/pdf';
import { evaluate } from './engine.js';
import { tlsProbeRules } from './tls-rules.js';

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

  it('does not flag TLS 1.3 endpoints with a negotiated hybrid KEM', () => {
    const findings = evaluate(
      probedAsset({ tlsVersion: 'TLSv1.3', kexGroup: 'X25519MLKEM768', hybridKem: true }),
      tlsProbeRules(),
      ctx,
    );
    expect(findings).toHaveLength(0);
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
});
