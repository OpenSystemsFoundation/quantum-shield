import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://quantumshield.example',
  // Pure static output on Cloudflare Pages. The scan/report pages read their
  // id from the URL hash (e.g. /app/scan#<scanId>) on the client — no dynamic
  // route segments, no server-side rendering, no adapter required.
  output: 'static',
  integrations: [svelte(), tailwind({ applyBaseStyles: true }), mdx()],
  server: { host: '127.0.0.1', port: 4321 },
  vite: {
    ssr: {
      noExternal: ['pdf-lib'],
    },
    optimizeDeps: {
      include: ['comlink', 'idb', 'pdf-lib'],
    },
  },
});
