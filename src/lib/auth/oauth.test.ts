import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCode,
  OAuthFlowError,
  sessionFromTokenAndIdentity,
} from './oauth.js';
import { deriveCodeChallenge } from './pkce.js';
import type { IdentityResponse, PendingAuth, TokenResponse } from './types.js';

const startOpts = {
  environmentId: 'production' as const,
  loginUrl: 'https://login.salesforce.com',
  clientId: '3MVG9TEST.CLIENT.ID',
};

const pending: PendingAuth = {
  state: 'state-1',
  codeVerifier: 'unit-test-verifier-0123456789-0123456789-0123456789',
  clientId: '3MVG9TEST.CLIENT.ID',
  environmentId: 'production',
  loginUrl: 'https://login.salesforce.com',
  apiVersion: '66.0',
  startedAt: '2026-01-01T00:00:00.000Z',
};

const tokenJson: TokenResponse = {
  access_token: 'tok-123',
  instance_url: 'https://acme.my.salesforce.com',
  id: 'https://login.salesforce.com/id/00Dxx0000001gPFEAY/005xx000001SvogAAC',
  token_type: 'Bearer',
  issued_at: '1776793510030',
  signature: 'sig',
  scope: 'api id',
};

const identityJson: IdentityResponse = {
  id: tokenJson.id,
  user_id: '005xx000001SvogAAC',
  organization_id: '00Dxx0000001gPFEAY',
  username: 'admin@example.com',
  display_name: 'Admin User',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildAuthorizeUrl', () => {
  it('requests the authorization code flow with S256 PKCE', async () => {
    const { url, pending: built } = await buildAuthorizeUrl(startOpts);
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/services/oauth2/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBe(
      await deriveCodeChallenge(built.codeVerifier),
    );
    expect(parsed.searchParams.get('state')).toBe(built.state);
    expect(parsed.searchParams.get('client_id')).toBe('3MVG9TEST.CLIENT.ID');
    expect(built.clientId).toBe('3MVG9TEST.CLIENT.ID');
  });

  it('requests only the api and id scopes by default', async () => {
    const { url } = await buildAuthorizeUrl(startOpts);
    const scope = new URL(url).searchParams.get('scope');
    expect(scope?.split(' ').sort()).toEqual(['api', 'id']);
  });
});

describe('exchangeCode', () => {
  it('posts the code verifier and returns token + identity', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(tokenJson), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(identityJson), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { token, identity } = await exchangeCode({
      code: 'code-1',
      state: 'state-1',
      pending,
      clientId: pending.clientId!,
    });

    expect(token.access_token).toBe('tok-123');
    expect(identity.username).toBe('admin@example.com');

    const [tokenUrl, init] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://login.salesforce.com/services/oauth2/token');
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('code_verifier')).toBe(pending.codeVerifier);
    expect(body.get('client_id')).toBe(pending.clientId);

    const session = sessionFromTokenAndIdentity(pending, token, identity);
    expect(session.org.orgId).toBe('00Dxx0000001gPFEAY');
    expect(session.org.userId).toBe('005xx000001SvogAAC');
    expect(session.org.username).toBe('admin@example.com');
  });

  it('aborts before any network call on state mismatch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      exchangeCode({ code: 'code-1', state: 'wrong-state', pending, clientId: pending.clientId! }),
    ).rejects.toMatchObject({ name: 'OAuthFlowError', kind: 'state-mismatch' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the underlying message when the token request cannot be sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));

    const err = await exchangeCode({
      code: 'code-1',
      state: 'state-1',
      pending,
      clientId: pending.clientId!,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OAuthFlowError);
    expect((err as OAuthFlowError).kind).toBe('cors-blocked');
    expect((err as OAuthFlowError).message).toContain('Failed to fetch');
  });

  it('maps a non-2xx token response to token-exchange-failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('{"error":"invalid_grant"}', { status: 400 })),
    );

    const err = await exchangeCode({
      code: 'code-1',
      state: 'state-1',
      pending,
      clientId: pending.clientId!,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OAuthFlowError);
    expect((err as OAuthFlowError).kind).toBe('token-exchange-failed');
    expect((err as OAuthFlowError).message).toContain('400');
  });
});
