<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { loadSession, type Session } from '@lib/auth';
  import { startScan, disposeWorker } from '@lib/scan/client';
  import type { ScanEvent } from '@lib/scan/types';
  import { saveScanSummary, saveReport } from '@lib/persistence/db';
  import type { Category, Finding, Report } from '@lib/pdf';

  const { scanId } = $props<{ scanId: string }>();

  let session = $state<Session | null>(null);
  let status = $state<'booting' | 'running' | 'complete' | 'failed' | 'cors' | 'auth'>('booting');
  let errorMessage = $state<string | null>(null);
  let startedAt = $state<string>('');

  interface CatRow {
    category: Category;
    label: string;
    state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    assetCount: number;
    findingsCount: number;
    error?: string;
  }

  let categories = $state<CatRow[]>([]);
  let assetCount = $state(0);
  let findings = $state<Finding[]>([]);

  onMount(async () => {
    const s = loadSession();
    if (!s) {
      window.location.replace('/connect');
      return;
    }
    session = s;
    startedAt = new Date().toISOString();

    await saveScanSummary({
      scanId,
      orgId: s.org.orgId,
      orgName: s.org.orgName ?? s.org.orgId,
      instanceUrl: s.instanceUrl,
      startedAt,
      status: 'running',
    });

    status = 'running';
    try {
      const report = await startScan(
        {
          scanId,
          session: s,
          overlays: ['gdpr', 'nis2', 'dora'],
          mock: s.mock === true,
        },
        handleEvent,
      );
      await finalise(report);
    } catch (err) {
      if (status === 'cors' || status === 'auth') {
        await saveScanSummary({
          scanId,
          orgId: s.org.orgId,
          orgName: s.org.orgName ?? s.org.orgId,
          instanceUrl: s.instanceUrl,
          startedAt,
          status: 'failed',
          error: errorMessage ?? String(err),
        });
        return;
      }
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
      await saveScanSummary({
        scanId,
        orgId: s.org.orgId,
        orgName: s.org.orgName ?? s.org.orgId,
        instanceUrl: s.instanceUrl,
        startedAt,
        status: 'failed',
        error: errorMessage,
      });
    }
  });

  onDestroy(() => {
    disposeWorker();
  });

  function handleEvent(event: ScanEvent) {
    switch (event.type) {
      case 'started': {
        categories = event.categories.map((c) => ({
          category: c,
          label: labelForCategory(c),
          state: 'pending',
          assetCount: 0,
          findingsCount: 0,
        }));
        break;
      }
      case 'scanner-progress': {
        const p = event.progress;
        categories = categories.map((row) =>
          row.category === p.category
            ? {
                ...row,
                state:
                  p.status === 'pending'
                    ? 'pending'
                    : p.status === 'running'
                      ? 'running'
                      : p.status === 'completed'
                        ? 'completed'
                        : p.status === 'failed'
                          ? 'failed'
                          : 'skipped',
                assetCount: p.assetCount ?? row.assetCount,
                error: p.error ?? row.error,
              }
            : row,
        );
        break;
      }
      case 'asset': {
        assetCount += 1;
        break;
      }
      case 'finding': {
        findings = [...findings, event.finding];
        categories = categories.map((row) =>
          row.category === event.finding.category
            ? { ...row, findingsCount: row.findingsCount + 1 }
            : row,
        );
        break;
      }
      case 'failed': {
        if (event.kind === 'cors') status = 'cors';
        else if (event.kind === 'auth') status = 'auth';
        else status = 'failed';
        errorMessage = event.error;
        break;
      }
      case 'log':
      case 'completed':
        break;
    }
  }

  async function finalise(report: Report) {
    if (!session) return;
    status = 'complete';
    await saveReport({
      scanId,
      orgId: session.org.orgId,
      savedAt: new Date().toISOString(),
      report,
    });
    await saveScanSummary({
      scanId,
      orgId: session.org.orgId,
      orgName: session.org.orgName ?? session.org.orgId,
      instanceUrl: session.instanceUrl,
      startedAt,
      finishedAt: report.scanFinishedAt,
      totalFindings: report.summary.totalFindings,
      severityCounts: report.summary.bySeverity,
      status: 'completed',
    });
    setTimeout(() => {
      window.location.assign(`/app/report/${scanId}`);
    }, 600);
  }

  function labelForCategory(c: Category): string {
    switch (c) {
      case 'certificates':
        return 'Certificates & keys';
      case 'connected-apps':
        return 'Connected Apps';
      case 'named-credentials':
        return 'Named & External Credentials';
      case 'remote-sites':
        return 'Remote Sites & External Data';
      case 'sso':
        return 'Single Sign-On';
      case 'shield-encryption':
        return 'Shield Platform Encryption';
      case 'apex-crypto':
        return 'Apex cryptographic calls';
      case 'session-login':
        return 'Session & login settings';
      case 'packages':
        return 'Managed packages';
    }
  }

  function stateIcon(state: CatRow['state']): string {
    switch (state) {
      case 'pending':
        return '○';
      case 'running':
        return '●';
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'skipped':
        return '—';
    }
  }
</script>

<div class="min-h-screen bg-surface">
  <header class="border-b border-gray-200 bg-white">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
      <a href="/app" class="font-bold text-ink">QuantumShield</a>
      <span class="text-xs uppercase tracking-wider text-ink-soft">Scan {scanId}</span>
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-6 py-10">
    {#if status === 'cors'}
      <section class="rounded-xl border border-severity-high bg-white p-6 shadow-sm" data-testid="cors-panel">
        <p class="text-xs font-semibold uppercase tracking-widest text-severity-high">One-time setup required</p>
        <h2 class="mt-1 text-2xl font-bold">Your Salesforce org needs to whitelist our domain</h2>
        <p class="mt-3 text-sm text-ink-soft">
          The browser could not reach your org's API. This happens when QuantumShield's domain has not yet been added to your Salesforce CORS allowlist.
        </p>
        <p class="mt-2 text-sm text-ink-soft">
          Open <span class="font-mono text-ink">Setup → CORS</span> in your org and add this origin:
        </p>
        <code class="mt-3 inline-block rounded bg-surface-muted px-3 py-1.5 font-mono text-sm">{window.location.origin}</code>
        <div class="mt-4 flex gap-3">
          <button type="button" class="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" onclick={() => window.location.reload()}>
            Test again
          </button>
          <a href="/install" class="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold">Full setup guide</a>
        </div>
      </section>
    {:else if status === 'auth'}
      <section class="rounded-xl border border-severity-critical bg-white p-6 shadow-sm">
        <h2 class="text-2xl font-bold">Session expired</h2>
        <p class="mt-2 text-sm text-ink-soft">{errorMessage ?? 'Your Salesforce session is no longer valid.'}</p>
        <a href="/connect" class="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
          Reconnect
        </a>
      </section>
    {:else if status === 'failed'}
      <section class="rounded-xl border border-severity-critical bg-white p-6 shadow-sm">
        <h2 class="text-2xl font-bold">Scan failed</h2>
        <p class="mt-2 text-sm text-ink-soft">{errorMessage ?? 'Unknown error.'}</p>
        <a href="/app" class="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
          Back to app
        </a>
      </section>
    {:else}
      <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-accent">
              {#if status === 'complete'}Complete{:else}Scanning{/if}
            </p>
            <h1 class="mt-1 text-2xl font-bold">
              {session?.org.orgName ?? 'Scanning org'}
            </h1>
            <p class="mt-1 text-xs text-ink-soft">Started {startedAt.slice(11, 19)}</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-bold" data-testid="scan-asset-count">{assetCount}</p>
            <p class="text-xs text-ink-soft">assets discovered</p>
            <p class="mt-2 text-2xl font-bold" data-testid="scan-finding-count">{findings.length}</p>
            <p class="text-xs text-ink-soft">findings so far</p>
          </div>
        </div>

        <ul class="mt-6 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
          {#each categories as row (row.category)}
            <li class="flex items-center justify-between px-5 py-3 text-sm" data-testid={`scanner-row-${row.category}`}>
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  class:bg-accent={row.state === 'running'}
                  class:text-white={row.state === 'running' || row.state === 'completed'}
                  class:bg-severity-low={row.state === 'completed'}
                  class:bg-severity-critical={row.state === 'failed'}
                  class:bg-gray-200={row.state === 'pending' || row.state === 'skipped'}
                  class:text-ink-soft={row.state === 'pending' || row.state === 'skipped'}
                >{stateIcon(row.state)}</span>
                <span class="font-semibold">{row.label}</span>
              </div>
              <div class="text-xs text-ink-soft">
                {#if row.state === 'failed'}
                  <span class="text-severity-critical">{row.error}</span>
                {:else}
                  {row.assetCount} assets · {row.findingsCount} findings
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </main>
</div>
