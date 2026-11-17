import { assertSalesforceOrigin, DEFAULT_API_VERSION, loadAuthConfig, SCOPES } from './config.js';
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';
import { savePendingAuth } from './session.js';
import type {
  EnvironmentId,
  IdentityResponse,
  PendingAuth,
  Session,
  TokenResponse,
} from './types.js';

export interface StartAuthOptions {
  environmentId: EnvironmentId;
  loginUrl: string;
  clientId: string;
  apiVersion?: string;
  extraScopes?: string[];
}

export async function buildAuthorizeUrl(opts: StartAuthOptions): Promise<{ url: string; pending: PendingAuth }> {
  const cfg = loadAuthConfig();
  const apiVersion = opts.apiVersion ?? cfg.apiVersion;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);
  const state = generateState();
  const scopes = Array.from(new Set([...SCOPES, ...(opts.extraScopes ?? [])]));

  const pending: PendingAuth = {
    state,
    codeVerifier,
    clientId: opts.clientId,
    environmentId: opts.environmentId,
    loginUrl: opts.loginUrl,
    apiVersion,
    startedAt: new Date().toISOString(),
  };

  const authorize = new URL(`${opts.loginUrl.replace(/\/$/, '')}/services/oauth2/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', opts.clientId);
  authorize.searchParams.set('redirect_uri', cfg.redirectUri);
  authorize.searchParams.set('scope', scopes.join(' '));
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', codeChallenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  return { url: authorize.toString(), pending };
}

export async function launchAuth(opts: StartAuthOptions): Promise<never> {
  const { url, pending } = await buildAuthorizeUrl(opts);
  savePendingAuth(pending);
  window.location.assign(url);
  return new Promise<never>(() => {
    /* navigation in progress */
  });
}

export interface CallbackParams {
  code?: string | null;
  accessToken?: string | null;
  instanceUrl?: string | null;
  identityUrl?: string | null;
  tokenType?: string | null;
  issuedAt?: string | null;
  signature?: string | null;
  scope?: string | null;
  state?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}

export function parseCallbackParams(search: string, hash = ''): CallbackParams {
  const params = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  return {
    code: params.get('code'),
    accessToken: fragment.get('access_token'),
    instanceUrl: fragment.get('instance_url'),
    identityUrl: fragment.get('id'),
    tokenType: fragment.get('token_type'),
    issuedAt: fragment.get('issued_at'),
    signature: fragment.get('signature'),
    scope: fragment.get('scope'),
    state: params.get('state') ?? fragment.get('state'),
    error: params.get('error') ?? fragment.get('error'),
    errorDescription: params.get('error_description') ?? fragment.get('error_description'),
  };
}

export class OAuthFlowError extends Error {
  constructor(
    public readonly kind:
      | 'state-mismatch'
      | 'invalid-callback'
      | 'pending-missing'
      | 'provider-error'
      | 'token-exchange-failed'
      | 'identity-fetch-failed'
      | 'cors-blocked',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OAuthFlowError';
  }
}

export async function exchangeCode(params: {
  code: string;
  state: string;
  pending: PendingAuth;
  clientId: string;
}): Promise<{ token: TokenResponse; identity: IdentityResponse | null }> {
  if (params.state !== params.pending.state) {
    throw new OAuthFlowError('state-mismatch', 'OAuth state mismatch — aborting for safety.');
  }
  const cfg = loadAuthConfig();
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', params.clientId);
  body.set('redirect_uri', cfg.redirectUri);
  body.set('code', params.code);
  body.set('code_verifier', params.pending.codeVerifier);

  let tokenResp: Response;
  try {
    tokenResp = await fetch(`${params.pending.loginUrl.replace(/\/$/, '')}/services/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new OAuthFlowError(
      'cors-blocked',
      `The browser blocked the token request (${detail}). In Setup → CORS, check that ${globalThis.location?.origin ?? "this site"} is in the Allowed Origins List and that "Enable CORS for OAuth endpoints" is ticked.`,
      err,
    );
  }

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new OAuthFlowError('token-exchange-failed', describeTokenError(tokenResp.status, text));
  }
  const token = (await tokenResp.json()) as TokenResponse;

  // Never send the bearer token to a host we have not checked.
  let instanceOrigin: string;
  try {
    instanceOrigin = assertSalesforceOrigin(token.instance_url);
    assertSalesforceOrigin(token.id);
  } catch (err) {
    throw new OAuthFlowError(
      'invalid-callback',
      err instanceof Error ? err.message : 'Token response contained an unexpected host.',
      err,
    );
  }

  return { token, identity: await fetchIdentity(instanceOrigin, token) };
}

/**
 * Best-effort identity lookup. The `id` URL in the token response points at
 * login.salesforce.com / test.salesforce.com, which never answer CORS
 * requests, so we ask the org's own My Domain for the same path (it serves
 * /id/<org>/<user> with the org's CORS allowlist). Failure is not fatal: the
 * org and user ids are already in the id URL.
 */
async function fetchIdentity(
  instanceOrigin: string,
  token: TokenResponse,
): Promise<IdentityResponse | null> {
  try {
    const path = new URL(token.id).pathname;
    const resp = await fetch(`${instanceOrigin}${path}`, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as IdentityResponse;
  } catch {
    return null;
  }
}

function parseIdentityIds(identityUrl: string): { orgId: string; userId: string } {
  try {
    const parts = new URL(identityUrl).pathname.split('/').filter(Boolean);
    const idIndex = parts.indexOf('id');
    if (idIndex === -1 || !parts[idIndex + 1] || !parts[idIndex + 2]) {
      throw new Error('missing org or user id path segment');
    }
    return {
      orgId: parts[idIndex + 1],
      userId: parts[idIndex + 2],
    };
  } catch (err) {
    throw new OAuthFlowError(
      'invalid-callback',
      'OAuth callback did not include a valid Salesforce identity URL.',
      err,
    );
  }
}

function sessionFromToken(pending: PendingAuth, token: TokenResponse): Session {
  const identity = parseIdentityIds(token.id);
  return {
    accessToken: token.access_token,
    instanceUrl: assertSalesforceOrigin(token.instance_url),
    identityUrl: token.id,
    tokenType: token.token_type,
    issuedAt: new Date(Number(token.issued_at) || Date.now()).toISOString(),
    scope: token.scope,
    org: {
      orgId: identity.orgId,
      userId: identity.userId,
    },
    environmentId: pending.environmentId,
    apiVersion: pending.apiVersion,
  };
}

export function sessionFromTokenAndIdentity(
  pending: PendingAuth,
  token: TokenResponse,
  identity: IdentityResponse | null,
): Session {
  const session = sessionFromToken(pending, token);
  if (identity) {
    session.org.username = identity.username;
    session.org.displayName = identity.display_name;
  }
  return session;
}

export function buildMockSession(): Session {
  return {
    accessToken: 'MOCK_TOKEN_00D3x0000008cDaEAI',
    instanceUrl: 'https://nl-acme.my.salesforce.com',
    identityUrl: 'https://login.salesforce.com/id/00D3x0000008cDaEAI/0053x00000ABCDEAA3',
    tokenType: 'Bearer',
    issuedAt: new Date().toISOString(),
    scope: SCOPES.join(' '),
    org: {
      orgId: '00D3x0000008cDaEAI',
      userId: '0053x00000ABCDEAA3',
      username: 'admin@acme-europe.nl.demo',
      displayName: 'Demo Admin',
      orgName: 'ACME Europe B.V.',
      orgType: 'Production',
    },
    environmentId: 'production',
    apiVersion: DEFAULT_API_VERSION,
    mock: true,
  };
}

export type CorsProbeResult =
  | { ok: true }
  | { ok: false; reason: 'oauth-cors-disabled' | 'origin-not-allowed' };

/**
 * Checks, before redirecting anywhere, whether the org will let this page
 * finish sign-in. Two unauthenticated requests:
 *  - GET /services/data/ answers cross-origin only if this origin is in the
 *    org's CORS allowlist;
 *  - POST /services/oauth2/token additionally needs "Enable CORS for OAuth
 *    endpoints". A readable response of any status (400 here) means CORS is
 *    fine; a rejected fetch means the browser blocked it.
 */
export async function probeOAuthCors(myDomain: string): Promise<CorsProbeResult> {
  const reachable = async (input: string, init?: RequestInit) => {
    try {
      await fetch(input, { ...init, credentials: 'omit', cache: 'no-store' });
      return true;
    } catch {
      return false;
    }
  };
  const base = myDomain.replace(/\/$/, '');
  const tokenOk = await reachable(`${base}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=authorization_code',
  });
  if (tokenOk) return { ok: true };
  const apiOk = await reachable(`${base}/services/data/`);
  return { ok: false, reason: apiOk ? 'oauth-cors-disabled' : 'origin-not-allowed' };
}

/**
 * Turns a Salesforce token-endpoint error body into a sentence the admin can
 * act on. Unknown errors fall back to Salesforce's own description.
 */
export function describeTokenError(status: number, body: string): string {
  let code = '';
  let description = '';
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string };
    code = parsed.error ?? '';
    description = parsed.error_description ?? '';
  } catch {
    description = body.slice(0, 200);
  }
  switch (code) {
    case 'invalid_client':
      return 'Salesforce wants a client secret. In the External Client App, untick "Require secret for Web Server Flow" (Settings → OAuth Settings → Security), save, wait a few minutes and try again.';
    case 'invalid_client_id':
      return 'Salesforce does not recognise that Consumer Key. Check you copied the key (not the secret) from this org\'s app. New apps can take up to 10 minutes to become active.';
    case 'redirect_uri_mismatch':
      return 'The callback URL in the External Client App does not match this site. Add the callback URL shown in setup and try again.';
    case 'invalid_grant':
      return 'The sign-in code expired or was already used. Start again from the setup page.';
    default:
      return `Token exchange failed (${status}${code ? `, ${code}` : ''})${description ? `: ${description}` : '.'}`;
  }
}

/** Maps an error returned on the redirect (?error=...) to guidance. */
export function describeProviderError(error: string, description: string): string {
  const text = `${error} ${description}`;
  if (/OAUTH_APP_BLOCKED|not admin approved|admin_approved/i.test(text)) {
    return 'Your user is not allowed to use this app. In the External Client App policies, set Permitted Users to "All users may self-authorize", or assign the app to your profile or a permission set.';
  }
  if (/access_denied/i.test(error)) {
    return 'Salesforce returned without access. Start again and choose Allow on the consent screen.';
  }
  return description || error;
}

/**
 * Best-effort: the identity service does not return the org name, so ask
 * the org. A failure leaves the session usable, just less labelled.
 */
export async function enrichSessionWithOrg(session: Session): Promise<void> {
  try {
    const soql = encodeURIComponent('SELECT Name, OrganizationType, IsSandbox FROM Organization LIMIT 1');
    const resp = await fetch(
      `${session.instanceUrl}/services/data/v${session.apiVersion}/query?q=${soql}`,
      { headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' } },
    );
    if (!resp.ok) return;
    const body = (await resp.json()) as {
      records?: { Name?: string; OrganizationType?: string; IsSandbox?: boolean }[];
    };
    const org = body.records?.[0];
    if (!org) return;
    if (org.Name) session.org.orgName = org.Name;
    if (org.OrganizationType) session.org.orgType = org.IsSandbox ? 'Sandbox' : org.OrganizationType;
    if (org.IsSandbox && session.environmentId === 'production') session.environmentId = 'sandbox';
  } catch {
    /* best effort */
  }
}
