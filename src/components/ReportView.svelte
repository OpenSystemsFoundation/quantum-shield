<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSession, type Session } from '@lib/auth';
  import { getReport } from '@lib/persistence/db';
  import { renderReportPdf, buildCbomJson, buildVexJson, buildFindingsCsv } from '@lib/pdf';
  import type { Category, CategoryCoverage, CoverageStatus, Finding, Report, Severity } from '@lib/pdf';
  import AppChrome from './AppChrome.svelte';
  import FindingDrawer from './FindingDrawer.svelte';
  import { SAMPLE_BANNER_TEXT, SAMPLE_SCAN_ID, SAMPLE_SESSION, buildSampleReport } from '@lib/demo/sample';

  interface Props {
    /**
     * Public sample-report mode (/demo): render a report built in memory from
     * the bundled fixtures. No session is read or created and nothing is
     * loaded from or written to IndexedDB.
     */
    demo?: boolean;
  }
  const { demo = false }: Props = $props();

  const initialScanId = (() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('id');
    if (fromQuery) return fromQuery;
    const fromHash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
    return fromHash;
  })();
  const scanId = demo ? SAMPLE_SCAN_ID : initialScanId;

  let session = $state<Session | null>(null);
  let report = $state<Report | null>(null);
  let loaded = $state(false);
  let selectedId = $state<string | null>(null);
  let sort = $state<'deadline' | 'severity'>('deadline');
  let query = $state('');
  let hndlOnly = $state(false);
  let sevFilter = $state<Record<Severity, boolean>>({ critical: true, high: true, medium: true, low: true });
  let postureFilter = $state<Record<string, boolean>>({
    'replace-now': true,
    'plan-2030': true,
    'prepare-2033': true,
    advisory: true,
  });
  let categoryFilter = $state<Record<string, boolean>>({});
  let drawerHeight = $state(360);

  const SEV_CLASS: Record<Severity, string> = {
    critical: 'crit',
    high: 'high',
    medium: 'med',
    low: 'low',
  };

  const POSTURE_LABELS: Record<string, string> = {
    'replace-now': 'Replace now',
    'plan-2030': 'Plan for 2030',
    'prepare-2033': 'Prepare for 2033',
    advisory: 'Advisory',
  };

  const CATEGORY_LABELS: Record<Category, string> = {
    certificates: 'Certificates',
    'connected-apps': 'Connected Apps',
    'named-credentials': 'Named Credentials',
    'remote-sites': 'Remote Sites',
    sso: 'SSO',
    'shield-encryption': 'Shield',
    'apex-crypto': 'Apex',
    'session-login': 'Session',
    packages: 'Packages',
  };

  const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
    scanned: 'scanned',
    partial: 'partially scanned',
    failed: 'not scanned',
    skipped: 'skipped',
  };

  onMount(async () => {
    let loadedReport: Report | null = null;
    if (demo) {
      session = SAMPLE_SESSION;
      loadedReport = await buildSampleReport();
    } else {
      const s = loadSession();
      if (!s) {
        window.location.replace('/connect');
        return;
      }
      session = s;
      loadedReport = (await getReport(scanId))?.report ?? null;
    }
    if (loadedReport) {
      report = loadedReport;
      const cats = new Set(loadedReport.findings.map((f) => f.category));
      const init: Record<string, boolean> = {};
      for (const c of cats) init[c] = true;
      categoryFilter = init;
    }
    loaded = true;
  });

  function toggleSelect(id: string) {
    selectedId = selectedId === id ? null : id;
  }

  // The drawer is fixed to the bottom of the viewport; a row that sits
  // behind it can neither be read nor clicked again to toggle. Whenever the
  // selection changes, scroll the selected row up into the uncovered area.
  $effect(() => {
    if (!selectedId) return;
    requestAnimationFrame(() => {
      const row = document.querySelector('tr.selected');
      if (!row) return;
      const rect = row.getBoundingClientRect();
      const uncovered = window.innerHeight - drawerHeight - 24;
      if (rect.bottom > uncovered || rect.top < 0) {
        // Centre the row in the area the drawer does not cover.
        window.scrollBy({ top: rect.top - Math.max(uncovered - rect.height, 0) / 2, behavior: 'instant' as ScrollBehavior });
      }
    });
  });

  /**
   * Mouse convenience: clicking anywhere on a row toggles it. The <button> in
   * the finding cell is the real, keyboard-reachable control; its own click
   * is handled there, so ignore it here to avoid toggling twice.
   */
  function onRowClick(e: MouseEvent, id: string) {
    if ((e.target as HTMLElement).closest('button, a')) return;
    toggleSelect(id);
  }

  /** Finding ids are `<rule id>:<asset…>`; the rule id is the readable part. */
  function ruleIdOf(f: Finding): string {
    return f.id.split(':')[0] ?? f.id;
  }

  function deadlineText(f: Finding): string {
    if (f.deadline) return f.deadline;
    return f.migrationPosture === 'replace-now' ? 'As soon as possible' : 'No fixed deadline';
  }

  const coverageIssues = $derived.by<CategoryCoverage[]>(() => {
    if (!report) return [];
    // Reports persisted before the coverage contract may lack the field.
    const coverage: CategoryCoverage[] | undefined = report.coverage;
    return (coverage ?? []).filter((c) => c.status !== 'scanned');
  });

  const filteredFindings = $derived.by<Finding[]>(() => {
    if (!report) return [];
    return report.findings
      .filter((f) => {
        if (!sevFilter[f.severity]) return false;
        if (!postureFilter[f.migrationPosture]) return false;
        if (hndlOnly && !f.hndlExposure) return false;
        const catEnabled = categoryFilter[f.category];
        if (catEnabled === false) return false;
        if (query) {
          const q = query.toLowerCase();
          if (!(
            f.title.toLowerCase().includes(q) ||
            f.asset.name.toLowerCase().includes(q) ||
            f.id.toLowerCase().includes(q) ||
            f.currentCrypto.toLowerCase().includes(q)
          )) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'deadline') {
          const da = a.deadline ?? '9999';
          const db = b.deadline ?? '9999';
          if (da !== db) return da.localeCompare(db);
        }
        const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return rank[a.severity] - rank[b.severity];
      });
  });

  const selected = $derived.by<Finding | null>(() => {
    if (!report || !selectedId) return null;
    return report.findings.find((f) => f.id === selectedId) ?? null;
  });

  function sevCount(s: Severity): number {
    if (!report) return 0;
    return report.findings.filter((f) => f.severity === s).length;
  }

  function postureCount(p: string): number {
    if (!report) return 0;
    return report.findings.filter((f) => f.migrationPosture === p).length;
  }

  function catCount(c: string): number {
    if (!report) return 0;
    return report.findings.filter((f) => f.category === c).length;
  }

  const hndlCount = $derived(report?.findings.filter((f) => f.hndlExposure).length ?? 0);

  // Exports of the sample are named as such so they are never mistaken for a real scan.
  const filePrefix = demo ? 'SAMPLE-' : '';

  async function downloadPdf() {
    if (!report) return;
    const bytes = await renderReportPdf(report);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    triggerDownload(blob, `quantum-shield-${filePrefix}${safeName(report.org.orgName)}.pdf`);
  }

  function downloadCbom() {
    if (!report) return;
    const json = buildCbomJson(report);
    triggerDownload(new Blob([json], { type: 'application/json' }), `quantum-shield-${filePrefix}cbom.json`);
  }

  function downloadVex() {
    if (!report) return;
    const json = buildVexJson(report);
    triggerDownload(new Blob([json], { type: 'application/json' }), `quantum-shield-${filePrefix}vex.json`);
  }

  function downloadRawJson() {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    triggerDownload(new Blob([json], { type: 'application/json' }), `quantum-shield-${filePrefix}${safeName(report.org.orgName)}.report.json`);
  }

  function downloadCsv() {
    if (!report) return;
    const csv = buildFindingsCsv(report);
    triggerDownload(new Blob([csv], { type: 'text/csv' }), `quantum-shield-${filePrefix}findings.csv`);
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeName(s: string): string {
    return s.replace(/\W+/g, '_');
  }

  function resetSev() {
    sevFilter = { critical: true, high: true, medium: true, low: true };
  }

  function resetAllFilters() {
    resetSev();
    postureFilter = {
      'replace-now': true,
      'plan-2030': true,
      'prepare-2033': true,
      advisory: true,
    };
    hndlOnly = false;
    query = '';
    const init: Record<string, boolean> = {};
    for (const key of Object.keys(categoryFilter)) init[key] = true;
    categoryFilter = init;
  }
</script>

{#if session && loaded}
  <div class="app-frame" class:is-demo={demo}>
    <AppChrome
      session={session}
      active="findings"
      crumb={demo ? 'Sample report' : 'Findings'}
      findingsCount={report?.findings.length ?? 0}
      latestReportScanId={report ? scanId : null}
      demo={demo}
    />

    <main style="min-width:0;">
      {#if !report}
        <div class="narrow">
          <h2>Report not found</h2>
          <p class="sub">This scan may have been cleared, or the scan is still running.</p>
          <a href="/app" class="qs-btn qs-btn-primary">Back to app</a>
        </div>
      {:else}
        <div class="findings-layout">
          <aside class="qs-card findings-filters">
            <div class="filter-group">
              <h5>
                Severity
                <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" style="padding:0 4px;font-size:10.5px;" onclick={resetSev}>reset</button>
              </h5>
              {#each (['critical', 'high', 'medium', 'low'] as const) as s}
                <label>
                  <input type="checkbox" bind:checked={sevFilter[s]} />
                  <span class={`pill ${SEV_CLASS[s]}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span class="ct">{sevCount(s)}</span>
                </label>
              {/each}
            </div>

            <div class="filter-group">
              <h5>Migration posture</h5>
              {#each Object.entries(POSTURE_LABELS) as [key, label]}
                <label>
                  <input type="checkbox" bind:checked={postureFilter[key]} />
                  <span>{label}</span>
                  <span class="ct">{postureCount(key)}</span>
                </label>
              {/each}
            </div>

            <div class="filter-group">
              <h5>Category</h5>
              {#each Object.entries(CATEGORY_LABELS) as [key, label]}
                {#if catCount(key) > 0}
                  <label>
                    <input type="checkbox" bind:checked={categoryFilter[key]} />
                    <span>{label}</span>
                    <span class="ct">{catCount(key)}</span>
                  </label>
                {/if}
              {/each}
            </div>

            <div class="filter-group">
              <h5>Flags</h5>
              <label>
                <input type="checkbox" bind:checked={hndlOnly} />
                <span class="pill hndl">HNDL</span>
                <span style="font-size:11.5px;">Harvest-Now-Decrypt-Later</span>
              </label>
            </div>
          </aside>

          <div class="findings-main">
            {#if coverageIssues.length > 0}
              <div class="coverage-note" role="status" data-testid="coverage-banner">
                <strong>
                  Partial scan coverage — {coverageIssues.length}
                  {coverageIssues.length === 1 ? 'category was' : 'categories were'} not fully scanned.
                </strong>
                <ul>
                  {#each coverageIssues as c (c.id)}
                    <li>
                      <strong>{c.label}</strong>
                      · <span class="status-word">{COVERAGE_STATUS_LABELS[c.status]}</span>{c.detail ? ` — ${c.detail}` : ''}
                    </li>
                  {/each}
                </ul>
                <p>
                  Zero findings in these categories does not mean they are clean — they were not (fully)
                  scanned, so their state is unverified.
                </p>
              </div>
            {/if}

            <div class="finding-summary">
              <div>
                <div class="n crit-n">{sevCount('critical')}</div>
                <div class="lbl">Critical</div>
                <div class="sub">Already non-compliant</div>
              </div>
              <div>
                <div class="n high-n">{sevCount('high')}</div>
                <div class="lbl">High</div>
                <div class="sub">Deadline &lt; 4 years</div>
              </div>
              <div>
                <div class="n med-n">{sevCount('medium')}</div>
                <div class="lbl">Medium</div>
                <div class="sub">Advisory / 2030 window</div>
              </div>
              <div>
                <div class="n hndl-n">{hndlCount}</div>
                <div class="lbl">HNDL flagged</div>
                <div class="sub">Long-retention data</div>
              </div>
              <div>
                <div class="n">{filteredFindings.length}</div>
                <div class="lbl">Shown</div>
                <div class="sub" data-testid="filtered-count">of {report.findings.length} total</div>
              </div>
            </div>

            <div class="toolbar" id="export" style="scroll-margin-top:110px;">
              <input
                type="search"
                aria-label="Search findings"
                placeholder="Search by asset, algorithm, rule ID…"
                bind:value={query}
              />
              <div class="segment">
                <button type="button" class:active={sort === 'deadline'} aria-pressed={sort === 'deadline'} onclick={() => (sort = 'deadline')}>Sort · Deadline</button>
                <button type="button" class:active={sort === 'severity'} aria-pressed={sort === 'severity'} onclick={() => (sort = 'severity')}>Severity</button>
              </div>
              <div class="spacer"></div>
              <button type="button" class="qs-btn qs-btn-sm" onclick={downloadCsv}>CSV</button>
              <button type="button" class="qs-btn qs-btn-sm" onclick={downloadCbom}>CBOM JSON</button>
              <button type="button" class="qs-btn qs-btn-sm" onclick={downloadVex}>OpenVEX JSON</button>
              <button type="button" class="qs-btn qs-btn-sm" onclick={downloadRawJson}>Raw JSON</button>
              <button type="button" class="qs-btn qs-btn-sm qs-btn-primary" onclick={downloadPdf} data-testid="report-download-pdf">
                Download PDF
              </button>
            </div>

            <div class="findings-table">
              {#if report.findings.length === 0}
                <div class="empty-state" data-testid="empty-no-findings">
                  <div class="empty-title">No findings</div>
                  <p>
                    This scan raised no findings{coverageIssues.length > 0
                      ? ' in the categories that were scanned'
                      : ''} — the cryptographic configuration we inspected meets the current recommendations.
                  </p>
                  {#if coverageIssues.length > 0}
                    <p>
                      Caveat: {coverageIssues.length}
                      {coverageIssues.length === 1 ? 'category was' : 'categories were'} not fully scanned
                      (see the coverage notice above), so this is not a complete all-clear.
                    </p>
                  {/if}
                </div>
              {:else if filteredFindings.length === 0}
                <div class="empty-state" data-testid="empty-filtered">
                  <p>No findings match the current filters.</p>
                  <button type="button" class="qs-btn qs-btn-sm" onclick={resetAllFilters} data-testid="reset-filters">
                    Reset filters
                  </button>
                </div>
              {:else}
              <table class="tbl" data-testid="findings-list">
                <caption class="sr-only">Findings — activate a finding's title to open its detail</caption>
                <thead>
                  <tr>
                    <th scope="col">Finding</th>
                    <th scope="col" style="width:120px;">Category</th>
                    <th scope="col" style="width:100px;">Severity</th>
                    <th scope="col" style="width:150px;">Status / Deadline</th>
                    <th scope="col" style="width:64px;">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredFindings as f (f.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                    <tr
                      class:selected={selected?.id === f.id}
                      onclick={(e) => onRowClick(e, f.id)}
                      style="cursor:pointer;"
                    >
                      <td class="finding-cell">
                        <button
                          type="button"
                          class="row-open"
                          aria-haspopup="dialog"
                          aria-expanded={selected?.id === f.id}
                          onclick={() => toggleSelect(f.id)}
                          data-testid="finding-open"
                        >{f.title}</button>
                        <div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere;">
                          {f.asset.name} · {ruleIdOf(f)}
                        </div>
                      </td>
                      <td>
                        <span class="tag">{CATEGORY_LABELS[f.category]}</span>
                      </td>
                      <td><span class={`pill ${SEV_CLASS[f.severity]}`}>{f.severity}</span></td>
                      <td class="deadline-cell">
                        <div class="mono" style="font-size:11px;color:var(--ink-2);">{POSTURE_LABELS[f.migrationPosture]}</div>
                        <div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;">{deadlineText(f)}</div>
                      </td>
                      <td>{#if f.hndlExposure}<span class="pill hndl">HNDL</span>{/if}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {/if}
            </div>

          </div>
        </div>

        <FindingDrawer finding={selected} onClose={() => (selectedId = null)} bind:height={drawerHeight} sampleLabel={demo ? SAMPLE_BANNER_TEXT : undefined} />

        {#if selected}
          <div style={`height:${drawerHeight + 20}px;`}></div>
        {/if}
      {/if}
    </main>
  </div>
{/if}
