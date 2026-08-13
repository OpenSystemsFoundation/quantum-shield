import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import { rm } from 'node:fs/promises';

/**
 * Dev-only pages under src/pages/dev/ (e.g. /dev/pdf-preview) stay available
 * in `astro dev`, but must not ship in the production build. Astro static
 * output has no per-route exclusion, so drop dist/dev after the build.
 */
function stripDevPages() {
  return {
    name: 'strip-dev-pages',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await rm(new URL('dev/', dir), { recursive: true, force: true });
      },
    },
  };
}

export default defineConfig({
  site: 'https://quantumshield.example',
  // Pure static output on Cloudflare Pages. The scan/report pages read their
  // id from the URL hash (e.g. /app/scan#<scanId>) on the client — no dynamic
  // route segments, no server-side rendering, no adapter required.
  output: 'static',
  integrations: [svelte(), mdx(), stripDevPages()],
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
