/**
 * Property-based fuzz tests (fast-check) for the findings CSV. Titles, asset
 * names and identifiers come from the scanned org, so any string must survive
 * a round trip through a standard CSV parser and never start a cell with a
 * spreadsheet formula trigger.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFindingsCsv } from './csv.js';
import type { Finding, Report } from './types.js';

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF rows). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function mkFinding(title: string, name: string, identifier: string): Finding {
  return {
    id: 'F-1',
    category: 'certificates',
    severity: 'high',
    regulatoryStatus: 'advisory',
    migrationPosture: 'advisory',
    effort: 'low',
    hndlExposure: false,
    title,
    asset: { kind: 'certificate', name, identifier },
    currentCrypto: 'RSA-2048',
    recommendedReplacement: 'ML-DSA',
    rationale: 'r',
    citations: [],
  };
}

function mkReport(findings: Finding[]): Report {
  return { findings } as unknown as Report;
}

const cell = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc
    .array(fc.constantFrom('=', '+', '-', '@', '\t', '\r', '\n', '"', ',', "'", 'a', ' '), { maxLength: 12 })
    .map((p) => p.join('')),
);

describe('buildFindingsCsv (fuzz)', () => {
  it('round-trips any text and never lets a cell start with a formula trigger', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(cell, cell, cell), { minLength: 1, maxLength: 5 }), (cells) => {
        const csv = buildFindingsCsv(mkReport(cells.map(([t, n, id]) => mkFinding(t, n, id))));
        const rows = parseCsv(csv);
        expect(rows).toHaveLength(cells.length + 1);
        const header = rows[0];
        const col = (name: string) => header.indexOf(name);
        cells.forEach(([title, name, identifier], i) => {
          const row = rows[i + 1];
          expect(row).toHaveLength(header.length);
          for (const [column, original] of [
            ['title', title],
            ['assetName', name],
            ['assetIdentifier', identifier],
          ] as const) {
            const value = row[col(column)];
            expect(FORMULA_TRIGGER.test(value)).toBe(false);
            expect(value).toBe(FORMULA_TRIGGER.test(original) ? `'${original}` : original);
          }
        });
      }),
      { numRuns: 2000 },
    );
  });
});
