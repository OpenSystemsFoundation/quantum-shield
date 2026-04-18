export type EnvironmentId = 'production' | 'sandbox' | 'custom';

export interface EnvironmentChoice {
  id: EnvironmentId;
  loginUrl: string;
  label: string;
}

export interface AuthConfig {
  clientId: string;
  redirectUri: string;
  apiVersion: string;
  scopes: string[];
}

export interface PendingAuth {
  state: string;
  codeVerifier: string;
  environmentId: EnvironmentId;
  loginUrl: string;
  apiVersion: string;
  startedAt: string;
}

export interface Session {
  accessToken: string;
  instanceUrl: string;
  identityUrl: string;
  tokenType: string;
  issuedAt: string;
  scope: string;
  org: {
    orgId: string;
    userId: string;
    username?: string;
    displayName?: string;
    orgName?: string;
    orgType?: string;
  };
  environmentId: EnvironmentId;
  apiVersion: string;
  mock?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
  scope: string;
}

export interface IdentityResponse {
  id: string;
  user_id: string;
  organization_id: string;
  username: string;
  display_name: string;
  photos?: { picture?: string; thumbnail?: string };
  urls?: Record<string, string>;
}
