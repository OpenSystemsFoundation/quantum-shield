<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Category, Finding, Severity } from '@lib/pdf';
  import { TIER_LABELS, TIER_ORDER, canOverrideTier, type StoredTier } from '@lib/priority';

  interface Props {
    finding: Finding | null;
    onClose: () => void;
    height?: number;
    /** Set in sample-report mode so the detail is labelled even when it covers the page banner. */
    sampleLabel?: string;
    quantumYear?: number;
    /** The reader's override of what this finding's asset carries, if any. */
    tierOverride?: StoredTier;
    onTierChange?: (tier: StoredTier | '') => void;
  }
  let { finding, onClose, height = $bindable(360), sampleLabel, quantumYear, tierOverride, onTierChange }: Props = $props();

  const BAND_LABELS = { 'act-now': 'Act now', plan: 'Plan', monitor: 'Monitor' } as const;
  const BAND_CLASS = { 'act-now': 'crit', plan: 'med', monitor: 'low' } as const;

  const HEIGHT_KEY = 'qs.findingDrawer.height.v1';
  const MIN_HEIGHT = 180;
  const MAX_RATIO = 0.85;

  /** Below this width the drawer is a full-screen modal dialog. */
  const MOBILE_QUERY = '(max-width: 700px)';
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let isMobile = $state(false);
  let mobileQuery: MediaQueryList | null = null;
  const onMobileChange = (e: MediaQueryListEvent) => (isMobile = e.matches);

  /** Citation URLs come from report data; only ever link to https: targets. */
  function safeHttpsUrl(raw: string | undefined): string | null {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }

  let dragging = $state(false);
  let drawerEl = $state<HTMLElement | null>(null);
  let previousFocus: HTMLElement | null = null;
  let lastFindingId: string | null = null;

  // Move focus into the drawer when it opens; restore it to the invoking
  // element (e.g. the finding row) when it closes.
  $effect(() => {
    const id = finding?.id ?? null;
    if (id === lastFindingId) return;
    if (id && lastFindingId === null) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      queueMicrotask(() => drawerEl?.focus());
    } else if (id && lastFindingId) {
      // Switched to another finding while open: track the newly clicked row
      // (only if focus is outside the drawer) so close restores correctly.
      const active = document.activeElement;
      if (active instanceof HTMLElement && drawerEl && !drawerEl.contains(active)) {
        previousFocus = active;
      }
    } else if (!id && lastFindingId) {
      const target = previousFocus;
      previousFocus = null;
      if (target?.isConnected) target.focus();
    }
    lastFindingId = id;
  });

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

  onMount(() => {
    try {
      const stored = Number.parseInt(localStorage.getItem(HEIGHT_KEY) ?? '', 10);
      if (!Number.isNaN(stored) && stored >= MIN_HEIGHT) height = stored;
    } catch {
      /* noop */
    }
    document.addEventListener('keydown', onKeydown);
    mobileQuery = window.matchMedia(MOBILE_QUERY);
    isMobile = mobileQuery.matches;
    mobileQuery.addEventListener('change', onMobileChange);
  });

  // While the full-screen dialog is open the page behind it must not scroll.
  $effect(() => {
    if (!(finding && isMobile)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  onDestroy(() => {
    document.removeEventListener('keydown', onKeydown);
    mobileQuery?.removeEventListener('change', onMobileChange);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', stopDrag);
  });

  function onKeydown(e: KeyboardEvent) {
    if (!finding) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Full-screen (modal) mode: keep Tab focus inside the dialog.
    if (e.key === 'Tab' && isMobile && drawerEl) {
      const items = Array.from(drawerEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        drawerEl.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && drawerEl.contains(active);
      if (e.shiftKey && (!inside || active === first || active === drawerEl)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function clamp(h: number) {
    const maxH = Math.round(window.innerHeight * MAX_RATIO);
    return Math.max(MIN_HEIGHT, Math.min(maxH, h));
  }

  function startDrag(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    dragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    if ('touches' in e) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', stopDrag);
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', stopDrag);
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    height = clamp(window.innerHeight - e.clientY);
  }

  function onTouchMove(e: TouchEvent) {
    if (!dragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    height = clamp(window.innerHeight - touch.clientY);
  }

  function stopDrag() {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      /* noop */
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', stopDrag);
  }

  function maximise() {
    height = clamp(Math.round(window.innerHeight * MAX_RATIO));
    try { localStorage.setItem(HEIGHT_KEY, String(height)); } catch { /* noop */ }
  }

  function reset() {
    height = 360;
    try { localStorage.setItem(HEIGHT_KEY, String(height)); } catch { /* noop */ }
  }
</script>

{#if finding}
  <div
    bind:this={drawerEl}
    class="qs-drawer"
    style={`height:${height}px;`}
    role="dialog"
    aria-modal={isMobile ? 'true' : undefined}
    aria-labelledby="finding-drawer-title"
    tabindex="-1"
    data-testid="finding-drawer"
  >
    <!-- Pointer-only resize affordance; keyboard users resize via the
         Reset/Maximise buttons, so this is hidden from assistive tech. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="qs-drawer-handle"
      aria-hidden="true"
      onmousedown={startDrag}
      ontouchstart={startDrag}
      data-testid="drawer-handle"
    >
      <span class="grip"></span>
    </div>

    <div class="qs-drawer-head">
      <div class="title-row" style="flex:1;min-width:0;">
        {#if sampleLabel}<span class="pill sample" data-testid="drawer-sample-label">{sampleLabel}</span>{/if}
        {#if finding.priority}<span class={`pill ${BAND_CLASS[finding.priority.band]}`} data-testid="drawer-priority">#{finding.priority.rank} {BAND_LABELS[finding.priority.band]}</span>{/if}
        <span class={`pill ${SEV_CLASS[finding.severity]}`}>{finding.severity}</span>
        <span class="pill adv">{POSTURE_LABELS[finding.migrationPosture]}</span>
        {#if finding.hndlExposure}<span class="pill hndl">HNDL</span>{/if}
        <span class="tag">{CATEGORY_LABELS[finding.category]}</span>
        <h3 id="finding-drawer-title" class="qs-drawer-title" style="margin:0 0 0 8px;font-family:var(--display);font-size:16px;font-weight:500;letter-spacing:-0.005em;min-width:0;">
          {finding.title}
        </h3>
      </div>
      <div class="qs-drawer-actions">
        <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm resize-btn" onclick={reset} title="Reset size" aria-label="Reset detail panel size">Reset</button>
        <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm resize-btn" onclick={maximise} title="Maximise" aria-label="Maximise detail panel">▲</button>
        <button type="button" class="qs-btn qs-btn-ghost qs-btn-sm" onclick={onClose} title="Close (Esc)" aria-label="Close finding detail" data-testid="drawer-close">✕</button>
      </div>
    </div>

    <div class="qs-drawer-meta">
      <span class="mono">{finding.id}</span>
      <span style="color:var(--line-strong);">·</span>
      <span class="mono">{finding.asset.name}</span>
      <span style="color:var(--line-strong);">·</span>
      <span class="mono" style="color:var(--muted);">{finding.asset.identifier}</span>
      {#if finding.deadline}
        <span style="color:var(--line-strong);">·</span>
        <span class="mono">Deadline {finding.deadline}</span>
      {/if}
    </div>

    <div class="qs-drawer-body">
      <div class="detail-grid">
        {#if finding.priority}
          {@const p = finding.priority}
          <div class="detail-cell" style="grid-column:1 / -1;border-right:none;" data-testid="drawer-priority-detail">
            <h5>Why this priority</h5>
            <div class="margin-math">
              <span><strong>{p.shelfLifeYears}</strong> yrs data must stay secret</span>
              <span class="op">+</span>
              <span><strong>{p.migrationYears}</strong> yrs to fix ({finding.effort} effort)</span>
              <span class="op">vs</span>
              <span><strong>{p.yearsToQuantum}</strong> yrs until a quantum computer ({quantumYear ?? '—'})</span>
              <span class="op">=</span>
              <span class={p.marginYears > 0 ? 'exposed' : ''}><strong>{p.marginYears > 0 ? `${p.marginYears} yrs exposed` : `${Math.abs(p.marginYears)} yrs slack`}</strong></span>
            </div>
            <div style="font-size:12.5px;color:var(--ink-2);line-height:1.5;margin-top:6px;">{p.reason}</div>
            <div style="font-size:12px;color:var(--ink-3);line-height:1.5;margin-top:4px;">Data at stake: {TIER_LABELS[p.dataTier]}. {p.dataBasis}.</div>
            {#if onTierChange && canOverrideTier(finding.asset)}
              <label class="tier-pick">
                What does {finding.asset.kind === 'shield-key' ? 'this key protect' : 'this carry'}?
                <select value={tierOverride ?? ''} onchange={(e) => onTierChange((e.currentTarget as HTMLSelectElement).value as StoredTier | '')} data-testid="drawer-tier">
                  <option value="">Assume (default)</option>
                  {#each [...TIER_ORDER].reverse() as t}
                    <option value={t}>{TIER_LABELS[t]}</option>
                  {/each}
                </select>
              </label>
            {/if}
          </div>
        {/if}
        <div class="detail-cell">
          <h5>Current cryptography</h5>
          <div class="big">{finding.currentCrypto}</div>
        </div>
        <div class="detail-cell">
          <h5>Recommended replacement</h5>
          <div style="font-size:12.5px;color:var(--ink-2);line-height:1.5;">{finding.recommendedReplacement}</div>
        </div>
        <div class="detail-cell" style="grid-column:1 / -1;border-right:none;">
          <h5>Rationale</h5>
          <div style="font-size:12.5px;color:var(--ink-3);line-height:1.55;">{finding.rationale}</div>
        </div>
        <div class="detail-cell" style="grid-column:1 / -1;border-right:none;border-bottom:none;">
          <h5>Citations</h5>
          <div style="display:grid;gap:8px;margin-top:4px;">
            {#each finding.citations as c}
              {@const href = safeHttpsUrl(c.retrievalUrl)}
              {#snippet citeBody()}
                <div style="flex:1;min-width:0;">
                  <div class="doc">{c.sourceId}{c.section ? ` · ${c.section}` : ''} · {c.jurisdiction} · v{c.documentVersion}</div>
                  <div class="quote">{c.title}</div>
                </div>
              {/snippet}
              {#if href}
                <a class="cite" {href} target="_blank" rel="noopener noreferrer">
                  {@render citeBody()}
                  <span class="sr-only">(opens in a new tab)</span>
                </a>
              {:else}
                <div class="cite">{@render citeBody()}</div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .qs-drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    background: var(--surface);
    border-top: 1px solid var(--line);
    box-shadow: 0 -16px 40px rgba(13, 20, 36, 0.12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .qs-drawer-handle {
    position: relative;
    display: block;
    width: 100%;
    height: 10px;
    padding: 0;
    margin: 0;
    border: none;
    background: var(--surface-2);
    border-bottom: 1px solid var(--line);
    cursor: row-resize;
    touch-action: none;
  }
  .qs-drawer-handle:hover {
    background: var(--navy-50);
  }
  .qs-drawer-handle .grip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 44px;
    height: 3px;
    background: var(--line-strong);
    border-radius: 2px;
  }
  .qs-drawer-handle:hover .grip {
    background: var(--navy-500);
  }

  .qs-drawer-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, var(--surface-2), var(--surface));
  }
  .qs-drawer-head .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .qs-drawer-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .qs-drawer-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-bottom: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--ink-3);
    overflow-x: auto;
    white-space: nowrap;
  }

  .qs-drawer-body {
    flex: 1;
    overflow-y: auto;
  }

  :global(.qs-drawer .detail-grid) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .margin-math {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .margin-math .op {
    color: var(--muted);
    font-family: var(--mono);
  }
  .margin-math .exposed {
    color: var(--crit);
  }
  .tier-pick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--ink-2);
  }
  .tier-pick select {
    font: inherit;
    padding: 2px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
  }
  .pill.sample {
    background: var(--warn-bg);
    color: #4a2300;
  }
  .qs-drawer-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Desktop: the app sidebar (240px) stays visible and usable. */
  @media (min-width: 901px) {
    .qs-drawer {
      left: 240px;
    }
  }

  @media (max-width: 720px) {
    :global(.qs-drawer .detail-grid) {
      grid-template-columns: minmax(0, 1fr);
    }
    /* Phones: a full-screen modal dialog; the inline height is ignored. */
    .qs-drawer {
      top: 0;
      height: 100dvh !important;
      z-index: 50;
      border-top: none;
    }
    .qs-drawer-handle,
    .resize-btn {
      display: none;
    }
    .qs-drawer-head {
      align-items: flex-start;
    }
    .qs-drawer-title {
      flex: 1 0 100%;
      margin-left: 0 !important;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .qs-drawer-meta {
      flex-wrap: wrap;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .qs-drawer-meta {
      padding: 8px 14px;
    }
    .qs-drawer-head {
      padding: 10px 14px;
    }
  }
</style>
