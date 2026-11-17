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

<div class="pdf-preview">
  <header class="pdf-preview__header">
    <div class="pdf-preview__title-row">
      <h1>PDF preview (dev)</h1>
      <p data-testid="render-status">
        {#if status === 'rendering'}Rendering…{/if}
        {#if status === 'ready'}Rendered in {renderMs} ms — {(pdfBytes?.byteLength ?? 0).toLocaleString()} bytes{/if}
        {#if status === 'error'}Error: {errorMessage}{/if}
      </p>
    </div>
    <div class="pdf-preview__actions">
      <button
        class="pdf-preview__button"
        onclick={render}
        disabled={status === 'rendering'}
      >Re-render</button>
      <button
        class="pdf-preview__button pdf-preview__button--primary"
        data-testid="download-pdf"
        onclick={downloadPdf}
        disabled={status !== 'ready'}
      >Download PDF</button>
      <button
        class="pdf-preview__button"
        data-testid="download-cbom"
        onclick={downloadCbom}
      >CBOM JSON</button>
      <button
        class="pdf-preview__button"
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
      class="pdf-preview__frame"
    ></iframe>
  {:else if status === 'error'}
    <div class="pdf-preview__empty">
      <pre class="pdf-preview__error">{errorMessage}</pre>
    </div>
  {:else}
    <div class="pdf-preview__empty">
      Preparing PDF…
    </div>
  {/if}
</div>

<style>
  .pdf-preview {
    min-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
  }

  .pdf-preview__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    padding: 12px 24px;
  }

  .pdf-preview__title-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    min-width: 0;
  }

  .pdf-preview h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
  }

  .pdf-preview p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
  }

  .pdf-preview__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .pdf-preview__button {
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .pdf-preview__button:hover {
    background: var(--bg-2);
  }

  .pdf-preview__button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pdf-preview__button--primary {
    background: var(--ink);
    border-color: var(--ink);
    color: white;
  }

  .pdf-preview__button--primary:hover {
    background: var(--ink-2);
  }

  .pdf-preview__frame {
    flex: 1;
    border: 0;
  }

  .pdf-preview__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-2);
    color: var(--ink-2);
  }

  .pdf-preview__error {
    max-width: 672px;
    overflow: auto;
    background: var(--surface);
    color: var(--crit);
    padding: 24px;
    font-family: var(--mono);
    font-size: 13px;
  }
</style>
