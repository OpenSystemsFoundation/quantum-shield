<script lang="ts">
  /**
   * QuantumShield brand mark: a shield holding a cloud with a keyhole.
   * Kept under its historical name so every page picks it up unchanged.
   * The same artwork lives in public/favicon.svg — keep the two in sync.
   */
  interface Props {
    size?: number;
    variant?: 'primary' | 'onDark' | 'mono';
  }
  const { size = 24, variant = 'primary' }: Props = $props();
  // Unique per instance: several logos can share a page.
  const uid = $props.id();
  const skyId = `qs-sky-${uid}`;

  const palette = $derived.by(() => {
    if (variant === 'onDark') {
      return { border: '#9FD8F5', fill: 'sky', cloud: '#00A1E0', key: '#032D60' };
    }
    if (variant === 'mono') {
      return { border: 'currentColor', fill: 'none', cloud: 'currentColor', key: 'var(--qs-mono-bg, #fff)' };
    }
    return { border: '#032D60', fill: 'sky', cloud: '#00A1E0', key: '#032D60' };
  });
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 64 64"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="QuantumShield"
  style="display: block"
>
  <defs>
    <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DDF2FD" />
      <stop offset="1" stop-color="#A8DBF7" />
    </linearGradient>
  </defs>
  <path
    d="M32 3.5 L56.5 11.5 V30 C56.5 44.5 46.5 54.8 32 60.5 C17.5 54.8 7.5 44.5 7.5 30 V11.5 Z"
    fill={palette.fill === 'sky' ? `url(#${skyId})` : palette.fill}
    stroke={palette.border}
    stroke-width="3.5"
    stroke-linejoin="round"
  />
  <g fill={palette.cloud}>
    <circle cx="23" cy="35.5" r="6.5" />
    <circle cx="31.5" cy="30" r="9" />
    <circle cx="41" cy="34.5" r="7.5" />
    <rect x="23" y="33" width="18" height="9" />
  </g>
  <circle cx="32" cy="33" r="3" fill={palette.key} />
  <path d="M30.6 34.5 h2.8 l0.9 5 h-4.6 z" fill={palette.key} />
</svg>
