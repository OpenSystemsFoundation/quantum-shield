import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCbomJson, buildFindingsCsv, renderReportPdf } from '../../src/lib/pdf/index.js';
import { buildVexJson } from '../../src/lib/pdf/vex.js';
import type { Report } from '../../src/lib/pdf/types.js';

export interface WriteOptions {
  outDir: string;
  prefix?: string;
  formats: Array<'pdf' | 'cbom' | 'vex' | 'csv' | 'json'>;
}

export interface WriteResult {
  path: string;
  format: string;
  bytes: number;
}

function makePrefix(report: Report, explicit?: string): string {
  if (explicit) return explicit;
  const stamp = report.scanFinishedAt.replace(/[:.]/g, '-');
  const slug = (report.org.orgName || report.org.orgId).replace(/[^A-Za-z0-9_.-]/g, '_');
  return `qshield-${slug}-${stamp}`;
}

export async function writeReportOutputs(report: Report, opts: WriteOptions): Promise<WriteResult[]> {
  await mkdir(opts.outDir, { recursive: true });
  const prefix = makePrefix(report, opts.prefix);
  const results: WriteResult[] = [];

  for (const format of opts.formats) {
    if (format === 'pdf') {
      const bytes = await renderReportPdf(report);
      const file = path.join(opts.outDir, `${prefix}.pdf`);
      await writeFile(file, bytes);
      results.push({ path: file, format, bytes: bytes.byteLength });
    } else if (format === 'cbom') {
      const body = buildCbomJson(report);
      const file = path.join(opts.outDir, `${prefix}.cbom.json`);
      await writeFile(file, body, 'utf8');
      results.push({ path: file, format, bytes: Buffer.byteLength(body, 'utf8') });
    } else if (format === 'vex') {
      const body = buildVexJson(report);
      const file = path.join(opts.outDir, `${prefix}.vex.json`);
      await writeFile(file, body, 'utf8');
      results.push({ path: file, format, bytes: Buffer.byteLength(body, 'utf8') });
    } else if (format === 'csv') {
      const body = buildFindingsCsv(report);
      const file = path.join(opts.outDir, `${prefix}.findings.csv`);
      await writeFile(file, body, 'utf8');
      results.push({ path: file, format, bytes: Buffer.byteLength(body, 'utf8') });
    } else if (format === 'json') {
      const body = JSON.stringify(report, null, 2);
      const file = path.join(opts.outDir, `${prefix}.report.json`);
      await writeFile(file, body, 'utf8');
      results.push({ path: file, format, bytes: Buffer.byteLength(body, 'utf8') });
    }
  }

  return results;
}
