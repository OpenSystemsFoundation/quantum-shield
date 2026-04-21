import { test, expect } from '@playwright/test';

test.describe('Auth wizard (/connect)', () => {
  test('guides through all four steps and launches OAuth', async ({ page }) => {
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
    await page.waitForURL(/login\.salesforce\.com.*response_type=token.*/);

    const url = new URL(page.url());
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('code_challenge_method')).toBeNull();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('api');
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

test.describe('/callback error handling', () => {
  test('consumes implicit OAuth fragments and redirects into the app shell', async ({ page }) => {
    await page.addInitScript((pending) => {
      sessionStorage.setItem('qs.pendingAuth.v1', JSON.stringify(pending));
    }, {
      state: 'implicit-test-state',
      codeVerifier: 'unused-for-implicit-flow',
      environmentId: 'custom',
      loginUrl: 'https://customer-velocity-8294-dev-ed.scratch.my.salesforce.com',
      apiVersion: '66.0',
      startedAt: '2026-04-21T00:00:00.000Z',
    });

    await page.goto('/callback#access_token=test-token&instance_url=https%3A%2F%2Fcustomer-velocity-8294-dev-ed.scratch.my.salesforce.com&id=https%3A%2F%2Ftest.salesforce.com%2Fid%2F00DRR00000PekkH2AR%2F005RR00000KRUhdYAH&issued_at=1776793510030&state=implicit-test-state&scope=id+api&token_type=Bearer');

    await page.waitForURL('**/app');
    await expect(page.getByTestId('session-org-name')).toHaveText('00DRR00000PekkH2AR');
    await expect(page.getByTestId('start-scan-button')).toBeVisible();
  });

  test('shows a clear error when Salesforce returns error param', async ({ page }) => {
    await page.goto('/callback?error=access_denied&error_description=User+denied+the+request');
    await expect(page.getByTestId('callback-error-title')).toBeVisible();
    await expect(page.getByTestId('callback-error-detail')).toContainText('User denied the request');
  });

  test('shows a clear error when pending auth is missing', async ({ page }) => {
    await page.goto('/callback?code=abc&state=xyz');
    await expect(page.getByTestId('callback-error-title')).toContainText('No pending auth');
  });
});
