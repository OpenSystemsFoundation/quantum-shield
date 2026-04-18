<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSession, type Session } from '@lib/auth';
  import { getReport } from '@lib/persistence/db';
  import { renderReportPdf, buildCbomJson, buildFindingsCsv } from '@lib/pdf';
  import type { Category, Finding, Report, Severity } from '@lib/pdf';
  import AppChrome from './AppChrome.svelte';

  const { scanId } = $props<{ scanId: string }>();

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

  onMount(async () => {
    const s = loadSession();
    if (!s) {
      window.location.replace('/connect');
      return;
    }
    session = s;
    const stored = await getReport(scanId);
    if (stored) {
      report = stored.report;
      const cats = new Set(stored.report.findings.map((f) => f.category));
      const init: Record<string, boolean> = {};
      for (const c of cats) init[c] = true;
      categoryFilter = init;
      selectedId = stored.report.findings[0]?.id ?? null;
    }
    loaded = true;
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
    if (!report) return null;
    const list = filteredFindings;
    if (list.length === 0) return null;
    const match = list.find((f) => f.id === selectedId);
    return match ?? list[0];
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

  async function downloadPdf() {
    if (!report) return;
    const bytes = await renderReportPdf(report);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    triggerDownload(blob, `quantum-shield-${safeName(report.org.orgName)}.pdf`);
  }

  function downloadCbom() {
    if (!report) return;
    const json = buildCbomJson(report);
    triggerDownload(new Blob([json], { type: 'application/json' }), 'quantum-shield-cbom.json');
  }

  function downloadCsv() {
    if (!report) return;
    const csv = buildFindingsCsv(report);
    triggerDownload(new Blob([csv], { type: 'text/csv' }), 'quantum-shield-findings.csv');
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
</script>

{#if session && loaded}
  <div class="app-frame">
    <AppChrome
      session={session}
      active="findings"
      crumb="Findings"
      findingsCount={report?.findings.length ?? 0}
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
          <aside class="qs-card" style="align-self:start;position:sticky;top:68px;">
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

            <div class="toolbar">
              <input
                type="search"
                placeholder="Search by asset, algorithm, rule ID…"
                bind:value={query}
              />
              <div class="segment">
                <button class:active={sort === 'deadline'} onclick={() => (sort = 'deadline')}>Sort · Deadline</button>
                <button class:active={sort === 'severity'} onclick={() => (sort = 'severity')}>Severity</button>
              </div>
              <div class="spacer"></div>
              <button type="button" class="qs-btn qs-btn-sm" onclick={downloadCsv}>CSV</button>
              <button type="button" class="qs-btn qs-btn-sm" onclick={downloadCbom}>CBOM JSON</button>
              <button type="button" class="qs-btn qs-btn-sm qs-btn-primary" onclick={downloadPdf} data-testid="report-download-pdf">
                Download PDF
              </button>
            </div>

            <div class="findings-table">
              <table class="tbl" data-testid="findings-list">
                <thead>
                  <tr>
                    <th style="width:110px;">ID</th>
                    <th>Finding</th>
                    <th style="width:120px;">Asset</th>
                    <th style="width:100px;">Severity</th>
                    <th style="width:160px;">Status / Deadline</th>
                    <th style="width:80px;">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredFindings as f (f.id)}
                    <tr
                      class:selected={selected?.id === f.id}
                      onclick={() => (selectedId = f.id)}
                      style="cursor:pointer;"
                    >
                      <td class="mono" style="color:var(--muted);font-size:11px;">{f.id.slice(0, 18)}</td>
                      <td>
                        <div style="font-weight:600;color:var(--ink);">{f.title}</div>
                        <div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;">{f.asset.name}</div>
                      </td>
                      <td>
                        <span class="tag">{CATEGORY_LABELS[f.category]}</span>
                      </td>
                      <td><span class={`pill ${SEV_CLASS[f.severity]}`}>{f.severity}</span></td>
                      <td>
                        <div class="mono" style="font-size:11px;color:var(--ink-2);">{POSTURE_LABELS[f.migrationPosture]}</div>
                        {#if f.deadline}
                          <div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;">{f.deadline}</div>
                        {/if}
                      </td>
                      <td>
                        {#if f.hndlExposure}<span class="pill hndl">HNDL</span>{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            {#if selected}
              <div class="detail-drawer">
                <div class="detail-head">
                  <div class="title-row">
                    <span class={`pill ${SEV_CLASS[selected.severity]}`}>{selected.severity}</span>
                    <span class="pill adv">{POSTURE_LABELS[selected.migrationPosture]}</span>
                    {#if selected.hndlExposure}<span class="pill hndl">HNDL</span>{/if}
                    <span class="tag">{CATEGORY_LABELS[selected.category]}</span>
                  </div>
                  <h3 style="margin-top:10px;">{selected.title}</h3>
                  <div class="meta">
                    {selected.id} · {selected.asset.name} · {selected.asset.identifier}
                  </div>
                </div>

                <div class="detail-grid">
                  <div class="detail-cell">
                    <h5>Current cryptography</h5>
                    <div class="big">{selected.currentCrypto}</div>
                  </div>
                  <div class="detail-cell">
                    <h5>Recommended replacement</h5>
                    <div style="font-size:12.5px;color:var(--ink-2);line-height:1.5;">{selected.recommendedReplacement}</div>
                  </div>
                  <div class="detail-cell" style="grid-column:1 / -1;border-right:none;">
                    <h5>Rationale</h5>
                    <div style="font-size:12.5px;color:var(--ink-3);line-height:1.55;">{selected.rationale}</div>
                  </div>
                  <div class="detail-cell" style="grid-column:1 / -1;border-right:none;border-bottom:none;">
                    <h5>Citations</h5>
                    <div style="display:grid;gap:8px;margin-top:4px;">
                      {#each selected.citations as c}
                        <a class="cite" href={c.retrievalUrl} target="_blank" rel="noopener">
                          <div style="flex:1;">
                            <div class="doc">{c.sourceId}{c.section ? ` · ${c.section}` : ''} · {c.jurisdiction} · v{c.documentVersion}</div>
                            <div class="quote">{c.title}</div>
                          </div>
                        </a>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </main>
  </div>
{/if}
