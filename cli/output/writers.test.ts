import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  renderReportPdf: vi.fn(),
  buildCbomJson: vi.fn(),
  buildFindingsCsv: vi.fn(),
  buildVexJson: vi.fn(),
}));

vi.mock('../../src/lib/pdf/index.js', () => ({
  renderReportPdf: pdfMocks.renderReportPdf,
  buildCbomJson: pdfMocks.buildCbomJson,
  buildFindingsCsv: pdfMocks.buildFindingsCsv,
}));

vi.mock('../../src/lib/pdf/vex.js', () => ({
  buildVexJson: pdfMocks.buildVexJson,
}));

import { writeReportOutputs, type OutputFormat } from './writers.js';
import type { Report } from '../../src/lib/pdf/types.js';

const ALL_FORMATS: OutputFormat[] = ['pdf', 'cbom', 'vex', 'csv', 'json'];

const report = {
  scanFinishedAt: '2026-08-13T10:00:00.000Z',
  org: { orgName: 'acme', orgId: '00D000000000001' },
} as unknown as Report;

async function makeOutDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'qshield-writers-'));
}

beforeEach(() => {
  pdfMocks.renderReportPdf.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  pdfMocks.buildCbomJson.mockReset().mockReturnValue('{"cbom":true}');
  pdfMocks.buildFindingsCsv.mockReset().mockReturnValue('id,title\n');
  pdfMocks.buildVexJson.mockReset().mockReturnValue('{"vex":true}');
});

describe('writeReportOutputs', () => {
  it('writes every requested format and reports per-file results', async () => {
    const outDir = await makeOutDir();
    const outcome = await writeReportOutputs(report, { outDir, formats: ALL_FORMATS });

    expect(outcome.failed).toEqual([]);
    expect(outcome.written.map((w) => w.format)).toEqual(ALL_FORMATS);
    for (const w of outcome.written) {
      expect(w.bytes).toBeGreaterThan(0);
      expect(path.dirname(w.path)).toBe(outDir);
    }
    const files = await readdir(outDir);
    expect(files).toHaveLength(ALL_FORMATS.length);
  });

  it('keeps writing the other formats when one renderer rejects', async () => {
    pdfMocks.renderReportPdf.mockRejectedValue(new Error('pdf render exploded'));
    const outDir = await makeOutDir();
    const outcome = await writeReportOutputs(report, { outDir, formats: ALL_FORMATS });

    expect(outcome.failed).toEqual([{ format: 'pdf', error: 'pdf render exploded' }]);
    expect(outcome.written.map((w) => w.format)).toEqual(['cbom', 'vex', 'csv', 'json']);
    const files = await readdir(outDir);
    expect(files).toHaveLength(4);
    expect(files.some((f) => f.endsWith('.pdf'))).toBe(false);
  });

  it('isolates synchronous builder throws too', async () => {
    pdfMocks.buildCbomJson.mockImplementation(() => {
      throw new Error('cbom builder exploded');
    });
    const outDir = await makeOutDir();
    const outcome = await writeReportOutputs(report, { outDir, formats: ALL_FORMATS });

    expect(outcome.failed).toEqual([{ format: 'cbom', error: 'cbom builder exploded' }]);
    expect(outcome.written.map((w) => w.format)).toEqual(['pdf', 'vex', 'csv', 'json']);
  });

  it('fails every format when the output directory cannot be created', async () => {
    const parent = await makeOutDir();
    const blocker = path.join(parent, 'not-a-dir');
    await writeFile(blocker, 'occupied', 'utf8');

    const outcome = await writeReportOutputs(report, {
      outDir: path.join(blocker, 'nested'),
      formats: ALL_FORMATS,
    });

    expect(outcome.written).toEqual([]);
    expect(outcome.failed).toHaveLength(ALL_FORMATS.length);
    for (const failure of outcome.failed) {
      expect(failure.error).toMatch(/could not create output directory/);
    }
  });
});
