<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_API_VERSION,
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
    if (cfg.clientId && !clientId) {
      clientId = cfg.clientId;
    }
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
        /* ignore */
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

<div class="narrow">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
    <div>
      <div class="tiny-caps" style="color:var(--navy-600);margin-bottom:4px;">Connect your org</div>
      <h2>Set up QuantumShield</h2>
    </div>
    <ol style="display:flex;gap:6px;list-style:none;padding:0;margin:0;">
      {#each [1, 2, 3, 4] as n}
        <li
          style="
            display:flex;align-items:center;justify-content:center;
            width:26px;height:26px;border-radius:50%;
            font-size:11px;font-weight:600;font-family:var(--mono);
            border:1px solid {step >= n ? 'var(--navy-600)' : 'var(--line)'};
            background:{step >= n ? 'var(--navy-600)' : 'var(--surface)'};
            color:{step >= n ? 'white' : 'var(--muted)'};"
        >{n}</li>
      {/each}
    </ol>
  </div>

  {#if step === 1}
    <div class="qs-card">
      <div class="qs-card-head"><h3>Step 1 · Pick your environment</h3></div>
      <div class="qs-card-body">
        <p class="sub" style="margin-top:0;">Choose which Salesforce endpoint hosts your org.</p>
        <div class="env-picker">
          <button
            type="button"
            class="env-opt"
            class:selected={envId === 'production'}
            onclick={() => chooseEnv('production')}
          >
            <span class="radio"></span>
            <span>
              <div class="title">Production / Developer Edition</div>
              <div class="desc">login.salesforce.com</div>
            </span>
            <span class="tag">https</span>
          </button>
          <button
            type="button"
            class="env-opt"
            class:selected={envId === 'sandbox'}
            onclick={() => chooseEnv('sandbox')}
          >
            <span class="radio"></span>
            <span>
              <div class="title">Sandbox</div>
              <div class="desc">test.salesforce.com</div>
            </span>
            <span class="tag">sandbox</span>
          </button>
          <button
            type="button"
            class="env-opt"
            class:selected={envId === 'custom'}
            onclick={() => chooseEnv('custom')}
          >
            <span class="radio"></span>
            <span>
              <div class="title">My Domain</div>
              <div class="desc">your-org.my.salesforce.com</div>
            </span>
            <span class="tag">custom</span>
          </button>
        </div>

        {#if envId === 'custom'}
          <label style="display:block;margin-top:16px;">
            <span class="tiny-caps">My Domain URL</span>
            <input
              type="text"
              placeholder="acme.my.salesforce.com"
              class="mono"
              style="margin-top:4px;width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);font-size:12.5px;"
              bind:value={customDomain}
            />
          </label>
        {/if}

        <div style="display:flex;align-items:center;gap:12px;margin-top:18px;">
          <label>
            <span class="tiny-caps">API version</span>
            <input
              type="text"
              class="mono"
              style="margin-top:4px;width:90px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);font-size:12.5px;"
              bind:value={apiVersion}
            />
          </label>
        </div>

        {#if errorMessage}
          <p style="margin-top:14px;padding:8px 10px;border-radius:6px;background:var(--crit-bg);color:var(--crit);font-size:12.5px;">
            {errorMessage}
          </p>
        {/if}

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;">
          {#if mockEnabled}
            <button
              type="button"
              class="qs-btn qs-btn-ghost qs-btn-sm"
              onclick={devMockConnect}
              data-testid="dev-mock-connect"
            >Dev mock · skip OAuth</button>
          {:else}
            <span></span>
          {/if}
          <button type="button" class="qs-btn qs-btn-primary" onclick={() => advanceToStep(2)}>
            Continue
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if step === 2}
    <div class="qs-card">
      <div class="qs-card-head"><h3>Step 2 · Create an External Client App in your org</h3></div>
      <div class="qs-card-body">
        <p class="sub" style="margin-top:0;">
          QuantumShield never lives in our Salesforce org — you create the OAuth app inside yours, keep ownership of the client ID, and can revoke access at any time.
        </p>

        <ol class="cors-steps" style="list-style:none;padding:0;">
          <li class="cors-step">
            <div class="num">1</div>
            <div class="body">
              Open <span class="mono" style="color:var(--ink)">Setup → App Manager</span> and click
              <span class="mono" style="color:var(--ink)">New External Client App</span>.
              On older orgs, use <span class="mono" style="color:var(--ink)">New Connected App</span>.
            </div>
          </li>
          <li class="cors-step">
            <div class="num">2</div>
            <div class="body">
              Name the app <span class="mono" style="color:var(--ink)">QuantumShield Scanner</span>. Enter your own contact email.
            </div>
          </li>
          <li class="cors-step">
            <div class="num">3</div>
            <div class="body">
              Under <span class="mono" style="color:var(--ink)">API (Enable OAuth Settings)</span>: enable OAuth; enable <span class="mono" style="color:var(--ink)">Require PKCE</span>; leave Device Flow and Client Credentials off.
            </div>
          </li>
          <li class="cors-step">
            <div class="num">4</div>
            <div class="body">
              Scopes: <span class="mono" style="color:var(--ink)">api</span>, <span class="mono" style="color:var(--ink)">refresh_token</span>, <span class="mono" style="color:var(--ink)">id</span>. Do not select <span class="mono" style="color:var(--ink)">full</span> or <span class="mono" style="color:var(--ink)">web</span>.
            </div>
          </li>
          <li class="cors-step">
            <div class="num">5</div>
            <div class="body">
              Save. Reopen the app and note the <span class="mono" style="color:var(--ink)">Consumer Key</span> — you'll paste it in step 4.
            </div>
          </li>
        </ol>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;">
          <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={() => (step = 1)}>← back</button>
          <button type="button" class="qs-btn qs-btn-primary" onclick={() => (step = 3)}>App created, next →</button>
        </div>
      </div>
    </div>
  {/if}

  {#if step === 3}
    <div class="qs-card">
      <div class="qs-card-head"><h3>Step 3 · Whitelist our callback URL</h3></div>
      <div class="qs-card-body">
        <p class="sub" style="margin-top:0;">
          Paste the URL below into your External Client App's
          <span class="mono" style="color:var(--ink)">Callback URL</span> field. Multiple URLs are fine — just add this one to the list.
        </p>

        <div class="cors-step" style="grid-template-columns: 1fr;">
          <div class="body">
            <div class="tiny-caps">Callback URL</div>
            <div class="mono-field">
              <code data-testid="redirect-uri">{redirectUri}</code>
              <button type="button" onclick={() => copyToClipboard(redirectUri)}>Copy</button>
            </div>
          </div>
        </div>

        <p style="margin-top:14px;font-size:11.5px;color:var(--muted);font-family:var(--mono);">
          After pasting, save your External Client App policies. The change takes effect immediately.
        </p>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;">
          <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={() => (step = 2)}>← back</button>
          <button type="button" class="qs-btn qs-btn-primary" onclick={() => (step = 4)}>Callback saved, next →</button>
        </div>
      </div>
    </div>
  {/if}

  {#if step === 4}
    <div class="qs-card">
      <div class="qs-card-head"><h3>Step 4 · Paste Consumer Key and connect</h3></div>
      <div class="qs-card-body">
        <p class="sub" style="margin-top:0;">
          One-time paste — we remember it in your browser so you won't need to do this again for this org.
        </p>

        <label style="display:block;">
          <span class="tiny-caps">Consumer Key (Client ID)</span>
          <input
            type="text"
            class="mono"
            style="margin-top:4px;width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);font-size:12.5px;"
            placeholder="3MVG9..."
            bind:value={clientId}
            data-testid="client-id-input"
          />
        </label>

        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12.5px;color:var(--ink-2);">
          <input type="checkbox" style="accent-color:var(--navy-600);" bind:checked={rememberClientId} />
          Remember this client ID on this device
        </label>

        {#if errorMessage}
          <p style="margin-top:14px;padding:8px 10px;border-radius:6px;background:var(--crit-bg);color:var(--crit);font-size:12.5px;">
            {errorMessage}
          </p>
        {/if}

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;">
          <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={() => (step = 3)}>← back</button>
          <button
            type="button"
            class="qs-btn qs-btn-primary qs-btn-lg"
            disabled={launching}
            onclick={connect}
            data-testid="connect-button"
          >
            {launching ? 'Redirecting to Salesforce…' : 'Connect to Salesforce'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
