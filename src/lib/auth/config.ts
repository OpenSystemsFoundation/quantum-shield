import type { AuthConfig, EnvironmentId } from './types.js';

export const DEFAULT_API_VERSION = '66.0';

// Browser mode is short-lived by design: no refresh_token, so no long-lived
// credentials ever land in the browser.
export const SCOPES = ['api', 'id'];

/**
 * Browser sign-in has to run against the org's own My Domain:
 * login.salesforce.com and test.salesforce.com never answer cross-origin
 * requests, so the PKCE token exchange (a fetch from this page) can only
 * succeed on <org>.my.salesforce.com with "Enable CORS for OAuth endpoints"
 * switched on. These are the shapes we accept and what they map to.
 */
const LIGHTNING_HOST = /^(.+)\.lightning\.force\.com$/i;
const SETUP_HOST = /^(.+)\.my\.salesforce-setup\.com$/i;
const MY_DOMAIN_HOST = /^[a-z0-9-]+(\.(sandbox|scratch|develop|demo|patch|trailblaze))?\.my\.salesforce\.com$/i;
const GENERIC_LOGIN_HOST = /^(login|test)\.salesforce\.com$/i;

/**
 * Turns whatever the user pasted (My Domain, a Lightning or Setup URL from
 * the address bar, with or without scheme/path) into the My Domain origin.
 */
export function normaliseMyDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter your org\'s My Domain, for example acme.my.salesforce.com.');
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('That does not look like a URL. Copy the domain from Setup → My Domain.');
  }
  let host = url.hostname.toLowerCase();
  if (GENERIC_LOGIN_HOST.test(host)) {
    throw new Error(
      `${host} cannot be used in the browser. Enter your org's My Domain instead (Setup → My Domain), for example acme.my.salesforce.com.`,
    );
  }
  host = host.replace(LIGHTNING_HOST, '$1.my.salesforce.com').replace(SETUP_HOST, '$1.my.salesforce.com');
  if (!MY_DOMAIN_HOST.test(host)) {
    throw new Error(
      'Enter a My Domain that ends in .my.salesforce.com (sandboxes end in .sandbox.my.salesforce.com). Find it in Setup → My Domain.',
    );
  }
  return `https://${host}`;
}

/** Best-effort environment label from a My Domain origin. */
export function environmentForMyDomain(origin: string): EnvironmentId {
  const host = new URL(origin).hostname;
  if (/\.sandbox\.my\.salesforce\.com$/i.test(host)) return 'sandbox';
  if (/\.scratch\.my\.salesforce\.com$/i.test(host)) return 'scratch';
  return 'production';
}

// Token responses only ever point at *.salesforce.com (login/test for the
// identity URL, My Domain for instance_url).
const SALESFORCE_HOST = /(^|\.)salesforce\.com$/i;

export function isSalesforceHost(hostname: string): boolean {
  return SALESFORCE_HOST.test(hostname);
}

/**
 * Returns the https origin of `value` if it is a Salesforce host, otherwise
 * throws. Used before a bearer token is sent anywhere: `instance_url` and the
 * identity URL come from the token response and are checked, not trusted.
 */
export function assertSalesforceOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Not a valid URL: ${value}`);
  }
  if (url.protocol !== 'https:' || !isSalesforceHost(url.hostname)) {
    throw new Error(`Refusing to send credentials to a non-Salesforce origin: ${url.origin}`);
  }
  return url.origin;
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
  // Hard production guard: the mock shortcut is dev-server only, regardless of
  // what PUBLIC_DEV_MOCK is baked into the build.
  if (!import.meta.env.DEV) return false;
  return (import.meta.env.PUBLIC_DEV_MOCK as string | undefined) === '1';
}

export function isMissingClientId(cfg: AuthConfig): boolean {
  return cfg.clientId.length === 0;
}
