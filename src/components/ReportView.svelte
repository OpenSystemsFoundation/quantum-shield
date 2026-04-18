<script lang="ts">
  import { onMount } from 'svelte';
  import { getReport } from '@lib/persistence/db';
  import { renderReportPdf, buildCbomJson, buildFindingsCsv } from '@lib/pdf';
  import type { Finding, Report, Severity } from '@lib/pdf';

  const { scanId } = $props<{ scanId: string }>();

  let report = $state<Report | null>(null);
  let loaded = $state(false);
  let filterSeverity = $state<Severity | 'all'>('all');
  let filterCategory = $state<string>('all');
  let expanded = $state<Record<string, boolean>>({});

  onMount(async () => {
    const stored = await getReport(scanId);
    if (stored) report = stored.report;
    loaded = true;
  });

  const filtered = $derived.by<Finding[]>(() => {
    if (!report) return [];
    return report.findings.filter((f) => {
      if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
      if (filterCategory !== 'all' && f.category !== filterCategory) return false;
      return true;
    });
  });

  const categories = $derived(() => {
    if (!report) return [] as string[];
    return [...new Set(report.findings.map((f) => f.category))].sort();
  });

  function severityClass(sev: Severity): string {
    switch (sev) {
      case 'critical':
        return 'bg-severity-critical text-white';
      case 'high':
        return 'bg-severity-high text-white';
      case 'medium':
        return 'bg-severity-medium text-white';
      case 'low':
        return 'bg-severity-low text-white';
    }
  }

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
</script>

<div class="min-h-screen bg-surface">
  <header class="border-b border-gray-200 bg-white">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
      <a href="/app" class="font-bold text-ink">QuantumShield</a>
      <span class="text-xs uppercase tracking-wider text-ink-soft">Report {scanId}</span>
    </div>
  </header>

  {#if !loaded}
    <main class="mx-auto max-w-2xl px-6 py-24 text-center text-ink-soft">Loading…</main>
  {:else if !report}
    <main class="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 class="text-2xl font-bold">Report not found</h1>
      <p class="mt-2 text-sm text-ink-soft">This scan may have been cleared from local storage, or the scan is still running.</p>
      <a href="/app" class="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Back to app</a>
    </main>
  {:else}
    <main class="mx-auto max-w-6xl px-6 py-10">
      <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-accent">Report</p>
            <h1 class="mt-1 text-3xl font-bold">{report.org.orgName}</h1>
            <p class="mt-1 text-xs text-ink-soft">
              Scanned {report.scanFinishedAt.slice(0, 19).replace('T', ' ')} · {report.summary.totalFindings} findings
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft"
              onclick={downloadPdf}
              data-testid="report-download-pdf"
            >Download PDF</button>
            <button type="button" class="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold" onclick={downloadCbom}>CBOM JSON</button>
            <button type="button" class="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold" onclick={downloadCsv}>Findings CSV</button>
          </div>
        </div>

        <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {#each ['critical', 'high', 'medium', 'low'] as sev (sev)}
            <div class="rounded-lg border border-gray-200 p-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-ink-soft">{sev}</p>
              <p class="mt-1 text-2xl font-bold">{report.summary.bySeverity[sev as Severity] ?? 0}</p>
            </div>
          {/each}
        </div>
      </section>

      <section class="mt-8">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold uppercase tracking-wider text-ink-soft" for="filter-severity">Severity</label>
            <select
              id="filter-severity"
              class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              bind:value={filterSeverity}
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold uppercase tracking-wider text-ink-soft" for="filter-category">Category</label>
            <select
              id="filter-category"
              class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              bind:value={filterCategory}
            >
              <option value="all">All</option>
              {#each categories() as c}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </div>
          <p class="ml-auto text-xs text-ink-soft" data-testid="filtered-count">
            {filtered.length} of {report.findings.length} findings
          </p>
        </div>

        <ul class="mt-4 space-y-3" data-testid="findings-list">
          {#each filtered as f (f.id)}
            <li class="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                type="button"
                class="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-surface-muted"
                onclick={() => (expanded = { ...expanded, [f.id]: !expanded[f.id] })}
              >
                <div>
                  <div class="flex items-center gap-2">
                    <span class={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase ${severityClass(f.severity)}`}>{f.severity}</span>
                    {#if f.hndlExposure}
                      <span class="inline-flex items-center rounded bg-accent px-2 py-0.5 text-xs font-bold uppercase text-white">HNDL</span>
                    {/if}
                    <span class="text-xs text-ink-soft">{f.category}</span>
                  </div>
                  <p class="mt-1 font-semibold">{f.title}</p>
                  <p class="mt-1 text-xs text-ink-soft">{f.asset.name} — {f.asset.identifier}</p>
                </div>
                <div class="flex-shrink-0 text-right text-xs text-ink-soft">
                  <p>{f.deadline ?? '—'}</p>
                  <p class="mt-1">{expanded[f.id] ? '▾' : '▸'}</p>
                </div>
              </button>
              {#if expanded[f.id]}
                <div class="border-t border-gray-200 bg-surface-muted px-5 py-4 text-sm">
                  <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <dt class="text-xs font-semibold uppercase tracking-wider text-ink-soft">Current</dt>
                      <dd>{f.currentCrypto}</dd>
                    </div>
                    <div>
                      <dt class="text-xs font-semibold uppercase tracking-wider text-ink-soft">Replacement</dt>
                      <dd>{f.recommendedReplacement}</dd>
                    </div>
                  </dl>
                  <p class="mt-3 text-ink-soft">{f.rationale}</p>
                  <div class="mt-3">
                    <p class="text-xs font-semibold uppercase tracking-wider text-ink-soft">Sources</p>
                    <ul class="mt-1 space-y-1 text-xs text-ink-soft">
                      {#each f.citations as c}
                        <li>
                          <a href={c.retrievalUrl} target="_blank" rel="noopener" class="underline hover:text-ink">
                            {c.sourceId} — {c.title}{c.section ? `, ${c.section}` : ''} ({c.jurisdiction}, v{c.documentVersion})
                          </a>
                        </li>
                      {/each}
                    </ul>
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    </main>
  {/if}
</div>
