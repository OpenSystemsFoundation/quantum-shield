/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,svelte,md,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0b0f14',
          soft: '#1a222d',
        },
        surface: {
          DEFAULT: '#f8f9fb',
          raised: '#ffffff',
          muted: '#eef1f5',
        },
        accent: {
          DEFAULT: '#ff4b1f',
          soft: '#ffe5dc',
        },
        severity: {
          critical: '#b00020',
          high: '#d95e00',
          medium: '#b58100',
          low: '#2a7f62',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
