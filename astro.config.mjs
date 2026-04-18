import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://quantumshield.example',
  integrations: [svelte(), tailwind({ applyBaseStyles: true }), mdx()],
  server: { host: '127.0.0.1', port: 4321 },
  vite: {
    ssr: {
      noExternal: ['pdf-lib'],
    },
  },
});
