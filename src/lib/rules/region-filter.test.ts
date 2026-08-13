import { describe, expect, it } from 'vitest';
import { ruleCatalogFor, ruleCatalogForOverlays } from './engine.js';

describe('ruleCatalogFor (region filtering)', () => {
  it('returns the full base catalog when no regions are supplied', () => {
    const unfiltered = ruleCatalogForOverlays([]);
    const filtered = ruleCatalogFor([], []);
    expect(filtered.length).toBe(unfiltered.length);
  });

  it('keeps rules that cite US sources when region=US', () => {
    const us = ruleCatalogFor([], ['US']);
    expect(us.length).toBeGreaterThan(0);
    // R-RSA-2048 cites NSA CNSA 2.0 (US) so it must still fire under US filter.
    expect(us.map((r) => r.id)).toContain('R-RSA-2048');
  });

  it('keeps rules with INTL citations even when the region doesn\'t match directly', () => {
    // NIST SP 800-131A is jurisdiction INTL and is cited by R-RSA-1024.
    const frOnly = ruleCatalogFor([], ['FR']);
    expect(frOnly.map((r) => r.id)).toContain('R-RSA-1024');
  });

  it('accepts lowercase region codes', () => {
    const nl = ruleCatalogFor([], ['nl']);
    expect(nl.length).toBeGreaterThan(0);
  });

  it('keeps universally-applicable baseline rules for EU users', () => {
    // Regression: plaintext HTTP and expired certificates are non-compliant
    // in every jurisdiction; the EU filter must never drop them.
    const eu = ruleCatalogFor([], ['NL', 'EU']);
    const ids = eu.map((r) => r.id);
    expect(ids).toContain('R-HTTP-ENDPOINT');
    expect(ids).toContain('R-CERT-EXPIRY');
    expect(ids).toContain('R-AES-128');
    expect(ids).toContain('R-WEAK-HASH');
    expect(ids).toContain('R-SESSION-LENGTH');
  });

  it('member-state selections imply EU-wide sources', () => {
    // NL alone must keep rules whose only European citation is EU-level
    // (GDPR / NIS 2), because those bind Dutch organisations directly.
    const nlOnly = ruleCatalogFor([], ['NL']);
    expect(nlOnly.map((r) => r.id)).toContain('R-HTTP-ENDPOINT');
  });

  it('never drops rules based on overlay selection', () => {
    const withOverlays = ruleCatalogFor(['pci-dss-4'], []);
    const without = ruleCatalogFor([], []);
    expect(withOverlays.length).toBe(without.length);
  });
});
