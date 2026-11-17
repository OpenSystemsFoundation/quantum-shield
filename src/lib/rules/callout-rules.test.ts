import { describe, expect, it } from 'vitest';
import { evaluate } from './engine';
import { calloutRules } from './callout-rules';

const ctx = { scanId: 't', now: new Date('2026-01-01T00:00:00Z') };

describe('R-CALLOUT-HNDL', () => {
  it('flags HTTPS callouts as harvest-now exposure', () => {
    const [f] = evaluate(
      { kind: 'named-credential', name: 'Partner', identifier: 'p', endpointUrl: 'https://api.partner.example/v1' },
      calloutRules(),
      ctx,
    );
    expect(f.id).toBe('R-CALLOUT-HNDL:named-credential:p');
    expect(f.hndlExposure).toBe(true);
    expect(f.title).toContain('https://api.partner.example');
  });

  it('leaves plaintext HTTP, probed endpoints and unrelated assets to other rules', () => {
    for (const asset of [
      { kind: 'remote-site' as const, name: 'x', identifier: 'x', endpointUrl: 'http://legacy.example' },
      { kind: 'tls-endpoint' as const, name: 'x', identifier: 'x', endpointUrl: 'https://legacy.example' },
      { kind: 'certificate' as const, name: 'x', identifier: 'x' },
    ]) {
      expect(evaluate(asset, calloutRules(), ctx)).toEqual([]);
    }
  });
});
