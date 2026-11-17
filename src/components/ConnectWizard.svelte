<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_API_VERSION,
    environmentForMyDomain,
    isDevMock,
    launchAuth,
    loadAuthConfig,
    loadClientId,
    loadEnvPreference,
    normaliseMyDomain,
    probeOAuthCors,
    saveClientId,
    saveEnvPreference,
    buildMockSession,
    saveSession,
  } from '@lib/auth';
  import { SETUP_STEPS, type Segment } from '@lib/auth/setupSteps';

  type CorsState = 'idle' | 'checking' | 'ok' | 'oauth-cors-disabled' | 'origin-not-allowed';

  let myDomain = $state('');
  let apiVersion = $state(DEFAULT_API_VERSION);
  let clientId = $state('');
  let rememberClientId = $state(true);
  let step = $state<1 | 2 | 3>(1);
  let launching = $state(false);
  let mounted = $state(false);
  let errorMessage = $state<string | null>(null);
  let redirectUri = $state('');
  let origin = $state('');
  let cors = $state<CorsState>('idle');
  let copied = $state<string | null>(null);

  const mockEnabled = isDevMock();
  const STEP_LABELS = ['Your org', 'Org setup', 'Sign in'];

  onMount(() => {
    mounted = true;
    const cfg = loadAuthConfig();
    redirectUri = cfg.redirectUri;
    origin = redirectUri.replace(/\/callback$/, '');
    if (cfg.apiVersion) apiVersion = cfg.apiVersion;
    if (cfg.clientId && !clientId) clientId = cfg.clientId;
    // The preference used to hold an environment id; only a My Domain is
    // meaningful now.
    const prev = loadEnvPreference();
    if (prev && prev.includes('.')) myDomain = prev.replace(/^https:\/\//, '');
  });

  function resolvedDomain(): string | null {
    try {
      return normaliseMyDomain(myDomain);
    } catch {
      return null;
    }
  }

  $effect(() => {
    const domain = resolvedDomain();
    if (!domain) return;
    const cached = loadClientId(domain);
    if (cached && !clientId) clientId = cached;
  });

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => (copied = copied === key ? null : copied), 1500);
    } catch {
      /* clipboard unavailable: the value is selectable on screen */
    }
  }

  function validateDomain(): string | null {
    try {
      normaliseMyDomain(myDomain);
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid My Domain.';
    }
    if (!/^\d{2,3}\.0$/.test(apiVersion.trim())) return 'API version looks like 66.0.';
    return null;
  }

  function goToSetup(event?: Event) {
    event?.preventDefault();
    errorMessage = validateDomain();
    if (errorMessage) return;
    const domain = normaliseMyDomain(myDomain);
    myDomain = domain.replace(/^https:\/\//, '');
    saveEnvPreference(domain);
    cors = 'idle';
    step = 2;
  }

  async function checkCors(): Promise<boolean> {
    const domain = resolvedDomain();
    if (!domain) return false;
    cors = 'checking';
    const result = await probeOAuthCors(domain);
    cors = result.ok ? 'ok' : result.reason;
    return result.ok;
  }

  async function connect(event?: Event, { skipCheck = false } = {}) {
    event?.preventDefault();
    errorMessage = validateDomain();
    if (errorMessage) return;
    const trimmedId = clientId.trim();
    if (!trimmedId) {
      errorMessage = 'Paste the Consumer Key from your External Client App.';
      return;
    }
    launching = true;
    if (!skipCheck && cors !== 'ok' && !(await checkCors())) {
      launching = false;
      return;
    }
    try {
      const loginUrl = normaliseMyDomain(myDomain);
      if (rememberClientId) saveClientId(loginUrl, trimmedId);
      await launchAuth({
        environmentId: environmentForMyDomain(loginUrl),
        loginUrl,
        clientId: trimmedId,
        apiVersion: apiVersion.trim(),
      });
    } catch (e) {
      launching = false;
      errorMessage = e instanceof Error ? e.message : 'Could not start sign-in.';
    }
  }

  function devMockConnect() {
    saveSession(buildMockSession());
    window.location.assign('/app');
  }

  function valueOf(seg: { value: 'callback' | 'origin' }): string {
    return seg.value === 'callback' ? redirectUri : origin;
  }

  function isText(seg: Segment): seg is string {
    return typeof seg === 'string';
  }
</script>

<div class="narrow">
  <div class="wizard-head">
    <div>
      <div class="tiny-caps" style="color:var(--navy-600);margin-bottom:4px;">Browser setup</div>
      <h2>Use QuantumShield in the browser</h2>
      <p class="sub" style="margin:8px 0 0;max-width:540px;">
        Sign in with an External Client App you create in your own org. Nothing leaves your browser. For scheduled or repeat scans, the local <a href="/install#cli" class="mono">qshield</a> CLI needs no org setup at all.
      </p>
    </div>
    <ol class="wizard-steps" aria-label="Setup progress">
      {#each STEP_LABELS as label, i}
        <li
          class:done={step > i + 1}
          class:current={step === i + 1}
          aria-current={step === i + 1 ? 'step' : undefined}
        >
          <span class="dot" aria-hidden="true">{i + 1}</span>
          <span class="label">{label}</span>
        </li>
      {/each}
    </ol>
  </div>

  {#if step === 1}
    <form class="qs-card" onsubmit={goToSetup}>
      <div class="qs-card-head"><h3>Step 1 · Which org?</h3></div>
      <div class="qs-card-body">
        <label style="display:block;">
          <span class="tiny-caps">My Domain</span>
          <input
            type="text"
            inputmode="url"
            autocomplete="url"
            spellcheck="false"
            placeholder="acme.my.salesforce.com"
            class="mono wiz-input"
            bind:value={myDomain}
            data-testid="my-domain-input"
            aria-describedby="my-domain-help"
          />
        </label>
        <p id="my-domain-help" class="hint">
          Find it in Setup → My Domain, or paste the address of any Lightning page in the org. Sandboxes look like
          <span class="mono">acme--uat.sandbox.my.salesforce.com</span>. The generic login.salesforce.com and
          test.salesforce.com pages cannot be used from a browser app, because they do not allow cross-origin sign-in.
        </p>

        <details style="margin-top:14px;">
          <summary class="tiny-caps" style="cursor:pointer;">Advanced</summary>
          <label style="display:inline-block;margin-top:10px;">
            <span class="tiny-caps">API version</span>
            <input type="text" class="mono wiz-input" style="width:90px;" bind:value={apiVersion} />
          </label>
        </details>

        {#if errorMessage}
          <p class="wiz-error" role="alert">{errorMessage}</p>
        {/if}

        <div class="wiz-actions">
          {#if mockEnabled}
            <button
              type="button"
              class="qs-btn qs-btn-ghost qs-btn-sm"
              onclick={devMockConnect}
              disabled={!mounted}
              data-testid="dev-mock-connect"
            >Dev mock · skip OAuth</button>
          {:else}
            <span></span>
          {/if}
          <button type="submit" class="qs-btn qs-btn-primary" disabled={!mounted}>Continue</button>
        </div>
      </div>
    </form>
  {/if}

  {#if step === 2}
    <div class="qs-card">
      <div class="qs-card-head"><h3>Step 2 · One-time setup in {myDomain}</h3></div>
      <div class="qs-card-body">
        <p class="sub" style="margin-top:0;">
          An admin does this once per org. If your org already has a QuantumShield app and CORS entry for this site, skip ahead.
        </p>
        {#each SETUP_STEPS as section, si}
          <h4 class="setup-title"><span class="num">{String.fromCharCode(65 + si)}</span>{section.title}</h4>
          <ol class="setup-items">
            {#each section.items as item}
              <li>
                {#each item as seg}
                  {#if isText(seg)}{seg}{:else if 'ui' in seg}<span class="ui">{seg.ui}</span>{:else}
                    <span class="mono-field inline">
                      <code data-testid={seg.value === 'callback' ? 'redirect-uri' : 'cors-origin'}>{valueOf(seg)}</code>
                      <button type="button" onclick={() => copy(valueOf(seg), seg.value)}>
                        {copied === seg.value ? 'Copied' : 'Copy'}
                      </button>
                    </span>
                  {/if}
                {/each}
              </li>
            {/each}
          </ol>
        {/each}

        <div class="cors-check" aria-live="polite">
          <button type="button" class="qs-btn qs-btn-sm" onclick={checkCors} disabled={cors === 'checking'} data-testid="cors-check">
            {cors === 'checking' ? 'Checking…' : 'Check CORS setup'}
          </button>
          {#if cors === 'ok'}
            <span class="ok">CORS is set up for this site.</span>
          {:else if cors === 'oauth-cors-disabled'}
            <span class="bad">This site is allowed, but "Enable CORS for OAuth endpoints" is off (step B).</span>
          {:else if cors === 'origin-not-allowed'}
            <span class="bad">The org does not allow {origin} yet (step B), or the My Domain is wrong.</span>
          {/if}
        </div>

        <div class="wiz-actions">
          <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={() => (step = 1)}>← back</button>
          <button type="button" class="qs-btn qs-btn-primary" onclick={() => (step = 3)}>Setup done, next →</button>
        </div>
      </div>
    </div>
  {/if}

  {#if step === 3}
    <form class="qs-card" onsubmit={(e) => connect(e)}>
      <div class="qs-card-head"><h3>Step 3 · Paste the Consumer Key and sign in</h3></div>
      <div class="qs-card-body">
        <label style="display:block;">
          <span class="tiny-caps">Consumer Key (Client ID)</span>
          <input
            type="text"
            spellcheck="false"
            autocomplete="off"
            class="mono wiz-input"
            placeholder="3MVG9..."
            bind:value={clientId}
            data-testid="client-id-input"
          />
        </label>

        <label class="remember">
          <input type="checkbox" style="accent-color:var(--navy-600);" bind:checked={rememberClientId} />
          Remember this key on this device (it is not a secret)
        </label>

        <p class="hint">
          You sign in on Salesforce's own page. The access token stays in this tab's session storage and is gone when you close the tab. QuantumShield asks only for read access through the API.
        </p>

        {#if cors === 'oauth-cors-disabled' || cors === 'origin-not-allowed'}
          <div class="wiz-error" role="alert">
            {#if cors === 'oauth-cors-disabled'}
              Sign-in would fail: "Enable CORS for OAuth endpoints" is off in {myDomain}.
            {:else}
              Sign-in would fail: {myDomain} does not list {origin} in its CORS Allowed Origins.
            {/if}
            <span style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <button type="button" class="qs-btn qs-btn-sm" onclick={() => (step = 2)}>Show setup steps</button>
              <button type="button" class="qs-btn qs-btn-sm qs-btn-ghost" onclick={() => connect(undefined, { skipCheck: true })}>Try anyway</button>
            </span>
          </div>
        {:else if errorMessage}
          <p class="wiz-error" role="alert">{errorMessage}</p>
        {/if}

        <div class="wiz-actions">
          <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={() => (step = 2)}>← back</button>
          <button
            type="submit"
            class="qs-btn qs-btn-primary qs-btn-lg"
            disabled={launching}
            data-testid="connect-button"
          >
            {launching ? (cors === 'checking' ? 'Checking org setup…' : 'Redirecting to Salesforce…') : 'Sign in with Salesforce'}
          </button>
        </div>
      </div>
    </form>
  {/if}
</div>

<style>
  .wizard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
  .wizard-steps { display: flex; gap: 12px; list-style: none; padding: 0; margin: 0; }
  .wizard-steps li { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); }
  .wizard-steps .dot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 50%;
    font: 600 11px var(--mono);
    border: 1px solid var(--line); background: var(--surface); color: var(--muted);
  }
  .wizard-steps li.current, .wizard-steps li.done { color: var(--ink-2); }
  .wizard-steps li.current .dot, .wizard-steps li.done .dot { border-color: var(--navy-600); background: var(--navy-600); color: white; }
  .wiz-input {
    margin-top: 4px; width: 100%; padding: 8px 10px;
    border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
    font-size: 12.5px; box-sizing: border-box;
  }
  .hint { margin: 8px 0 0; font-size: 12px; color: var(--ink-3); line-height: 1.5; }
  .wiz-error { margin-top: 14px; padding: 8px 10px; border-radius: 6px; background: var(--crit-bg); color: var(--crit); font-size: 12.5px; }
  .wiz-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
  .remember { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12.5px; color: var(--ink-2); }
  .setup-title { display: flex; align-items: center; gap: 8px; margin: 18px 0 6px; font-size: 13.5px; }
  .setup-title .num {
    display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
    border-radius: 50%; background: var(--navy-600); color: white; font: 600 10.5px var(--mono);
  }
  .setup-items { margin: 0; padding-left: 36px; font-size: 12.5px; color: var(--ink-2); line-height: 1.6; }
  .setup-items li { margin: 4px 0; overflow-wrap: anywhere; }
  .ui { font-family: var(--mono); color: var(--ink); font-size: 12px; }
  .mono-field.inline {
    display: flex; align-items: center; gap: 8px; margin-top: 6px; max-width: 100%;
    background: var(--surface-container-lowest); border: var(--ghost-border); border-radius: 6px;
    padding: 6px 10px; font-family: var(--mono); font-size: 12px;
  }
  .mono-field.inline code { flex: 1; word-break: break-all; color: var(--ink); }
  .mono-field.inline button { font-size: 11px; color: var(--navy-600); background: transparent; border: none; cursor: pointer; }
  .cors-check { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 18px; font-size: 12.5px; }
  .cors-check .ok { color: var(--ok, #1f7a4d); }
  .cors-check .bad { color: var(--crit); }
</style>