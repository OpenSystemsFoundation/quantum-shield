<script lang="ts">
  import { onMount } from 'svelte';
  import {
    exchangeCode,
    loadClientId,
    OAuthFlowError,
    parseCallbackParams,
    saveSession,
    sessionFromTokenAndIdentity,
    takePendingAuth,
  } from '@lib/auth';

  let status = $state<'working' | 'success' | 'error'>('working');
  let errorTitle = $state<string | null>(null);
  let errorDetail = $state<string | null>(null);

  onMount(async () => {
    const params = parseCallbackParams(window.location.search);

    if (params.error) {
      status = 'error';
      errorTitle = `Salesforce denied the authorization`;
      errorDetail = params.errorDescription ?? params.error;
      return;
    }

    if (!params.code || !params.state) {
      status = 'error';
      errorTitle = 'Missing authorization code';
      errorDetail = 'The callback URL did not include a code and state parameter.';
      return;
    }

    const pending = takePendingAuth();
    if (!pending) {
      status = 'error';
      errorTitle = 'No pending auth found';
      errorDetail = 'Looks like this tab was reopened from history. Start from /connect again.';
      return;
    }

    const clientId = loadClientId(pending.loginUrl);
    if (!clientId) {
      status = 'error';
      errorTitle = 'Client ID not found';
      errorDetail = 'We could not locate the External Client App ID for this login URL. Reconnect from /connect.';
      return;
    }

    try {
      const { token, identity } = await exchangeCode({
        code: params.code,
        state: params.state,
        pending,
        clientId,
      });
      const session = sessionFromTokenAndIdentity(pending, token, identity);
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

<div class="mx-auto max-w-xl px-6 py-24 text-center">
  {#if status === 'working'}
    <p class="text-xs font-semibold uppercase tracking-widest text-accent">Finishing sign-in</p>
    <h1 class="mt-3 text-2xl font-bold">Completing authentication…</h1>
    <p class="mt-3 text-sm text-ink-soft">Exchanging code for access token. This should take under a second.</p>
    <div class="mt-8 flex justify-center">
      <div class="h-2 w-48 overflow-hidden rounded-full bg-gray-200">
        <div class="h-full w-1/3 animate-pulse rounded-full bg-accent"></div>
      </div>
    </div>
  {:else if status === 'success'}
    <p class="text-xs font-semibold uppercase tracking-widest text-accent">Signed in</p>
    <h1 class="mt-3 text-2xl font-bold">Redirecting to your org…</h1>
  {:else}
    <p class="text-xs font-semibold uppercase tracking-widest text-severity-critical">Authentication failed</p>
    <h1 class="mt-3 text-2xl font-bold" data-testid="callback-error-title">{errorTitle}</h1>
    {#if errorDetail}
      <p class="mt-3 text-sm text-ink-soft" data-testid="callback-error-detail">{errorDetail}</p>
    {/if}
    <div class="mt-6 flex justify-center gap-3">
      <a href="/connect" class="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Try again</a>
      <a href="/install" class="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold">Setup guide</a>
    </div>
  {/if}
</div>
