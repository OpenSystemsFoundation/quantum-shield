/**
 * Build-time CSP hardening: allow the inline <script> blocks that the build
 * actually emits (Astro's island bootstrap, small page scripts) by sha256 hash
 * instead of a blanket script-src 'unsafe-inline'.
 *
 * Used by the `csp-inline-hashes` integration in astro.config.mjs, which runs
 * after every other build step. Nothing here is page-specific: any inline
 * script added to any page later is picked up automatically on the next build.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Cloudflare ignores _headers lines longer than this. */
const MAX_HEADER_LINE = 2000;

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;
const NON_EXECUTING_TYPE_RE = /\btype\s*=\s*["']?(application\/(ld\+)?json|importmap-shim|text\/template)/i;
const INLINE_HANDLER_RE = /<[a-z][^<>]*\son[a-z]+\s*=\s*["'][^<>]*>/gi;

/** CSP hash-source for one inline script body, exactly as the browser hashes it. */
export function cspHash(scriptText) {
  return `'sha256-${createHash('sha256').update(scriptText, 'utf8').digest('base64')}'`;
}

/** Hash-sources for every executable inline <script> in an HTML document. */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT_RE)) {
    if (/\bsrc\s*=/i.test(attrs)) continue; // external: covered by 'self'
    if (NON_EXECUTING_TYPE_RE.test(attrs)) continue; // data blocks never execute
    if (body.length === 0) continue;
    hashes.push(cspHash(body));
  }
  return hashes;
}

/** Tags carrying inline event-handler attributes, which hashes cannot allow. */
export function inlineEventHandlers(html) {
  // Strip script/style bodies and comments first so their text is not scanned.
  const markup = html
    .replace(SCRIPT_RE, '')
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return markup.match(INLINE_HANDLER_RE) ?? [];
}

/** Rewrite the script-src directive of every CSP line in a _headers file. */
export function applyScriptHashes(headersText, hashes) {
  let rewritten = 0;
  const out = headersText
    .split('\n')
    .map((line) => {
      if (!/^\s+Content-Security-Policy\s*:/i.test(line)) return line;
      if (!/script-src\s[^;]*/.test(line)) {
        throw new Error('csp-inline-hashes: the CSP in _headers has no script-src directive');
      }
      const next = line.replace(/script-src\s([^;]*)/, (_m, sources) => {
        const kept = sources
          .split(/\s+/)
          .filter((s) => s && s !== "'unsafe-inline'" && !s.startsWith("'sha256-"));
        return `script-src ${[...kept, ...hashes].join(' ')}`;
      });
      if (next.trim().length > MAX_HEADER_LINE) {
        throw new Error(
          `csp-inline-hashes: CSP header line is ${next.trim().length} chars; Cloudflare drops lines over ${MAX_HEADER_LINE}. ` +
            'Move inline scripts into bundled modules to reduce the number of hashes.',
        );
      }
      rewritten += 1;
      return next;
    })
    .join('\n');
  if (rewritten === 0) {
    throw new Error('csp-inline-hashes: no Content-Security-Policy line found in _headers');
  }
  return out;
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Hash every inline script under `distDir` and write the hashes into
 * `<distDir>/_headers`. Returns what was found, for build logging.
 */
export async function hashInlineScripts(distDir) {
  const files = await htmlFiles(distDir);
  const hashes = new Set();
  const handlers = [];
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    for (const h of inlineScriptHashes(html)) hashes.add(h);
    for (const tag of inlineEventHandlers(html)) {
      handlers.push(`${path.relative(distDir, file)}: ${tag.slice(0, 120)}`);
    }
  }
  const sorted = [...hashes].sort();
  const headersPath = path.join(distDir, '_headers');
  await writeFile(headersPath, applyScriptHashes(await readFile(headersPath, 'utf8'), sorted));
  return { pages: files.length, hashes: sorted, handlers };
}
