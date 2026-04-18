<script lang="ts">
  import { onMount } from 'svelte';
  import { renderReportPdf, buildCbomJson, buildFindingsCsv } from '@lib/pdf';
  import { demoReport } from '@lib/pdf/fixtures/demo-report';

  let pdfUrl = $state<string | null>(null);
  let pdfBytes = $state<Uint8Array | null>(null);
  let status = $state<'idle' | 'rendering' | 'ready' | 'error'>('idle');
  let errorMessage = $state<string | null>(null);
  let renderMs = $state<number>(0);

  async function render() {
    status = 'rendering';
    errorMessage = null;
    const start = performance.now();
    try {
      const bytes = await renderReportPdf(demoReport);
      renderMs = Math.round(performance.now() - start);
      pdfBytes = bytes;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = URL.createObjectURL(blob);
      status = 'ready';
      (window as unknown as { __quantumShield?: unknown }).__quantumShield = {
        pdfSize: bytes.byteLength,
        renderMs,
        header: String.fromCharCode(...bytes.subarray(0, 5)),
        cbomJson: buildCbomJson(demoReport),
        csv: buildFindingsCsv(demoReport),
        report: demoReport,
      };
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[QuantumShield] PDF render failed', err);
    }
  }

  function download(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPdf() {
    if (!pdfBytes) return;
    download(`quantum-shield-${demoReport.org.orgName.replace(/\W+/g, '_')}.pdf`, new Blob([pdfBytes], { type: 'application/pdf' }));
  }

  function downloadCbom() {
    const json = buildCbomJson(demoReport);
    download(`quantum-shield-cbom.json`, new Blob([json], { type: 'application/json' }));
  }

  function downloadCsv() {
    const csv = buildFindingsCsv(demoReport);
    download(`quantum-shield-findings.csv`, new Blob([csv], { type: 'text/csv' }));
  }

  onMount(() => {
    render();
  });
</script>

<div class="flex h-[calc(100vh-48px)] flex-col">
  <header class="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
    <div class="flex items-baseline gap-4">
      <h1 class="text-lg font-bold">PDF preview (dev)</h1>
      <p class="text-sm text-ink-soft" data-testid="render-status">
        {#if status === 'rendering'}Rendering…{/if}
        {#if status === 'ready'}Rendered in {renderMs} ms — {(pdfBytes?.byteLength ?? 0).toLocaleString()} bytes{/if}
        {#if status === 'error'}Error: {errorMessage}{/if}
      </p>
    </div>
    <div class="flex gap-2">
      <button
        class="rounded border border-ink px-3 py-1.5 text-sm font-semibold hover:bg-ink hover:text-white disabled:opacity-40"
        onclick={render}
        disabled={status === 'rendering'}
      >Re-render</button>
      <button
        class="rounded bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-40"
        data-testid="download-pdf"
        onclick={downloadPdf}
        disabled={status !== 'ready'}
      >Download PDF</button>
      <button
        class="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50"
        data-testid="download-cbom"
        onclick={downloadCbom}
      >CBOM JSON</button>
      <button
        class="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50"
        data-testid="download-csv"
        onclick={downloadCsv}
      >Findings CSV</button>
    </div>
  </header>

  {#if pdfUrl}
    <iframe
      data-testid="pdf-iframe"
      src={pdfUrl}
      title="Generated report preview"
      class="flex-1 border-0"
    ></iframe>
  {:else if status === 'error'}
    <div class="flex flex-1 items-center justify-center bg-surface-muted">
      <pre class="max-w-2xl overflow-auto bg-white p-6 font-mono text-sm text-severity-critical">{errorMessage}</pre>
    </div>
  {:else}
    <div class="flex flex-1 items-center justify-center bg-surface-muted text-ink-soft">
      Preparing PDF…
    </div>
  {/if}
</div>
