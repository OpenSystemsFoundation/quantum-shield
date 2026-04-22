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
});
