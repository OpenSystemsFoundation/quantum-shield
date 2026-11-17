import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Public, indexable pages only. The app (/app, /connect, /callback) is
// excluded here and disallowed in robots.txt.
// Trailing slashes match the canonical URLs of Astro's directory-style output.
const STATIC_PATHS = ['/', '/install/', '/security/', '/privacy/', '/terms/', '/docs/rules/', '/docs/regulations/'];

const slug = (id: string) => id.replace(/\.(md|mdx)$/, '');

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() ?? '').replace(/\/$/, '');
  const rules = await getCollection('rules');
  const regulations = await getCollection('regulations');
  const paths = [
    ...STATIC_PATHS,
    ...rules.map((r: { id: string }) => `/docs/rules/${slug(r.id)}/`),
    ...regulations.map((r: { id: string }) => `/docs/regulations/${slug(r.id)}/`),
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paths.map((p) => `  <url><loc>${base}${p}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
