import designTokens from './src/styles/tailwind-design.generated.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,svelte,md,mdx}'],
  theme: {
    extend: {
      ...designTokens,
      colors: {
        ...designTokens.colors,
        bg: {
          DEFAULT: '#f4f6fa',
          alt: '#eaeef4',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#fbfcfe',
          muted: '#eaeef4',
        },
        line: {
          DEFAULT: '#d9dfe8',
          soft: '#e5e9f0',
          strong: '#c3cbd8',
        },
        ink: {
          DEFAULT: '#0d1424',
          soft: '#1f2a40',
          muted: '#3d4a62',
        },
        muted: {
          DEFAULT: '#5b6885',
          soft: '#8391a8',
        },
        navy: {
          900: '#0b3a7a',
          700: '#0b5cab',
          500: '#1575d1',
          100: '#dbe7f6',
          50: '#eef4fc',
          DEFAULT: '#0b5cab',
        },
        severity: {
          critical: '#8a1722',
          'critical-bg': '#f6d1d6',
          high: '#a3411d',
          'high-bg': '#fbddd0',
          medium: '#8a5a00',
          'medium-bg': '#fbecc9',
          low: '#2e4a7a',
          'low-bg': '#dbe3f3',
          ok: '#0a7a4a',
          'ok-bg': '#dff3e8',
          hndl: '#5a2a8a',
          'hndl-bg': '#e9dcf5',
        },
      },
      fontFamily: {
        sans: ["'Inter Tight'", 'system-ui', 'sans-serif'],
        serif: ["'Source Serif 4'", 'Georgia', 'serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'qs-1': '0 1px 0 rgba(13,20,36,.04), 0 1px 2px rgba(13,20,36,.06)',
        'qs-2': '0 1px 0 rgba(13,20,36,.05), 0 4px 16px rgba(13,20,36,.08)',
        'qs-3': '0 12px 40px rgba(13,20,36,.14)',
      },
    },
  },
  plugins: [],
};
