import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_API_VERSION, isDevMock, SCOPES } from './config.js';

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
