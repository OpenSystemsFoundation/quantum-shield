import { test, expect } from '@playwright/test';

const PENDING_KEY = 'qs.pendingAuth.v1';
const LOGIN_URL = 'https://customer-velocity-8294-dev-ed.scratch.my.salesforce.com';
const IDENTITY_URL =
  'https://test.salesforce.com/id/00DRR00000PekkH2AR/005RR00000KRUhdYAH';

const PENDING_AUTH = {
  state: 'pkce-test-state',
  codeVerifier: 'pkce-test-verifier-0123456789-0123456789-0123456789',
  clientId: '3MVG9FAKE.CLIENT.ID.FOR.TESTS',
  environmentId: 'custom',
  loginUrl: LOGIN_URL,
  apiVersion: '66.0',
  startedAt: '2026-04-21T00:00:00.000Z',
};

test.describe('Auth wizard (/connect)', () => {
  test('guides through all four steps and launches PKCE OAuth', async ({ page }) => {
    await page.goto('/connect');

    await expect(page.getByRole('heading', { name: 'Step 1 · Pick your environment' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: /Step 2/ })).toBeVisible();
    await page.getByRole('button', { name: /App created/ }).click();

    await expect(page.getByRole('heading', { name: /Step 3/ })).toBeVisible();
    const callback = await page.getByTestId('redirect-uri').textContent();
    expect(callback).toContain('/callback');
    await page.getByRole('button', { name: /Callback saved/ }).click();

    await expect(page.getByRole('heading', { name: /Step 4/ })).toBeVisible();
    await page.getByTestId('client-id-input').fill('3MVG9FAKE.CLIENT.ID.FOR.TESTS');

    // We block navigation to the actual Salesforce authorize URL in the test.
    await page.route('https://login.salesforce.com/services/oauth2/authorize*', (route) =>
      route.fulfill({ status: 200, body: 'blocked' }),
    );

    await page.getByTestId('connect-button').click();
    await page.waitForURL(/login\.salesforce\.com.*response_type=code.*/);

    expect(page.url()).not.toContain('response_type=token');

    const url = new URL(page.url());
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('api');
    expect(url.searchParams.get('scope')).toContain('id');
    expect(url.searchParams.get('scope')).not.toContain('refresh_token');
    expect(url.searchParams.get('client_id')).toBe('3MVG9FAKE.CLIENT.ID.FOR.TESTS');
  });

  test('dev-mock shortcut delivers a valid session and takes us to /app', async ({ page }) => {
    await page.goto('/connect');
    await expect(page.getByTestId('dev-mock-connect')).toBeVisible();
    await page.getByTestId('dev-mock-connect').click();

    await page.waitForURL('**/app');
    await expect(page.getByTestId('session-org-name')).toHaveText('ACME Europe B.V.');
    await expect(page.getByTestId('start-scan-button')).toBeVisible();
  });
});

test.describe('/callback code exchange', () => {
  test('exchanges the authorization code via PKCE and redirects into the app shell', async ({ page }) => {
    await page.addInitScript(
      ({ key, pending }) => {
        sessionStorage.setItem(key, JSON.stringify(pending));
      },
      { key: PENDING_KEY, pending: PENDING_AUTH },
    );

    let tokenRequestBody: string | null = null;
    await page.route(`${LOGIN_URL}/services/oauth2/token`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type, accept',
          },
        });
        return;
      }
      tokenRequestBody = route.request().postData();
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token',
          instance_url: LOGIN_URL,
          id: IDENTITY_URL,
          token_type: 'Bearer',
          issued_at: '1776793510030',
          signature: 'e2e-signature',
          scope: 'api id',
        }),
      });
    });

    await page.route(IDENTITY_URL, async (route) => {
      // The identity fetch carries an Authorization header, so the browser
      // sends a CORS preflight first.
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, accept',
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          id: IDENTITY_URL,
          user_id: '005RR00000KRUhdYAH',
          organization_id: '00DRR00000PekkH2AR',
          username: 'admin@velocity.scratch',
          display_name: 'Scratch Admin',
        }),
      });
    });

    await page.goto(`/callback?code=e2e-auth-code&state=${PENDING_AUTH.state}`);

    await page.waitForURL('**/app');
    expect(page.url()).not.toContain('code=');
    await expect(page.getByTestId('session-org-name')).toHaveText('00DRR00000PekkH2AR');
    await expect(page.getByTestId('start-scan-button')).toBeVisible();

    expect(tokenRequestBody).toContain('grant_type=authorization_code');
    expect(tokenRequestBody).toContain('code=e2e-auth-code');
    expect(tokenRequestBody).toContain(`code_verifier=${PENDING_AUTH.codeVerifier}`);
  });
});

test.describe('/callback error handling', () => {
  test('shows a clear error when Salesforce returns error param', async ({ page }) => {
    await page.goto('/callback?error=access_denied&error_description=User+denied+the+request');
    await expect(page.getByTestId('callback-error-title')).toBeVisible();
    await expect(page.getByTestId('callback-error-detail')).toContainText('User denied the request');
    // Scrubbed even on the error path.
    expect(page.url()).not.toContain('error=');
  });

  test('shows a clear error when pending auth is missing', async ({ page }) => {
    await page.goto('/callback?code=abc&state=xyz');
    await expect(page.getByTestId('callback-error-title')).toContainText('No pending auth');
    expect(page.url()).not.toContain('code=');
  });

  test('rejects a legacy implicit-flow fragment and points the user at setup', async ({ page }) => {
    await page.addInitScript(
      ({ key, pending }) => {
        sessionStorage.setItem(key, JSON.stringify(pending));
      },
      { key: PENDING_KEY, pending: PENDING_AUTH },
    );

    await page.goto(
      `/callback#access_token=stale-token&instance_url=${encodeURIComponent(LOGIN_URL)}&id=${encodeURIComponent(IDENTITY_URL)}&issued_at=1776793510030&state=${PENDING_AUTH.state}&scope=id+api&token_type=Bearer`,
    );

    await expect(page.getByTestId('callback-error-title')).toContainText('implicit-flow');
    await expect(page.getByTestId('callback-error-detail')).toContainText('/connect');
    // The fragment token must be scrubbed from the address bar.
    expect(page.url()).not.toContain('access_token');
  });
});
