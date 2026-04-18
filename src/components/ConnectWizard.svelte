<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_API_VERSION,
    ENVIRONMENTS,
    isDevMock,
    launchAuth,
    loadAuthConfig,
    loadClientId,
    loadEnvPreference,
    normaliseCustomDomain,
    resolveLoginUrl,
    saveClientId,
    saveEnvPreference,
    buildMockSession,
    saveSession,
  } from '@lib/auth';
  import type { EnvironmentId } from '@lib/auth';

  let envId = $state<EnvironmentId>('production');
  let customDomain = $state('');
  let apiVersion = $state(DEFAULT_API_VERSION);
  let clientId = $state('');
  let rememberClientId = $state(true);
  let step = $state<1 | 2 | 3 | 4>(1);
  let launching = $state(false);
  let errorMessage = $state<string | null>(null);
  let redirectUri = $state('');

  const mockEnabled = isDevMock();

  onMount(() => {
    const cfg = loadAuthConfig();
    redirectUri = cfg.redirectUri;
    if (cfg.apiVersion) apiVersion = cfg.apiVersion;
    const prev = loadEnvPreference();
    if (prev === 'production' || prev === 'sandbox' || prev === 'custom') {
      envId = prev;
    }
  });

  $effect(() => {
    if (envId === 'production' || envId === 'sandbox' || (envId === 'custom' && customDomain.trim())) {
      try {
        const url = resolveLoginUrl(envId, envId === 'custom' ? customDomain : undefined);
        const cached = loadClientId(url);
        if (cached && !clientId) clientId = cached;
      } catch {
        /* ignore until custom domain is valid */
      }
    }
  });

  function chooseEnv(id: EnvironmentId) {
    envId = id;
    errorMessage = null;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  function validateEnv(): string | null {
    if (envId === 'custom') {
      if (!customDomain.trim()) return 'Enter your My Domain URL (e.g. acme.my.salesforce.com).';
      try {
        normaliseCustomDomain(customDomain);
      } catch (e) {
        return e instanceof Error ? e.message : 'Invalid custom domain.';
      }
    }
    return null;
  }

  function advanceToStep(n: 2 | 3 | 4) {
    errorMessage = validateEnv();
    if (errorMessage) return;
    saveEnvPreference(envId);
    step = n;
  }

  async function connect() {
    errorMessage = validateEnv();
    if (errorMessage) return;
    const trimmedId = clientId.trim();
    if (!trimmedId) {
      errorMessage = 'Paste the Consumer Key / Client ID from your External Client App.';
      return;
    }
    launching = true;
    try {
      const loginUrl = resolveLoginUrl(envId, envId === 'custom' ? customDomain : undefined);
      if (rememberClientId) saveClientId(loginUrl, trimmedId);
      await launchAuth({
        environmentId: envId,
        loginUrl,
        clientId: trimmedId,
        apiVersion,
      });
    } catch (e) {
      launching = false;
      errorMessage = e instanceof Error ? e.message : 'Could not start OAuth flow.';
    }
  }

  function devMockConnect() {
    saveSession(buildMockSession());
    window.location.assign('/app');
  }
</script>

<div class="mx-auto max-w-3xl px-6 py-16">
  <div class="mb-8 flex items-center justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-accent">Connect your org</p>
      <h1 class="mt-1 text-3xl font-bold">Set up QuantumShield for your Salesforce org</h1>
    </div>
    <ol class="flex gap-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
      {#each [1, 2, 3, 4] as n}
        <li
          class="flex h-7 w-7 items-center justify-center rounded-full border"
          class:border-accent={step >= n}
          class:bg-accent={step >= n}
          class:text-white={step >= n}
          class:border-gray-300={step < n}
        >{n}</li>
      {/each}
    </ol>
  </div>

  {#if step === 1}
    <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Step 1 · Pick your environment</h2>
      <p class="mt-1 text-sm text-ink-soft">Choose which Salesforce endpoint hosts your org.</p>

      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          class="rounded-lg border p-4 text-left transition"
          class:border-accent={envId === 'production'}
          class:bg-accent-soft={envId === 'production'}
          class:border-gray-300={envId !== 'production'}
          onclick={() => chooseEnv('production')}
        >
          <p class="font-semibold">Production</p>
          <p class="text-xs text-ink-soft">login.salesforce.com</p>
        </button>
        <button
          type="button"
          class="rounded-lg border p-4 text-left transition"
          class:border-accent={envId === 'sandbox'}
          class:bg-accent-soft={envId === 'sandbox'}
          class:border-gray-300={envId !== 'sandbox'}
          onclick={() => chooseEnv('sandbox')}
        >
          <p class="font-semibold">Sandbox</p>
          <p class="text-xs text-ink-soft">test.salesforce.com</p>
        </button>
        <button
          type="button"
          class="rounded-lg border p-4 text-left transition"
          class:border-accent={envId === 'custom'}
          class:bg-accent-soft={envId === 'custom'}
          class:border-gray-300={envId !== 'custom'}
          onclick={() => chooseEnv('custom')}
        >
          <p class="font-semibold">My Domain</p>
          <p class="text-xs text-ink-soft">your-org.my.salesforce.com</p>
        </button>
      </div>

      {#if envId === 'custom'}
        <label class="mt-4 block">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-soft">My Domain URL</span>
          <input
            type="text"
            placeholder="acme.my.salesforce.com"
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            bind:value={customDomain}
          />
        </label>
      {/if}

      <label class="mt-4 block">
        <span class="text-xs font-semibold uppercase tracking-wider text-ink-soft">API version</span>
        <input
          type="text"
          class="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
          bind:value={apiVersion}
        />
      </label>

      {#if errorMessage}
        <p class="mt-4 rounded-md bg-severity-critical/10 px-3 py-2 text-sm text-severity-critical">{errorMessage}</p>
      {/if}

      <div class="mt-6 flex items-center justify-between">
        {#if mockEnabled}
          <button
            type="button"
            class="text-xs text-ink-soft underline"
            onclick={devMockConnect}
            data-testid="dev-mock-connect"
          >Dev mock: skip OAuth</button>
        {:else}
          <span></span>
        {/if}
        <button
          type="button"
          class="rounded-md bg-ink px-5 py-2 font-semibold text-white hover:bg-ink-soft"
          onclick={() => advanceToStep(2)}
        >Continue</button>
      </div>
    </section>
  {/if}

  {#if step === 2}
    <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Step 2 · Create an External Client App in your org</h2>
      <p class="mt-1 text-sm text-ink-soft">
        QuantumShield never lives in our Salesforce org — you create the OAuth app inside yours, keep ownership of the client ID, and can revoke access at any time.
      </p>

      <ol class="mt-6 space-y-4 text-sm text-ink-soft">
        <li>
          <span class="font-semibold text-ink">1.</span> In your Salesforce org, open
          <span class="font-mono text-ink">Setup → App Manager</span> and click
          <span class="font-mono text-ink">New External Client App</span>
          <span class="text-xs">(or <span class="font-mono text-ink">New Connected App</span> on older orgs).</span>
        </li>
        <li>
          <span class="font-semibold text-ink">2.</span> Give the app a name —
          <span class="font-mono text-ink">QuantumShield Scanner</span> is fine — and enter your own contact email.
        </li>
        <li>
          <span class="font-semibold text-ink">3.</span> Under
          <span class="font-mono text-ink">API (Enable OAuth Settings)</span>, turn on
          <span class="font-mono text-ink">Enable OAuth</span> and
          <span class="font-mono text-ink">Enable for Device Flow</span> = off. Turn on
          <span class="font-mono text-ink">Require Proof Key for Code Exchange (PKCE)</span>.
        </li>
        <li>
          <span class="font-semibold text-ink">4.</span> Select scopes
          <span class="font-mono text-ink">api, refresh_token, id</span>. Do not select
          <span class="font-mono text-ink">full</span> or
          <span class="font-mono text-ink">web</span>.
        </li>
        <li>
          <span class="font-semibold text-ink">5.</span> Save the app and open it again. Note the
          <span class="font-mono text-ink">Consumer Key</span> — you'll paste it in step 4.
        </li>
      </ol>

      <div class="mt-6 flex items-center justify-between">
        <button type="button" class="text-sm text-ink-soft underline" onclick={() => (step = 1)}>← back</button>
        <button
          type="button"
          class="rounded-md bg-ink px-5 py-2 font-semibold text-white hover:bg-ink-soft"
          onclick={() => (step = 3)}
        >App created, next →</button>
      </div>
    </section>
  {/if}

  {#if step === 3}
    <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Step 3 · Whitelist our callback URL</h2>
      <p class="mt-1 text-sm text-ink-soft">
        Paste the URL below into your External Client App's
        <span class="font-mono text-ink">Callback URL</span> field (multiple URLs are fine — just add this one to the list).
      </p>

      <div class="mt-6 rounded-lg border border-gray-300 bg-surface-muted p-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-ink-soft">Callback URL</span>
          <button
            type="button"
            class="text-xs font-semibold text-accent hover:underline"
            onclick={() => copyToClipboard(redirectUri)}
          >Copy</button>
        </div>
        <p class="mt-2 break-all font-mono text-sm" data-testid="redirect-uri">{redirectUri}</p>
      </div>

      <p class="mt-4 text-xs text-ink-soft">
        After pasting, save your External Client App policies. The change takes effect immediately.
      </p>

      <div class="mt-6 flex items-center justify-between">
        <button type="button" class="text-sm text-ink-soft underline" onclick={() => (step = 2)}>← back</button>
        <button
          type="button"
          class="rounded-md bg-ink px-5 py-2 font-semibold text-white hover:bg-ink-soft"
          onclick={() => (step = 4)}
        >Callback saved, next →</button>
      </div>
    </section>
  {/if}

  {#if step === 4}
    <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Step 4 · Paste your Consumer Key and connect</h2>
      <p class="mt-1 text-sm text-ink-soft">
        One-time paste — we remember it in your browser so you won't need to do this again for this org.
      </p>

      <label class="mt-6 block">
        <span class="text-xs font-semibold uppercase tracking-wider text-ink-soft">Consumer Key (Client ID)</span>
        <input
          type="text"
          class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
          placeholder="3MVG9..."
          bind:value={clientId}
          data-testid="client-id-input"
        />
      </label>

      <label class="mt-3 flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" bind:checked={rememberClientId} />
        Remember this client ID on this device
      </label>

      {#if errorMessage}
        <p class="mt-4 rounded-md bg-severity-critical/10 px-3 py-2 text-sm text-severity-critical">{errorMessage}</p>
      {/if}

      <div class="mt-6 flex items-center justify-between">
        <button type="button" class="text-sm text-ink-soft underline" onclick={() => (step = 3)}>← back</button>
        <button
          type="button"
          class="rounded-md bg-accent px-5 py-2 font-semibold text-white hover:bg-accent/80 disabled:opacity-50"
          disabled={launching}
          onclick={connect}
          data-testid="connect-button"
        >{launching ? 'Redirecting to Salesforce…' : 'Connect to Salesforce'}</button>
      </div>
    </section>
  {/if}
</div>
