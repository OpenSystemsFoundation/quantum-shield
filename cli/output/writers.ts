import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCbomJson, buildFindingsCsv, renderReportPdf } from '../../src/lib/pdf/index.js';
import { buildVexJson } from '../../src/lib/pdf/vex.js';
import type { Report } from '../../src/lib/pdf/types.js';

export type OutputFormat = 'pdf' | 'cbom' | 'vex' | 'csv' | 'json';

export interface WriteOptions {
  outDir: string;
  prefix?: string;
  formats: OutputFormat[];
}

export interface WriteResult {
  path: string;
  format: string;
  bytes: number;
}

export interface WriteFailure {
  format: string;
  error: string;
}

export interface WriteOutputsResult {
  written: WriteResult[];
  failed: WriteFailure[];
}

function makePrefix(report: Report, explicit?: string): string {
  if (explicit) return explicit;
  const stamp = report.scanFinishedAt.replace(/[:.]/g, '-');
  const slug = (report.org.orgName || report.org.orgId).replace(/[^A-Za-z0-9_.-]/g, '_');
  return `qshield-${slug}-${stamp}`;
}

async function writeOne(
  report: Report,
  format: OutputFormat,
  outDir: string,
  prefix: string,
): Promise<WriteResult> {
  if (format === 'pdf') {
    const bytes = await renderReportPdf(report);
    const file = path.join(outDir, `${prefix}.pdf`);
    await writeFile(file, bytes);
    return { path: file, format, bytes: bytes.byteLength };
  }
  if (format === 'cbom') {
    const body = buildCbomJson(report);
    const file = path.join(outDir, `${prefix}.cbom.json`);
    await writeFile(file, body, 'utf8');
    return { path: file, format, bytes: Buffer.byteLength(body, 'utf8') };
  }
  if (format === 'vex') {
    const body = buildVexJson(report);
    const file = path.join(outDir, `${prefix}.vex.json`);
    await writeFile(file, body, 'utf8');
    return { path: file, format, bytes: Buffer.byteLength(body, 'utf8') };
  }
  if (format === 'csv') {
    const body = buildFindingsCsv(report);
    const file = path.join(outDir, `${prefix}.findings.csv`);
    await writeFile(file, body, 'utf8');
    return { path: file, format, bytes: Buffer.byteLength(body, 'utf8') };
  }
  // format === 'json'
  const body = JSON.stringify(report, null, 2);
  const file = path.join(outDir, `${prefix}.report.json`);
  await writeFile(file, body, 'utf8');
  return { path: file, format, bytes: Buffer.byteLength(body, 'utf8') };
}

/**
 * Renders and writes each requested format independently: one format's
 * renderer or write failing must not destroy the other artifacts. Failures
 * come back as {format, error} entries instead of a thrown exception.
 */
export async function writeReportOutputs(report: Report, opts: WriteOptions): Promise<WriteOutputsResult> {
  const written: WriteResult[] = [];
  const failed: WriteFailure[] = [];

  try {
    await mkdir(opts.outDir, { recursive: true });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return {
      written,
      failed: opts.formats.map((format) => ({
        format,
        error: `could not create output directory ${opts.outDir}: ${message}`,
      })),
    };
  }

  const prefix = makePrefix(report, opts.prefix);

  for (const format of opts.formats) {
    try {
      written.push(await writeOne(report, format, opts.outDir, prefix));
    } catch (err) {
      failed.push({ format, error: (err as Error).message ?? String(err) });
    }
  }

  return { written, failed };
}
