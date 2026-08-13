import { describe, expect, it } from 'vitest';
import {
  describeFlags,
  getBool,
  getList,
  getString,
  parseArgs,
  parseFlagsStrict,
  type FlagSpec,
} from './args.js';

const SPECS: FlagSpec[] = [
  { name: 'target-org', short: 'o', takesValue: true },
  { name: 'out', short: 'O', takesValue: true },
  { name: 'format', takesValue: true },
  { name: 'quiet', short: 'q' },
  { name: 'probe-tls' },
];

describe('parseArgs', () => {
  it('extracts the command and keeps the raw rest tokens', () => {
    const parsed = parseArgs(['scan', '--target-org', 'prod', '-q']);
    expect(parsed.command).toBe('scan');
    expect(parsed.rest).toEqual(['--target-org', 'prod', '-q']);
  });

  it('treats a leading flag as the help command', () => {
    const parsed = parseArgs(['--help']);
    expect(parsed.command).toBe('help');
  });
});

describe('parseFlagsStrict', () => {
  it('parses long, short, equals and boolean forms, keyed by long name', () => {
    const result = parseFlagsStrict(['-o', 'prod', '--format=pdf,csv', '-q', '--probe-tls'], SPECS);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual({
      'target-org': 'prod',
      format: 'pdf,csv',
      quiet: true,
      'probe-tls': true,
    });
    expect(getString(result.flags, 'target-org')).toBe('prod');
    expect(getBool(result.flags, 'quiet')).toBe(true);
    expect(getList(result.flags, 'format')).toEqual(['pdf', 'csv']);
  });

  it('rejects unknown flags with a did-you-mean hint', () => {
    const result = parseFlagsStrict(['--frmat', 'pdf'], SPECS);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/unknown flag --frmat/);
    expect(result.errors[0]).toMatch(/did you mean --format\?/);
    // The orphaned value is reported back as a positional.
    expect(result.positional).toEqual(['pdf']);
  });

  it('rejects unknown flags without a hint when nothing is close', () => {
    const result = parseFlagsStrict(['--helpish-invalid-flag'], SPECS);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/unknown flag --helpish-invalid-flag/);
    expect(result.errors[0]).not.toMatch(/did you mean/);
  });

  it('rejects unknown short flags', () => {
    const result = parseFlagsStrict(['-z'], SPECS);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/unknown flag -z/);
  });

  it('errors when a value flag is missing its value at the end of the args', () => {
    const result = parseFlagsStrict(['--target-org'], SPECS);
    expect(result.errors).toEqual(['flag --target-org requires a value']);
    expect(result.flags['target-org']).toBeUndefined();
  });

  it('errors when a value flag is followed by another flag', () => {
    const result = parseFlagsStrict(['--target-org', '--quiet'], SPECS);
    expect(result.errors).toEqual(['flag --target-org requires a value']);
    // --quiet still parses; it must not be swallowed as the value.
    expect(result.flags.quiet).toBe(true);
  });

  it('errors on an empty equals-value', () => {
    const result = parseFlagsStrict(['--format='], SPECS);
    expect(result.errors).toEqual(['flag --format requires a value']);
  });

  it('warns on repeated value flags and keeps the last value', () => {
    const result = parseFlagsStrict(['-o', 'first', '--target-org', 'second'], SPECS);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/--target-org given multiple times/);
    expect(result.warnings[0]).toMatch(/'second'/);
    expect(result.flags['target-org']).toBe('second');
  });

  it('treats short flags as case-sensitive (-o vs -O)', () => {
    const result = parseFlagsStrict(['-o', 'prod', '-O', './out'], SPECS);
    expect(result.errors).toEqual([]);
    expect(result.flags['target-org']).toBe('prod');
    expect(result.flags.out).toBe('./out');
  });

  it('passes everything after -- through as positional args', () => {
    const result = parseFlagsStrict(['--', '--not-a-flag'], SPECS);
    expect(result.errors).toEqual([]);
    expect(result.positional).toEqual(['--not-a-flag']);
  });
});

describe('describeFlags', () => {
  it('lists long names with their short aliases', () => {
    expect(describeFlags(SPECS)).toBe('--target-org/-o, --out/-O, --format, --quiet/-q, --probe-tls');
  });
});
