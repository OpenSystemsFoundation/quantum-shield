<script lang="ts">
  import BlochShield from './BlochShield.svelte';
  import { clearSession, type Session } from '@lib/auth';
  import { clearAll } from '@lib/persistence/db';
  import { SAMPLE_BANNER_TEXT } from '@lib/demo/sample';

  interface Props {
    session: Session;
    active: 'overview' | 'scan' | 'findings' | 'report' | 'security';
    crumb?: string;
    scanCount?: number;
    findingsCount?: number;
    /** Scan id of the most recent completed scan; null when no report exists yet. */
    latestReportScanId?: string | null;
    /** Public sample-report mode: no session, no org, nothing stored. */
    demo?: boolean;
  }
  const {
    session,
    active,
    crumb,
    scanCount = 0,
    findingsCount = 0,
    latestReportScanId = null,
    demo = false,
  }: Props = $props();

  const reportHref = $derived(
    latestReportScanId ? `/app/report/?id=${encodeURIComponent(latestReportScanId)}` : null,
  );

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let deleteLocalData = $state(false);
  let signingOut = $state(false);

  const REVOKE_TIMEOUT_MS = 4000;

  /**
   * Best-effort token revocation at the org's own OAuth endpoint. The request
   * is a CORS-safelisted form POST sent `no-cors`: the response is opaque, so
   * success cannot be confirmed — the local session is discarded either way.
   */
  async function revokeToken(s: Session): Promise<void> {
    if (s.mock || !s.accessToken) return;
    let url: URL;
    try {
      url = new URL('/services/oauth2/revoke', s.instanceUrl);
    } catch {
      return;
    }
    if (url.protocol !== 'https:') return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: s.accessToken }).toString(),
        signal: controller.signal,
      });
    } catch {
      /* offline, blocked or timed out — sign out locally regardless */
    } finally {
      clearTimeout(timer);
    }
  }

  function askSignOut() {
    deleteLocalData = false;
    dialogEl?.showModal();
  }

  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    await revokeToken(session);
    clearSession();
    if (deleteLocalData) {
      try {
        await clearAll();
      } catch {
        /* IndexedDB unavailable; nothing more to delete */
      }
    }
    window.location.replace('/');
  }
</script>

<header class="topbar">
  <a class="brand" href={demo ? '/' : '/app'}>
    <BlochShield size={22} />
    <span>QuantumShield</span>
  </a>
  <div class="crumb">
    <span class="sep">/</span>
    <span>{session.org.orgName ?? session.org.orgId}</span>
    {#if crumb}
      <span class="sep">/</span>
      <span style="color:var(--ink-2);">{crumb}</span>
    {/if}
  </div>
  <div class="right">
    {#if demo}
      <a class="qs-btn qs-btn-sm" href="/" data-testid="exit-sample">Exit sample</a>
    {:else}
      <span class="orgchip">
        <span class="dot"></span>
        <span><strong>{session.org.orgName ?? 'Org'}</strong> · {session.environmentId}</span>
      </span>
      <button type="button" class="qs-btn qs-btn-sm" onclick={askSignOut} data-testid="sign-out-button">Sign out</button>
    {/if}
  </div>
</header>

{#if demo}
  <div class="demo-banner" role="note" data-testid="demo-banner">
    <strong>{SAMPLE_BANNER_TEXT}</strong>
    <span>Bundled fixture data run through the real rule catalog. No Salesforce org was contacted and nothing is stored.</span>
    <a href="/install">Scan your own org</a>
  </div>
{/if}

<nav class="sidebar" aria-label="App">
  {#if demo}
    <div class="sidenav-section">Sample</div>
    <a class="sidenav-item active" href="/demo" aria-current="page">
      Sample report
      <span class="count">{findingsCount > 0 ? findingsCount : ''}</span>
    </a>
    <a class="sidenav-item" href="/install">Scan your own org</a>
  {:else}
    <div class="sidenav-section">Workspace</div>
    <a class="sidenav-item" class:active={active === 'overview'} aria-current={active === 'overview' ? 'page' : undefined} href="/app">
      Overview
    </a>
    <a class="sidenav-item" class:active={active === 'scan'} aria-current={active === 'scan' ? 'page' : undefined} href="/app#scan-history">
      Scans
      <span class="count">{scanCount}</span>
    </a>
    {#if reportHref}
      <a class="sidenav-item" class:active={active === 'findings'} aria-current={active === 'findings' ? 'page' : undefined} href={reportHref}>
        Findings
        <span class="count">{findingsCount > 0 ? findingsCount : ''}</span>
      </a>
      <a class="sidenav-item" class:active={active === 'report'} href={`${reportHref}#export`}>
        Report
      </a>
    {:else}
      <!-- No href, so not focusable; role + aria-disabled make it announce as
           an unavailable link, and the hidden text says why. -->
      <span class="sidenav-item" role="link" aria-disabled="true">
        Findings
        <span class="sr-only">(unavailable — run a scan first)</span>
      </span>
      <span class="sidenav-item" role="link" aria-disabled="true">
        Report
        <span class="sr-only">(unavailable — run a scan first)</span>
      </span>
    {/if}
  {/if}

  <div class="sidenav-section">Trust</div>
  <a class="sidenav-item" class:active={active === 'security'} href="/security">
    Security
  </a>
  <a class="sidenav-item" href="/install">
    Install
  </a>

  {#if !demo}
    <div class="sidenav-section">Identity</div>
    <div class="sidenav-item" style="cursor:default;">
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted);overflow-wrap:anywhere;">{session.org.username ?? session.org.userId}</span>
    </div>
    {#if session.mock}
      <div class="sidenav-item" style="cursor:default;">
        <span style="font-family:var(--mono);font-size:10.5px;color:var(--warn);">dev-mock session</span>
      </div>
    {/if}
  {/if}
</nav>

{#if !demo}
  <dialog bind:this={dialogEl} class="qs-dialog" aria-labelledby="signout-title" data-testid="sign-out-dialog">
    <h2 id="signout-title">Sign out of {session.org.orgName ?? 'this org'}?</h2>
    <p>
      {#if session.mock}
        This ends the dev-mock session in this tab.
      {:else}
        This asks Salesforce to revoke the access token, then removes it from this tab.
      {/if}
      Saved scans and reports stay in this browser unless you delete them.
    </p>
    <label>
      <input type="checkbox" bind:checked={deleteLocalData} data-testid="sign-out-delete-data" />
      <span>Also delete local scan data (all saved scans and reports in this browser)</span>
    </label>
    <div class="actions">
      <button type="button" class="qs-btn qs-btn-sm" onclick={() => dialogEl?.close()} disabled={signingOut}>Cancel</button>
      <button type="button" class="qs-btn qs-btn-sm qs-btn-primary" onclick={signOut} disabled={signingOut} data-testid="sign-out-confirm">
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  </dialog>
{/if}
