<script lang="ts">
  interface Props {
    size?: number;
    variant?: 'primary' | 'onDark' | 'mono';
  }
  const { size = 24, variant = 'primary' }: Props = $props();

  const palette = $derived.by(() => {
    if (variant === 'onDark') {
      return { stroke: '#cfe0fa', fill: 'rgba(143,183,238,0.08)', vec: '#6bb4ff', dot: '#cfe0fa' };
    }
    if (variant === 'mono') {
      return { stroke: 'currentColor', fill: 'none', vec: 'currentColor', dot: 'currentColor' };
    }
    return { stroke: '#0b3a7a', fill: '#eef4fc', vec: '#1575d1', dot: '#0b3a7a' };
  });

  const scale = $derived(size < 20 ? 1.4 : 1);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 64 64"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-label="QuantumShield"
  style="display: block"
>
  <path
    d="M32 4 L56 12 V30 C56 44 46.2 54.2 32 60 C17.8 54.2 8 44 8 30 V12 Z"
    stroke={palette.stroke}
    stroke-width={2.2 * scale}
    fill={palette.fill}
    stroke-linejoin="round"
  />
  <g transform="translate(32 32)">
    <circle r="14" stroke={palette.stroke} stroke-width={1.6 * scale} fill="none" />
    {#if size >= 20}
      <ellipse rx="14" ry="4.2" stroke={palette.stroke} stroke-width="1.1" fill="none" opacity="0.45" stroke-dasharray="2 2" />
    {/if}
    <ellipse rx="14" ry="4.2" stroke={palette.stroke} stroke-width={1.2 * scale} fill="none" />
    {#if size >= 20}
      <ellipse rx="4.2" ry="14" stroke={palette.stroke} stroke-width="1.1" fill="none" opacity="0.45" stroke-dasharray="2 2" />
    {/if}
    <line x1="0" y1="-17" x2="0" y2="17" stroke={palette.stroke} stroke-width={1 * scale} stroke-dasharray="1.5 1.5" opacity="0.55" />
    <line x1="0" y1="0" x2="9.2" y2="-8" stroke={palette.vec} stroke-width={2 * scale} stroke-linecap="round" />
    <circle cx="9.2" cy="-8" r={1.9 * scale} fill={palette.vec} />
    <circle r={1.2 * scale} fill={palette.dot} />
    {#if size >= 20}
      <circle cx="0" cy="-14" r="1.3" fill={palette.dot} />
      <circle cx="0" cy="14" r="1.3" fill={palette.dot} />
    {/if}
  </g>
</svg>
