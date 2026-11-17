import { describe, expect, it } from 'vitest';
import type { CryptoAsset } from '@lib/pdf';
import { evaluate } from './engine.js';
import { keyRotationRules } from './key-rotation-rules.js';

const ctx = { scanId: 'scan-test', now: new Date('2026-11-17T00:00:00.000Z') };

function shieldKey(partial: Partial<CryptoAsset>): CryptoAsset {
  return {
    kind: 'shield-key',
    name: 'Tenant secret (Data)',
    identifier: '0Kx000000000001',
    algorithm: 'AES',
    keySize: 256,
    ...partial,
  };
}

describe('key rotation rules', () => {
  it('flags a tenant secret older than a year', () => {
    const findings = evaluate(shieldKey({ lastRotatedAt: '2025-06-01T10:00:00.000Z' }), keyRotationRules(), ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].hndlExposure).toBe(false);
    expect(findings[0].title).toMatch(/days ago/);
  });

  it('does not flag a recently rotated tenant secret', () => {
    const findings = evaluate(shieldKey({ lastRotatedAt: '2026-05-01T10:00:00.000Z' }), keyRotationRules(), ctx);
    expect(findings).toHaveLength(0);
  });

  it('stays silent when no rotation timestamp is known', () => {
    expect(evaluate(shieldKey({}), keyRotationRules(), ctx)).toHaveLength(0);
    expect(evaluate(shieldKey({ lastRotatedAt: 'not-a-date' }), keyRotationRules(), ctx)).toHaveLength(0);
  });

  it('ignores non-Shield assets', () => {
    const asset: CryptoAsset = { kind: 'certificate', name: 'c', identifier: 'c', lastRotatedAt: '2020-01-01' };
    expect(evaluate(asset, keyRotationRules(), ctx)).toHaveLength(0);
  });
});
