import { loadAuthConfig, SCOPES } from './config.js';
import { generateCodeVerifier, generateState } from './pkce.js';
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
  const state = generateState();
  const scopes = Array.from(new Set([...SCOPES, ...(opts.extraScopes ?? [])]));

  const pending: PendingAuth = {
    state,
    codeVerifier,
    environmentId: opts.environmentId,
    loginUrl: opts.loginUrl,
    apiVersion,
    startedAt: new Date().toISOString(),
  };

  const authorize = new URL(`${opts.loginUrl.replace(/\/$/, '')}/services/oauth2/authorize`);
  authorize.searchParams.set('response_type', 'token');
  authorize.searchParams.set('client_id', opts.clientId);
  authorize.searchParams.set('redirect_uri', cfg.redirectUri);
  authorize.searchParams.set('scope', scopes.join(' '));
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'login consent');

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
}): Promise<{ token: TokenResponse; identity: IdentityResponse }> {
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
    throw new OAuthFlowError(
      'cors-blocked',
      'Token exchange request failed — this usually means a network error or CORS block against the OAuth token endpoint.',
      err,
    );
  }

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new OAuthFlowError(
      'token-exchange-failed',
      `Token exchange failed (${tokenResp.status}): ${text}`,
    );
  }
  const token = (await tokenResp.json()) as TokenResponse;

  let identityResp: Response;
  try {
    identityResp = await fetch(token.id, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
    });
  } catch (err) {
    throw new OAuthFlowError('identity-fetch-failed', 'Could not reach identity URL.', err);
  }
  if (!identityResp.ok) {
    throw new OAuthFlowError(
      'identity-fetch-failed',
      `Identity fetch failed (${identityResp.status}).`,
    );
  }
  const identity = (await identityResp.json()) as IdentityResponse;
  return { token, identity };
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

export function tokenFromCallbackParams(params: CallbackParams): TokenResponse | null {
  if (!params.accessToken || !params.instanceUrl || !params.identityUrl || !params.tokenType) {
    return null;
  }
  return {
    access_token: params.accessToken,
    instance_url: params.instanceUrl,
    id: params.identityUrl,
    token_type: params.tokenType,
    issued_at: params.issuedAt ?? `${Date.now()}`,
    signature: params.signature ?? '',
    scope: params.scope ?? SCOPES.join(' '),
  };
}

export function sessionFromToken(pending: PendingAuth, token: TokenResponse): Session {
  const identity = parseIdentityIds(token.id);
  return {
    accessToken: token.access_token,
    instanceUrl: token.instance_url,
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
  identity: IdentityResponse,
): Session {
  const session = sessionFromToken(pending, token);
  session.org.username = identity.username;
  session.org.displayName = identity.display_name;
  return session;
}

export function buildMockSession(): Session {
  return {
    accessToken: 'MOCK_TOKEN_00D3x0000008cDaEAI',
    instanceUrl: 'https://nl-acme.my.salesforce.com',
    identityUrl: 'https://login.salesforce.com/id/00D3x0000008cDaEAI/0053x00000ABCDEAA3',
    tokenType: 'Bearer',
    issuedAt: new Date().toISOString(),
    scope: 'api refresh_token id',
    org: {
      orgId: '00D3x0000008cDaEAI',
      userId: '0053x00000ABCDEAA3',
      username: 'admin@acme-europe.nl.demo',
      displayName: 'Demo Admin',
      orgName: 'ACME Europe B.V.',
      orgType: 'Production',
    },
    environmentId: 'production',
    apiVersion: '63.0',
    mock: true,
  };
}
