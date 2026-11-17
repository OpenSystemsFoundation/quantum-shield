import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSalesforceOrigin,
  DEFAULT_API_VERSION,
  environmentForMyDomain,
  isDevMock,
  normaliseMyDomain,
  SCOPES,
} from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SCOPES', () => {
  it('never requests refresh_token in browser mode', () => {
    expect(SCOPES).toEqual(['api', 'id']);
  });
});

describe('DEFAULT_API_VERSION', () => {
  it('tracks a current platform API version', () => {
    expect(Number.parseFloat(DEFAULT_API_VERSION)).toBeGreaterThanOrEqual(66);
  });
});

describe('isDevMock', () => {
  it('is enabled when PUBLIC_DEV_MOCK=1 in a dev build', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('PUBLIC_DEV_MOCK', '1');
    expect(isDevMock()).toBe(true);
  });

  it('stays off in dev builds without the env flag', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('PUBLIC_DEV_MOCK', '0');
    expect(isDevMock()).toBe(false);
  });

  it('is force-disabled in production builds regardless of PUBLIC_DEV_MOCK', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PUBLIC_DEV_MOCK', '1');
    expect(isDevMock()).toBe(false);
  });
});

describe('normaliseMyDomain', () => {
  it.each([
    ['acme.my.salesforce.com', 'https://acme.my.salesforce.com'],
    ['https://acme.my.salesforce.com/lightning/setup/Home', 'https://acme.my.salesforce.com'],
    ['acme.lightning.force.com', 'https://acme.my.salesforce.com'],
    ['acme--uat.sandbox.lightning.force.com', 'https://acme--uat.sandbox.my.salesforce.com'],
    ['acme--uat.sandbox.my.salesforce-setup.com', 'https://acme--uat.sandbox.my.salesforce.com'],
    ['efficiency-page-9215-dev-ed.scratch.my.salesforce.com', 'https://efficiency-page-9215-dev-ed.scratch.my.salesforce.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseMyDomain(input)).toBe(expected);
  });

  it.each(['login.salesforce.com', 'https://test.salesforce.com', 'evil.example.com', 'acme.my.salesforce.com.evil.io', ''])(
    'rejects %s',
    (input) => {
      expect(() => normaliseMyDomain(input)).toThrow();
    },
  );

  it('derives the environment from the host', () => {
    expect(environmentForMyDomain('https://acme.my.salesforce.com')).toBe('production');
    expect(environmentForMyDomain('https://acme--uat.sandbox.my.salesforce.com')).toBe('sandbox');
    expect(environmentForMyDomain('https://x.scratch.my.salesforce.com')).toBe('scratch');
  });
});

describe('assertSalesforceOrigin', () => {
  it('accepts Salesforce https origins', () => {
    expect(assertSalesforceOrigin('https://acme.my.salesforce.com/x')).toBe('https://acme.my.salesforce.com');
  });
  it.each(['http://acme.my.salesforce.com', 'https://salesforce.com.evil.io', 'https://evil.force.com.example'])(
    'rejects %s',
    (u) => {
      expect(() => assertSalesforceOrigin(u)).toThrow();
    },
  );
});
