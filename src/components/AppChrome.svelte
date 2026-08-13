<script lang="ts">
  import BlochShield from './BlochShield.svelte';
  import { clearSession, type Session } from '@lib/auth';

  interface Props {
    session: Session;
    active: 'overview' | 'scan' | 'findings' | 'report' | 'security';
    crumb?: string;
    scanCount?: number;
    findingsCount?: number;
    /** Scan id of the most recent completed scan; null when no report exists yet. */
    latestReportScanId?: string | null;
  }
  const { session, active, crumb, scanCount = 0, findingsCount = 0, latestReportScanId = null }: Props = $props();

  const reportHref = $derived(
    latestReportScanId ? `/app/report/?id=${encodeURIComponent(latestReportScanId)}` : null,
  );

  function signOut() {
    clearSession();
    window.location.replace('/');
  }
</script>

<header class="topbar">
  <a class="brand" href="/app">
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
    <span class="orgchip">
      <span class="dot"></span>
      <span><strong>{session.org.orgName ?? 'Org'}</strong> · {session.environmentId}</span>
    </span>
    <button type="button" class="qs-btn qs-btn-sm" onclick={signOut} data-testid="sign-out-button">Sign out</button>
  </div>
</header>

<aside class="sidebar">
  <div class="sidenav-section">Workspace</div>
  <a class="sidenav-item" class:active={active === 'overview'} href="/app">
    Overview
  </a>
  <a class="sidenav-item" class:active={active === 'scan'} href="/app">
    Scans
    <span class="count">{scanCount}</span>
  </a>
  {#if reportHref}
    <a class="sidenav-item" class:active={active === 'findings'} href={reportHref}>
      Findings
      <span class="count">{findingsCount > 0 ? findingsCount : ''}</span>
    </a>
    <a class="sidenav-item" class:active={active === 'report'} href={reportHref}>
      Report
    </a>
  {:else}
    <span class="sidenav-item" aria-disabled="true" title="Run a scan first to see findings">
      Findings
    </span>
    <span class="sidenav-item" aria-disabled="true" title="Run a scan first to see the report">
      Report
    </span>
  {/if}

  <div class="sidenav-section">Trust</div>
  <a class="sidenav-item" class:active={active === 'security'} href="/security">
    Security
  </a>
  <a class="sidenav-item" href="/install">
    Install
  </a>

  <div class="sidenav-section">Identity</div>
  <div class="sidenav-item" style="cursor:default;">
    <span style="font-family:var(--mono);font-size:11px;color:var(--muted);">{session.org.username ?? session.org.userId}</span>
  </div>
  {#if session.mock}
    <div class="sidenav-item" style="cursor:default;">
      <span style="font-family:var(--mono);font-size:10.5px;color:var(--warn);">dev-mock session</span>
    </div>
  {/if}
</aside>
