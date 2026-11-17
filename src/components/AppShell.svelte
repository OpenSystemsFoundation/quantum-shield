<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSession, type Session } from '@lib/auth';
  import { getScansForOrg, clearAll, type ScanSummary } from '@lib/persistence/db';
  import AppChrome from './AppChrome.svelte';

  let session = $state<Session | null>(null);
  let scans = $state<ScanSummary[]>([]);
  let ready = $state(false);
  const REGIONS = [
    { id: 'US', label: 'United States (NIST, CNSA 2.0)' },
    { id: 'EU', label: 'European Union (ENISA, NIS2, DORA)' },
    { id: 'NL', label: 'Netherlands (NCSC-NL, AIVD)' },
    { id: 'DE', label: 'Germany (BSI TR-02102)' },
    { id: 'FR', label: 'France (ANSSI)' },
    { id: 'UK', label: 'United Kingdom (NCSC-UK)' },
  ] as const;
  let selectedRegions = $state<string[]>([]);

  onMount(async () => {
    const s = loadSession();
    if (!s) {
      window.location.replace('/connect');
      return;
    }
    session = s;
    ready = true;
    scans = await getScansForOrg(s.org.orgId);
    try {
      const stored = localStorage.getItem('qs:regions');
      if (stored) selectedRegions = JSON.parse(stored);
    } catch {
      /* invalid cached value; ignore */
    }
  });

  function toggleRegion(id: string) {
    selectedRegions = selectedRegions.includes(id)
      ? selectedRegions.filter((x) => x !== id)
      : [...selectedRegions, id];
    try {
      localStorage.setItem('qs:regions', JSON.stringify(selectedRegions));
    } catch {
      /* storage full or blocked; tolerable */
    }
  }

  async function wipeData() {
    if (!confirm('Delete all local scan history from this browser?')) return;
    await clearAll();
    scans = [];
  }

  function startScan() {
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const params = new URLSearchParams({ id: scanId });
    if (selectedRegions.length > 0) params.set('regions', selectedRegions.join(','));
    window.location.assign(`/app/scan/?${params.toString()}`);
  }

  function openScan(s: ScanSummary) {
    // Completed scans open the report; failed/interrupted scans open the scan
    // page in status mode (ScanView never restarts a scan whose id already
    // has a persisted summary).
    const base = s.status === 'completed' ? '/app/report/' : '/app/scan/';
    window.location.assign(`${base}?id=${encodeURIComponent(s.scanId)}`);
  }

  const latestReportScanId = $derived(
    scans.find((s) => s.status === 'completed')?.scanId ?? null,
  );

  function fmtDate(s: string): string {
    return s.slice(0, 10);
  }
  function fmtTime(s: string): string {
    return s.slice(11, 19);
  }
</script>

{#if ready && session}
  <div class="app-frame">
    <AppChrome session={session} active="overview" scanCount={scans.length} findingsCount={scans.reduce((acc, s) => acc + (s.totalFindings ?? 0), 0)} latestReportScanId={latestReportScanId} />

    <main style="padding:24px 28px 48px;min-width:0;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <div class="tiny-caps" style="color:var(--navy-600);">Overview</div>
          <h1 class="display" style="font-size:30px;font-weight:500;letter-spacing:-0.01em;margin:4px 0 0;" data-testid="session-org-name">
            {session.org.orgName ?? session.org.orgId}
          </h1>
          <p style="margin:6px 0 0;color:var(--ink-3);font-size:13px;">
            Instance <span class="mono" style="color:var(--ink-2);">{session.instanceUrl.replace(/^https?:\/\//, '')}</span>
            · API <span class="mono">v{session.apiVersion}</span>
          </p>
        </div>
        <button
          type="button"
          class="qs-btn qs-btn-primary qs-btn-lg"
          onclick={startScan}
          data-testid="start-scan-button"
        >
          Start scan
        </button>
      </div>

      <section class="app-cols" style="margin-top:28px;">
        <div class="qs-card">
          <div class="qs-card-head">
            <h3>Scan history</h3>
            <div style="margin-left:auto;display:flex;gap:8px;">
              {#if scans.length > 0}
                <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={wipeData}>Clear local data</button>
              {/if}
            </div>
          </div>
          {#if scans.length === 0}
            <div style="padding:32px;text-align:center;color:var(--muted);font-size:12.5px;">
              No scans yet. Start your first scan to see findings here.
            </div>
          {:else}
            <table class="tbl">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Scan ID</th>
                  <th style="width:120px;">Findings</th>
                  <th style="width:120px;">Status</th>
                  <th style="width:80px;"></th>
                </tr>
              </thead>
              <tbody>
                {#each scans as s (s.scanId)}
                  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
                  <tr
                    role="button"
                    tabindex="0"
                    onclick={() => openScan(s)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openScan(s);
                      }
                    }}
                    style="cursor:pointer;"
                  >
                    <td>
                      <div style="font-weight:600;">{fmtDate(s.startedAt)}</div>
                      <div class="mono" style="font-size:11px;color:var(--muted);">{fmtTime(s.startedAt)}</div>
                    </td>
                    <td class="mono" style="font-size:11.5px;color:var(--ink-3);">{s.scanId}</td>
                    <td class="mono">{s.totalFindings ?? '—'}</td>
                    <td>
                      {#if s.status === 'completed'}
                        <span class="pill ok">Complete</span>
                      {:else if s.status === 'failed'}
                        <span class="pill crit">Failed</span>
                      {:else}
                        <span class="pill adv">Running</span>
                      {/if}
                    </td>
                    <td class="mono" style="color:var(--navy-600);font-size:11.5px;">Open →</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>

        <div class="vstack">
          <div class="qs-card">
            <div class="qs-card-head"><h3>This org</h3></div>
            <div class="qs-card-body">
              <dl style="display:grid;grid-template-columns:1fr;gap:10px;font-size:12.5px;margin:0;">
                <div>
                  <dt class="tiny-caps">Environment</dt>
                  <dd class="mono" style="margin:4px 0 0;">{session.environmentId}</dd>
                </div>
                <div>
                  <dt class="tiny-caps">User</dt>
                  <dd class="mono" style="margin:4px 0 0;font-size:11.5px;">{session.org.username ?? session.org.userId}</dd>
                </div>
                <div>
                  <dt class="tiny-caps">Session expires</dt>
                  <dd class="mono" style="margin:4px 0 0;">on tab close</dd>
                </div>
              </dl>
            </div>
          </div>

          <div class="qs-card" data-testid="region-selector">
            <div class="qs-card-head"><h3>Regulatory region</h3></div>
            <div class="qs-card-body">
              <p style="margin:0 0 10px;font-size:12px;color:var(--ink-3);">
                Pick the jurisdictions that apply to this org. Every rule runs whatever you
                pick; the selection only decides which authorities are cited on each finding
                (your jurisdictions first, plus international sources). Leave all unchecked
                to show every citation.
              </p>
              <div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;">
                {#each REGIONS as r (r.id)}
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input
                      type="checkbox"
                      checked={selectedRegions.includes(r.id)}
                      onchange={() => toggleRegion(r.id)}
                      data-testid={`region-${r.id}`}
                    />
                    <span>{r.label}</span>
                  </label>
                {/each}
              </div>
            </div>
          </div>

          <div class="qs-card">
            <div class="qs-card-head"><h3>Frameworks</h3></div>
            <div class="qs-card-body">
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                <span class="tag">BSI TR-02102</span>
                <span class="tag">NCSC-NL</span>
                <span class="tag">ENISA PQC</span>
                <span class="tag">GDPR Art. 32</span>
                <span class="tag">NIS 2</span>
                <span class="tag">DORA</span>
                <span class="tag">NIST FIPS 203/204/205</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
{/if}
