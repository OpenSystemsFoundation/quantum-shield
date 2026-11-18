/**
 * Property-based fuzz tests (fast-check) for the Apex source scanner. Apex
 * bodies come from the org being scanned, so the parser must cope with any
 * input: never throw, never hang, and never move code onto another line.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanApexSource, stripApexComments } from './scanners.js';

/** Strings biased towards the tokens the comment/string state machine cares about. */
const apexish = fc
  .array(
    fc.oneof(
      fc.constantFrom('/', '*', '//', '/*', '*/', "'", '\\', '\n', ' ', 'Crypto.', '(', ')', ',', 'Blob.valueOf(', "'AES256'"),
      fc.constantFrom('generateDigest', 'generateMac', 'sign', 'encrypt', 'generateAesKey', 'SHA1', 'MD5', '128', 'key'),
      fc.string({ maxLength: 8 }),
    ),
    { maxLength: 60 },
  )
  .map((parts) => parts.join(''));

const anyBody = fc.oneof(apexish, fc.string({ maxLength: 400 }), fc.string({ unit: 'binary', maxLength: 200 }));

describe('stripApexComments (fuzz)', () => {
  it('keeps length and every newline, and only ever blanks characters', () => {
    fc.assert(
      fc.property(anyBody, (body) => {
        const out = stripApexComments(body);
        expect(out.length).toBe(body.length);
        for (let i = 0; i < body.length; i += 1) {
          if (body[i] === '\n') expect(out[i]).toBe('\n');
          if (out[i] !== body[i]) expect(out[i]).toBe(' ');
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('removes nothing from code that has no comment openers', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }).filter((s) => !s.includes('/')), (body) => {
        expect(stripApexComments(body)).toBe(body);
      }),
    );
  });
});

describe('scanApexSource (fuzz)', () => {
  it('never throws and reports locations inside the source', () => {
    fc.assert(
      fc.property(anyBody, (body) => {
        const lines = body.split('\n').length;
        const assets = scanApexSource({ id: '01p000000000001', fileName: 'Fuzz.cls', body });
        for (const asset of assets) {
          expect(asset.kind).toBe('apex-call');
          const line = Number(asset.location?.split(':').pop());
          expect(Number.isInteger(line)).toBe(true);
          expect(line).toBeGreaterThanOrEqual(1);
          expect(line).toBeLessThanOrEqual(lines);
        }
        expect(new Set(assets.map((a) => a.identifier)).size).toBe(assets.length);
      }),
      { numRuns: 2000 },
    );
  });
});
