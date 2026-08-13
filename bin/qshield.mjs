#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const entry = path.resolve(repoRoot, 'cli', 'index.ts');

try {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport(pathToFileURL(entry).href, import.meta.url);
} catch (err) {
  const detail =
    process.env.QSHIELD_DEBUG === '1'
      ? err?.stack ?? err?.message ?? String(err)
      : err?.message ?? String(err);
  process.stderr.write(
    `qshield: failed to launch the TypeScript entrypoint.\n` +
      `Run \`npm install\` in ${repoRoot} and try again.\n\n` +
      `Underlying error: ${detail}\n` +
      (process.env.QSHIELD_DEBUG === '1' ? '' : `(set QSHIELD_DEBUG=1 for a stack trace)\n`),
  );
  process.exit(1);
}
