<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { loadSession, type Session } from '@lib/auth';
  import { startScan, disposeWorker } from '@lib/scan/client';
  import type { ScanEvent } from '@lib/scan/types';
  import { saveScanSummary, saveReport, getScan, getScansForOrg } from '@lib/persistence/db';
  import type { Category, CategoryCoverage, Finding, Report } from '@lib/pdf';
  import AppChrome from './AppChrome.svelte';

  const initialScanId = (() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('id');
    if (fromQuery) return fromQuery;
    const fromHash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
    return fromHash;
  })();
  const scanId = initialScanId;

  let session = $state<Session | null>(null);
  let status = $state<'booting' | 'running' | 'complete' | 'failed' | 'cors' | 'auth' | 'interrupted'>('booting');
  let errorMessage = $state<string | null>(null);
  let startedAt = $state<string>('');
  let coverageIssues = $state<CategoryCoverage[]>([]);
  let latestReportScanId = $state<string | null>(null);

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
  let log = $state<Array<{ t: string; kind: 'ok' | 'warn' | 'err' | 'info'; msg: string }>>([]);

  function pushLog(kind: 'ok' | 'warn' | 'err' | 'info', msg: string) {
    const t = new Date();
    log = [
      ...log,
      {
        t: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`,
        kind,
        msg,
      },
    ];
  }

  onMount(async () => {
    const s = loadSession();
    if (!s) {
      window.location.replace('/connect');
      return;
    }
    session = s;

    try {
      const prior = await getScansForOrg(s.org.orgId);
      latestReportScanId = prior.find((x) => x.status === 'completed')?.scanId ?? null;
    } catch {
      /* nav aid only; ignore */
    }

    // Never restart a scan whose id already has a persisted summary: opening
    // an old scan from history must show its recorded state, not re-run it.
    const existing = await getScan(scanId);
    if (existing) {
      startedAt = existing.startedAt;
      if (existing.status === 'completed') {
        window.location.replace(`/app/report/?id=${encodeURIComponent(scanId)}`);
        return;
      }
      if (existing.status === 'failed') {
        status = 'failed';
        errorMessage = existing.error ?? 'This scan failed. Start a new scan from the overview.';
        return;
      }
      // Persisted as 'running' but no scan is live in this page — the tab was
      // closed or reloaded mid-scan. Treat it as interrupted, do not re-run.
      status = 'interrupted';
      return;
    }

    startedAt = new Date().toISOString();
    pushLog('info', `scan ${scanId} starting · org ${s.org.orgId}${s.mock ? ' · mock mode' : ''}`);

    await saveScanSummary({
      scanId,
      orgId: s.org.orgId,
      orgName: s.org.orgName ?? s.org.orgId,
      instanceUrl: s.instanceUrl,
      startedAt,
      status: 'running',
    });

    status = 'running';
    const regions = (() => {
      try {
        const url = new URL(window.location.href);
        const raw = url.searchParams.get('regions');
        if (raw) return raw.split(',').map((x) => x.trim()).filter(Boolean);
        const stored = localStorage.getItem('qs:regions');
        return stored ? (JSON.parse(stored) as string[]) : [];
      } catch {
        return [];
      }
    })();
    if (regions.length > 0) pushLog('info', `region filter: ${regions.join(', ')}`);
    try {
      const report = await startScan(
        { scanId, session: s, overlays: ['gdpr', 'nis2', 'dora'], regions, mock: s.mock === true },
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
      pushLog('err', errorMessage);
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

  onDestroy(() => disposeWorker());

  function handleEvent(event: ScanEvent) {
    switch (event.type) {
      case 'started':
        categories = event.categories.map((c) => ({
          category: c,
          label: labelForCategory(c),
          state: 'pending',
          assetCount: 0,
          findingsCount: 0,
        }));
        break;
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
        if (p.status === 'running') pushLog('info', `scanning ${p.label}…`);
        if (p.status === 'completed') pushLog('ok', `${p.label} · ${p.assetCount ?? 0} assets`);
        if (p.status === 'failed') pushLog('warn', `${p.label} · ${p.error ?? 'failed'}`);
        break;
      }
      case 'asset':
        assetCount += 1;
        break;
      case 'finding': {
        findings = [...findings, event.finding];
        categories = categories.map((row) =>
          row.category === event.finding.category
            ? { ...row, findingsCount: row.findingsCount + 1 }
            : row,
        );
        break;
      }
      case 'failed':
        if (event.kind === 'cors') status = 'cors';
        else if (event.kind === 'auth') status = 'auth';
        else status = 'failed';
        errorMessage = event.error;
        pushLog('err', event.error);
        break;
      case 'log':
        pushLog(event.level === 'info' ? 'info' : event.level === 'warn' ? 'warn' : 'err', event.message);
        break;
    }
  }

  async function finalise(report: Report) {
    if (!session) return;
    status = 'complete';
    const coverage: CategoryCoverage[] | undefined = report.coverage;
    coverageIssues = (coverage ?? []).filter((c) => c.status !== 'scanned');
    pushLog('ok', `scan complete · ${report.summary.totalFindings} findings`);
    for (const c of coverageIssues) {
      pushLog('warn', `${c.label} · ${c.status}${c.detail ? ` — ${c.detail}` : ''}`);
    }
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
    latestReportScanId = scanId;
    // Leave partial-coverage warnings on screen long enough to be read.
    const delay = coverageIssues.length > 0 ? 2400 : 800;
    setTimeout(() => window.location.assign(`/app/report/?id=${encodeURIComponent(scanId)}`), delay);
  }

  function labelForCategory(c: Category): string {
    switch (c) {
      case 'certificates': return 'Certificates & keys';
      case 'connected-apps': return 'Connected Apps';
      case 'named-credentials': return 'Named & External Credentials';
      case 'remote-sites': return 'Remote Sites & External Data';
      case 'sso': return 'Single Sign-On';
      case 'shield-encryption': return 'Shield Platform Encryption';
      case 'apex-crypto': return 'Apex cryptographic calls';
      case 'session-login': return 'Session & login settings';
      case 'packages': return 'Managed packages';
    }
  }

  const completedCount = $derived(categories.filter((c) => c.state === 'completed').length);
  const overallPct = $derived(categories.length === 0 ? 0 : Math.round((completedCount / categories.length) * 100));
</script>

{#if session}
  <div class="app-frame">
    <AppChrome session={session} active="scan" crumb={`Scan ${scanId.slice(0, 14)}…`} latestReportScanId={latestReportScanId} />

    <main class="app-main">
      {#if status === 'cors'}
        <div class="cors-panel" data-testid="cors-panel">
          <div class="head">
            <div class="ico">!</div>
            <div>
              <h4>One-time setup required</h4>
              <p class="sub">Browser mode only: this Salesforce org has not yet whitelisted QuantumShield's origin.</p>
            </div>
          </div>
          <p style="margin:12px 0 0;font-size:12.5px;color:var(--ink-2);">
            Open <span class="mono" style="color:var(--ink)">Setup → CORS</span> and add this origin to the Allowed Origins List:
          </p>
          <div class="mono-field" style="margin-top:10px;">
            <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code>
            <button type="button" onclick={() => navigator.clipboard.writeText(window.location.origin)}>Copy</button>
          </div>
          <div style="margin-top:16px;display:flex;gap:10px;">
            <button type="button" class="qs-btn qs-btn-primary" onclick={() => window.location.reload()}>Test again</button>
            <a href="/install#cors" class="qs-btn">Browser guide</a>
          </div>
        </div>
      {:else if status === 'auth'}
        <div class="qs-card">
          <div class="qs-card-body">
            <h2 class="display" style="font-size:22px;font-weight:500;margin:0;">Session expired</h2>
            <p style="margin-top:8px;color:var(--ink-3);font-size:13px;">{errorMessage ?? 'Your Salesforce session is no longer valid.'}</p>
            <a href="/connect" class="qs-btn qs-btn-primary" style="margin-top:14px;">Reconnect</a>
          </div>
        </div>
      {:else if status === 'failed'}
        <div class="qs-card">
          <div class="qs-card-body">
            <h2 class="display" style="font-size:22px;font-weight:500;margin:0;">Scan failed</h2>
            <p style="margin-top:8px;color:var(--ink-3);font-size:13px;">{errorMessage ?? 'Unknown error.'}</p>
            <a href="/app" class="qs-btn qs-btn-primary" style="margin-top:14px;">Back to app</a>
          </div>
        </div>
      {:else if status === 'interrupted'}
        <div class="qs-card" data-testid="scan-interrupted">
          <div class="qs-card-body">
            <h2 class="display" style="font-size:22px;font-weight:500;margin:0;">Scan interrupted</h2>
            <p style="margin-top:8px;color:var(--ink-3);font-size:13px;">
              This scan started{startedAt ? ` at ${startedAt.slice(0, 10)} ${startedAt.slice(11, 19)}` : ''} but never
              finished — most likely the tab was closed mid-scan. Its results are incomplete and it will not be
              re-run automatically. Start a new scan from the overview.
            </p>
            <a href="/app" class="qs-btn qs-btn-primary" style="margin-top:14px;">Back to app</a>
          </div>
        </div>
      {:else}
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div>
            <div class="tiny-caps" style="color:var(--navy-600);">{status === 'complete' ? 'Complete' : 'Running scan'}</div>
            <h1 class="display" style="font-size:28px;font-weight:500;letter-spacing:-0.01em;margin:4px 0 0;">
              {session.org.orgName ?? 'Scanning org'}
            </h1>
            <p style="margin:4px 0 0;color:var(--muted);font-size:12px;font-family:var(--mono);">
              started {startedAt.slice(11, 19)} · {overallPct}% complete
            </p>
          </div>
          <div style="display:flex;gap:14px;align-items:baseline;">
            <div>
              <div class="display" style="font-size:28px;font-weight:500;letter-spacing:-0.01em;line-height:1;" data-testid="scan-asset-count">{assetCount}</div>
              <div class="tiny-caps" style="margin-top:4px;">Assets</div>
            </div>
            <div>
              <div class="display" style="font-size:28px;font-weight:500;letter-spacing:-0.01em;line-height:1;color:var(--navy-600);" data-testid="scan-finding-count">{findings.length}</div>
              <div class="tiny-caps" style="margin-top:4px;">Findings</div>
            </div>
          </div>
        </div>

        {#if status === 'complete' && coverageIssues.length > 0}
          <div class="coverage-note" role="status" data-testid="scan-coverage-note" style="margin-top:14px;margin-bottom:0;">
            <strong>
              Scan complete — {coverageIssues.length}
              {coverageIssues.length === 1 ? 'category' : 'categories'} could not be fully scanned.
            </strong>
            Zero findings in {coverageIssues.length === 1 ? 'that category' : 'those categories'} does not mean
            {coverageIssues.length === 1 ? 'it is' : 'they are'} clean. Details follow in the report.
          </div>
        {/if}

        <section class="app-cols" style="margin-top:22px;">
          <div style="display:grid;gap:8px;">
            {#each categories as row (row.category)}
              {@const pct = row.state === 'completed' || row.state === 'skipped' ? 100 : row.state === 'running' ? 45 : row.state === 'failed' ? 100 : 0}
              <div
                class="scan-row"
                class:running={row.state === 'running'}
                class:done={row.state === 'completed'}
                class:failed={row.state === 'failed'}
                data-testid={`scanner-row-${row.category}`}
              >
                <div class="cat">{row.label}</div>
                <div class="bar"><i style="width:{pct}%;"></i></div>
                <div class="pct">{row.assetCount} assets</div>
                <div class="state">
                  {#if row.state === 'running'}<span class="pulse-dot" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>{/if}
                  {row.state}
                </div>
              </div>
            {/each}
          </div>

          <div class="qs-card" style="overflow:hidden;">
            <div class="qs-card-head">
              <h3>Log</h3>
              <span class="tiny-caps" style="margin-left:auto;">{log.length} events</span>
            </div>
            <div class="stream">
              {#each log as entry, i (i)}
                <div>
                  <span class="t">{entry.t}</span>
                  <span class={entry.kind}>{entry.msg}</span>
                </div>
              {/each}
              {#if status === 'running'}
                <div><span class="t">·</span><span class="blink">…</span></div>
              {/if}
            </div>
          </div>
        </section>
      {/if}
    </main>
  </div>
{/if}
