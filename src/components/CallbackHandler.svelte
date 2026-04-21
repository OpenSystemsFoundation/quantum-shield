<script lang="ts">
  import { onMount } from 'svelte';
  import {
    exchangeCode,
    loadClientId,
    OAuthFlowError,
    parseCallbackParams,
    saveSession,
    sessionFromToken,
    sessionFromTokenAndIdentity,
    takePendingAuth,
    tokenFromCallbackParams,
  } from '@lib/auth';
  import BlochShield from './BlochShield.svelte';

  let status = $state<'working' | 'success' | 'error'>('working');
  let errorTitle = $state<string | null>(null);
  let errorDetail = $state<string | null>(null);

  onMount(async () => {
    const params = parseCallbackParams(window.location.search, window.location.hash);

    if (params.error) {
      status = 'error';
      errorTitle = 'Salesforce denied the authorization';
      errorDetail = params.errorDescription ?? params.error;
      return;
    }

    if (!params.state || (!params.code && !params.accessToken)) {
      status = 'error';
      errorTitle = 'Missing OAuth response';
      errorDetail = 'The callback URL did not include the expected authorization response.';
      return;
    }

    const pending = takePendingAuth();
    if (!pending) {
      status = 'error';
      errorTitle = 'No pending auth found';
      errorDetail = 'Looks like this tab was reopened from history. Start from /connect again.';
      return;
    }

    try {
      let session;

      if (params.accessToken) {
        const token = tokenFromCallbackParams(params);
        if (!token) {
          throw new OAuthFlowError(
            'invalid-callback',
            'OAuth callback fragment was missing one or more required token fields.',
          );
        }
        if (params.state !== pending.state) {
          throw new OAuthFlowError('state-mismatch', 'OAuth state mismatch — aborting for safety.');
        }
        session = sessionFromToken(pending, token);
      } else {
        const clientId = loadClientId(pending.loginUrl);
        if (!clientId || !params.code) {
          status = 'error';
          errorTitle = 'Client ID not found';
          errorDetail = 'We could not locate the External Client App ID for this login URL. Reconnect from /connect.';
          return;
        }

        const { token, identity } = await exchangeCode({
          code: params.code,
          state: params.state,
          pending,
          clientId,
        });
        session = sessionFromTokenAndIdentity(pending, token, identity);
      }

      saveSession(session);
      status = 'success';
      window.location.replace('/app');
    } catch (err) {
      status = 'error';
      if (err instanceof OAuthFlowError) {
        errorTitle = `OAuth failed (${err.kind})`;
        errorDetail = err.message;
      } else {
        errorTitle = 'OAuth failed';
        errorDetail = err instanceof Error ? err.message : String(err);
      }
    }
  });
</script>

<div style="min-height:100vh;display:grid;place-items:center;background:var(--bg);">
  <div class="qs-card" style="max-width:480px;width:100%;margin:24px;padding:32px 28px;text-align:center;">
    <div style="display:flex;justify-content:center;margin-bottom:18px;">
      <BlochShield size={48} />
    </div>

    {#if status === 'working'}
      <div class="tiny-caps" style="color:var(--navy-600);">Finishing sign-in</div>
      <h1 class="serif" style="font-size:22px;font-weight:500;margin:8px 0 6px;letter-spacing:-0.005em;">
        Completing authentication…
      </h1>
      <p style="margin:0;color:var(--ink-3);font-size:12.5px;">
        Finalizing your Salesforce session.
      </p>
      <div style="margin:18px auto 0;width:180px;height:4px;background:var(--bg-2);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:45%;background:var(--navy-500);animation:qs-pulse 1.4s infinite;"></div>
      </div>
    {:else if status === 'success'}
      <div class="tiny-caps" style="color:var(--ok);">Signed in</div>
      <h1 class="serif" style="font-size:22px;font-weight:500;margin:8px 0 6px;">Redirecting to your org…</h1>
    {:else}
      <div class="tiny-caps" style="color:var(--crit);">Authentication failed</div>
      <h1 class="serif" style="font-size:22px;font-weight:500;margin:8px 0 6px;" data-testid="callback-error-title">
        {errorTitle}
      </h1>
      {#if errorDetail}
        <p style="margin:0;color:var(--ink-3);font-size:12.5px;" data-testid="callback-error-detail">
          {errorDetail}
        </p>
      {/if}
      <div style="margin-top:18px;display:flex;justify-content:center;gap:10px;">
        <a href="/connect" class="qs-btn qs-btn-primary">Try again</a>
        <a href="/install" class="qs-btn">Setup guide</a>
      </div>
    {/if}
  </div>
</div>
