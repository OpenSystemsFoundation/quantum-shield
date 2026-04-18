<script lang="ts">
  import { onMount } from 'svelte';
  import { clearSession, loadSession, type Session } from '@lib/auth';
  import { getScansForOrg, clearAll, type ScanSummary } from '@lib/persistence/db';

  let session = $state<Session | null>(null);
  let scans = $state<ScanSummary[]>([]);
  let ready = $state(false);

  onMount(async () => {
    const s = loadSession();
    if (!s) {
      window.location.replace('/connect');
      return;
    }
    session = s;
    ready = true;
    scans = await getScansForOrg(s.org.orgId);
  });

  function signOut() {
    clearSession();
    window.location.replace('/');
  }

  async function wipeData() {
    if (!confirm('Delete all local scan history from this browser?')) return;
    await clearAll();
    scans = [];
  }

  function startScan() {
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.location.assign(`/app/scan/${scanId}`);
  }

  function openScan(s: ScanSummary) {
    const target = s.status === 'completed' ? `/app/report/${s.scanId}` : `/app/scan/${s.scanId}`;
    window.location.assign(target);
  }
</script>

{#if ready && session}
  <div class="min-h-screen bg-surface">
    <header class="border-b border-gray-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div class="flex items-center gap-6">
          <a href="/" class="font-bold text-ink">QuantumShield</a>
          <span class="text-xs uppercase tracking-wider text-ink-soft">Connected</span>
        </div>
        <div class="flex items-center gap-4 text-sm">
          <div class="text-right">
            <p class="font-semibold" data-testid="session-org-name">{session.org.orgName ?? session.org.orgId}</p>
            <p class="text-xs text-ink-soft">{session.org.username ?? session.org.userId}</p>
          </div>
          <button
            type="button"
            class="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50"
            onclick={signOut}
            data-testid="sign-out-button"
          >Sign out</button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-10">
      <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-accent">New scan</p>
            <h1 class="mt-1 text-2xl font-bold">Scan this org for post-quantum risks</h1>
            <p class="mt-2 max-w-2xl text-sm text-ink-soft">
              Read-only metadata and configuration scan of {session.org.orgName ?? 'this org'}. Typical run time for a mid-size org: under 2 minutes.
            </p>
            {#if session.mock}
              <p class="mt-2 text-xs text-ink-soft">Connected in dev-mock mode — no real Salesforce traffic.</p>
            {/if}
          </div>
          <button
            type="button"
            class="rounded-md bg-accent px-5 py-2.5 font-semibold text-white hover:opacity-90"
            onclick={startScan}
            data-testid="start-scan-button"
          >Start scan</button>
        </div>
      </section>

      <section class="mt-8">
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="text-lg font-bold">Scan history</h2>
          {#if scans.length > 0}
            <button type="button" class="text-xs text-ink-soft hover:underline" onclick={wipeData}>
              Clear local data
            </button>
          {/if}
        </div>
        {#if scans.length === 0}
          <p class="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-ink-soft">
            No scans yet. Start your first scan above.
          </p>
        {:else}
          <ul class="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {#each scans as s (s.scanId)}
              <li>
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-surface-muted"
                  onclick={() => openScan(s)}
                >
                  <div>
                    <p class="font-semibold">{s.startedAt.slice(0, 19).replace('T', ' ')}</p>
                    <p class="text-xs text-ink-soft">{s.scanId}</p>
                  </div>
                  <div class="text-right text-xs">
                    {#if s.status === 'completed'}
                      <p class="font-semibold text-ink">{s.totalFindings ?? 0} findings</p>
                      <p class="text-ink-soft">Completed</p>
                    {:else if s.status === 'failed'}
                      <p class="font-semibold text-severity-critical">Failed</p>
                      {#if s.error}
                        <p class="text-ink-soft">{s.error}</p>
                      {/if}
                    {:else}
                      <p class="font-semibold text-accent">Running…</p>
                    {/if}
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </main>
  </div>
{/if}
