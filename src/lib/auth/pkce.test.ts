import { describe, expect, it } from 'vitest';
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';

describe('deriveCodeChallenge', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    await expect(
      deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('generateCodeVerifier', () => {
  it('produces URL-safe verifiers of the requested length', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects lengths outside the RFC 7636 bounds', () => {
    expect(() => generateCodeVerifier(42)).toThrow(/43/);
    expect(() => generateCodeVerifier(129)).toThrow(/128/);
  });
});

describe('generateState', () => {
  it('produces unique URL-safe values', () => {
    const a = generateState();
    const b = generateState();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });
});
