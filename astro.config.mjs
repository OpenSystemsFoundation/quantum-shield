import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hashInlineScripts } from './scripts/csp-inline-hashes.mjs';

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

/**
 * The CSP in public/_headers has no script-src 'unsafe-inline'. Astro still
 * emits a few inline scripts (the island bootstrap, small page scripts), so
 * after the build this hashes every inline <script> found in every built HTML page
 * and adds the 'sha256-…' sources to script-src in dist/_headers.
 *
 * Keep this LAST in `integrations`: build:done hooks run in order, and the
 * hashes must describe the final HTML. Inline event-handler attributes
 * (onclick="…") cannot be hashed and fail the build.
 */
function cspInlineHashes() {
  return {
    name: 'csp-inline-hashes',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const { pages, hashes, handlers } = await hashInlineScripts(fileURLToPath(dir));
        if (handlers.length > 0) {
          throw new Error(
            `csp-inline-hashes: inline event handlers are blocked by the CSP; use addEventListener instead:\n  ${handlers.join('\n  ')}`,
          );
        }
        logger.info(`script-src: ${hashes.length} inline-script hash(es) from ${pages} page(s) written to _headers`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://quantumshield.opensf.foundation',
  // Pure static output on Cloudflare Pages. The scan/report pages read their
  // id from the URL hash (e.g. /app/scan#<scanId>) on the client — no dynamic
  // route segments, no server-side rendering, no adapter required.
  output: 'static',
  // cspInlineHashes() must stay last — see its comment.
  integrations: [svelte(), mdx(), stripDevPages(), cspInlineHashes()],
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
