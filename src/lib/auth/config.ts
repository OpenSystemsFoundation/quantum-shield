import type { AuthConfig, EnvironmentChoice, EnvironmentId } from './types.js';

export const DEFAULT_API_VERSION = '63.0';

export const SCOPES = ['api', 'refresh_token', 'id'];

export const ENVIRONMENTS: Record<Exclude<EnvironmentId, 'custom'>, EnvironmentChoice> = {
  production: {
    id: 'production',
    loginUrl: 'https://login.salesforce.com',
    label: 'Production / Developer Edition',
  },
  sandbox: {
    id: 'sandbox',
    loginUrl: 'https://test.salesforce.com',
    label: 'Sandbox',
  },
};

export function resolveLoginUrl(env: EnvironmentId, customDomain?: string): string {
  if (env === 'production' || env === 'sandbox') {
    return ENVIRONMENTS[env].loginUrl;
  }
  if (!customDomain) {
    throw new Error('Custom domain is required for "custom" environment.');
  }
  return normaliseCustomDomain(customDomain);
}

export function normaliseCustomDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Custom domain cannot be empty.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'https:') {
    throw new Error('Custom domain must use HTTPS.');
  }
  if (!/\.salesforce\.com$|\.force\.com$|\.my\.site\.com$/i.test(url.hostname)) {
    throw new Error(
      'Custom domain must be a Salesforce domain (*.salesforce.com, *.force.com, or *.my.site.com).',
    );
  }
  return `${url.protocol}//${url.hostname}`;
}

export function loadAuthConfig(): AuthConfig {
  const clientId = (import.meta.env.PUBLIC_SF_CLIENT_ID as string | undefined)?.trim() ?? '';
  const origin =
    (import.meta.env.PUBLIC_APP_ORIGIN as string | undefined)?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const apiVersion =
    (import.meta.env.PUBLIC_SF_API_VERSION as string | undefined)?.trim() || DEFAULT_API_VERSION;
  return {
    clientId,
    redirectUri: `${origin.replace(/\/$/, '')}/callback`,
    apiVersion,
    scopes: SCOPES,
  };
}

export function isDevMock(): boolean {
  return (import.meta.env.PUBLIC_DEV_MOCK as string | undefined) === '1';
}

export function isMissingClientId(cfg: AuthConfig): boolean {
  return cfg.clientId.length === 0;
}
