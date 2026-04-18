import { loadAuthConfig, SCOPES } from './config.js';
import {
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce.js';
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
    environmentId: opts.environmentId,
    loginUrl: opts.loginUrl,
    apiVersion,
    startedAt: new Date().toISOString(),
  };

  const authorize = new URL(`${opts.loginUrl.replace(/\/$/, '')}/services/oauth2/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', opts.clientId);
  authorize.searchParams.set('redirect_uri', cfg.redirectUri);
  authorize.searchParams.set('code_challenge', codeChallenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
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
  state?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}

export function parseCallbackParams(search: string): CallbackParams {
  const params = new URLSearchParams(search);
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  };
}

export class OAuthFlowError extends Error {
  constructor(
    public readonly kind:
      | 'state-mismatch'
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

export function sessionFromTokenAndIdentity(
  pending: PendingAuth,
  token: TokenResponse,
  identity: IdentityResponse,
): Session {
  return {
    accessToken: token.access_token,
    instanceUrl: token.instance_url,
    identityUrl: token.id,
    tokenType: token.token_type,
    issuedAt: new Date(Number(token.issued_at) || Date.now()).toISOString(),
    scope: token.scope,
    org: {
      orgId: identity.organization_id,
      userId: identity.user_id,
      username: identity.username,
      displayName: identity.display_name,
    },
    environmentId: pending.environmentId,
    apiVersion: pending.apiVersion,
  };
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
