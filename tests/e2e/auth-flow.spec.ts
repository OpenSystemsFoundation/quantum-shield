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
  // Pending sign-ins expire after 10 minutes.
  startedAt: new Date().toISOString(),
};

test.describe('Auth wizard (/connect)', () => {
  test('guides through the three steps and launches PKCE OAuth against My Domain', async ({ page }) => {
    const MY_DOMAIN = 'https://acme.my.salesforce.com';
    // CORS probe: answer the token endpoint so the wizard sees CORS as set up.
    await page.route(`${MY_DOMAIN}/services/oauth2/token`, (route) =>
      route.fulfill({
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '{"error":"invalid_grant"}',
      }),
    );
    await page.route(`${MY_DOMAIN}/services/oauth2/authorize*`, (route) =>
      route.fulfill({ status: 200, body: 'blocked' }),
    );

    await page.goto('/connect');
    await expect(page.getByRole('heading', { name: /Step 1/ })).toBeVisible();

    // Generic login hosts are refused with guidance.
    await page.getByTestId('my-domain-input').fill('login.salesforce.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText('My Domain');

    // A Lightning URL is normalised to the My Domain.
    await page.getByTestId('my-domain-input').fill('https://acme.lightning.force.com/lightning/page/home');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: /Step 2 · One-time setup in acme\.my\.salesforce\.com/ })).toBeVisible();
    expect(await page.getByTestId('redirect-uri').textContent()).toContain('/callback');
    await page.getByTestId('cors-check').click();
    await expect(page.getByText('CORS is set up for this site.')).toBeVisible();
    await page.getByRole('button', { name: /Setup done/ }).click();

    await expect(page.getByRole('heading', { name: /Step 3/ })).toBeVisible();
    await page.getByTestId('client-id-input').fill('3MVG9FAKE.CLIENT.ID.FOR.TESTS');
    await page.getByTestId('connect-button').click();
    await page.waitForURL(/acme\.my\.salesforce\.com.*response_type=code.*/);

    const url = new URL(page.url());
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(['api', 'id']);
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

    // Identity is read from the org's My Domain (login/test.salesforce.com
    // never answer CORS), carrying an Authorization header, so expect a preflight.
    await page.route(`${LOGIN_URL}/id/**`, async (route) => {
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

    await page.route(`${LOGIN_URL}/services/data/**`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
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
          records: [{ Name: 'Velocity Scratch', OrganizationType: 'Developer Edition', IsSandbox: false }],
        }),
      });
    });

    await page.goto(`/callback?code=e2e-auth-code&state=${PENDING_AUTH.state}`);

    await page.waitForURL('**/app');
    expect(page.url()).not.toContain('code=');
    await expect(page.getByTestId('session-org-name')).toHaveText('Velocity Scratch');
    await expect(page.getByTestId('start-scan-button')).toBeVisible();

    expect(tokenRequestBody).toContain('grant_type=authorization_code');
    expect(tokenRequestBody).toContain('code=e2e-auth-code');
    expect(tokenRequestBody).toContain(`code_verifier=${PENDING_AUTH.codeVerifier}`);
  });
});

test.describe('/callback error handling', () => {
  test('shows guidance when Salesforce returns an error for our sign-in', async ({ page }) => {
    await page.addInitScript(
      ({ key, pending }) => {
        sessionStorage.setItem(key, JSON.stringify(pending));
      },
      { key: PENDING_KEY, pending: PENDING_AUTH },
    );
    await page.goto(
      `/callback?error=OAUTH_APP_BLOCKED&error_description=user+is+not+admin+approved&state=${PENDING_AUTH.state}`,
    );
    await expect(page.getByTestId('callback-error-title')).toBeVisible();
    await expect(page.getByTestId('callback-error-detail')).toContainText('Permitted Users');
    expect(page.url()).not.toContain('error=');
  });

  test('does not echo error text for a sign-in this tab did not start', async ({ page }) => {
    await page.goto('/callback?error=access_denied&error_description=Call+support+at+555');
    await expect(page.getByTestId('callback-error-title')).toBeVisible();
    await expect(page.getByTestId('callback-error-detail')).not.toContainText('555');
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
