import { randomUUID } from 'node:crypto';
import { stderr, stdout } from 'node:process';
import { runScan } from '../../src/lib/scan/engine.js';
import type { ScanEvent } from '../../src/lib/scan/types.js';
import type { CategoryCoverage } from '../../src/lib/pdf/types.js';
import { buildSessionFromSfCli } from '../auth/sfCli.js';
import { writeReportOutputs, type OutputFormat } from '../output/writers.js';
import {
  describeFlags,
  getBool,
  getList,
  getString,
  parseFlagsStrict,
  type FlagSpec,
  type ParsedArgs,
} from '../args.js';
import { NodeTlsProbe } from '../probe/tls.js';
import { GENERATED_OVERLAYS } from '../../src/lib/rules/regulations.generated.js';
import { helpCommand } from './help.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/lib/priority/defaults.js';

const VALID_FORMATS = new Set(['pdf', 'cbom', 'vex', 'csv', 'json']);
const VALID_REGIONS = new Set(['US', 'EU', 'NL', 'DE', 'FR', 'UK', 'INTL']);

const VALID_OVERLAYS: ReadonlySet<string> = new Set(GENERATED_OVERLAYS.map((o) => o.id));

/**
 * Accepts `62`, `62.0`, `v62` or `v62.0` and returns the `NN.0` form the
 * Salesforce REST path needs. Anything else is a usage error: an unvalidated
 * value ends up in the request URL and every category then fails with an
 * opaque 404.
 */
export function normaliseApiVersion(raw: string): string | undefined {
  const match = /^v?(\d{2,3})(?:\.0)?$/i.exec(raw.trim());
  return match ? `${match[1]}.0` : undefined;
}

const SCAN_FLAGS: FlagSpec[] = [
  { name: 'target-org', short: 'o', takesValue: true },
  { name: 'api-version', takesValue: true },
  { name: 'out', short: 'O', takesValue: true },
  { name: 'format', takesValue: true },
  { name: 'region', takesValue: true },
  { name: 'overlay', takesValue: true },
  { name: 'probe-tls' },
  { name: 'quantum-year', takesValue: true },
  { name: 'allow-partial' },
  { name: 'quiet', short: 'q' },
  { name: 'help', short: 'h' },
];

function writeLine(stream: NodeJS.WriteStream, msg: string): void {
  stream.write(`${msg}\n`);
}

function formatScannerLine(progress: {
  category: string;
  label: string;
  status: string;
  assetCount?: number;
  error?: string;
}): string {
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  const status = progress.status.toUpperCase();
  const tail =
    progress.status === 'completed'
      ? `(${progress.assetCount ?? 0} assets)`
      : progress.status === 'failed'
        ? `error: ${progress.error ?? 'unknown'}`
        : progress.status === 'skipped'
          ? `(${progress.error ?? 'not available in this org'})`
          : '';
  return `[${pad(status, 9)}] ${pad(progress.label, 36)} ${tail}`;
}

export interface CoverageAssessment {
  /** Coverage entries with status 'failed' or 'partial'. */
  incomplete: CategoryCoverage[];
  /** Coverage entries with status 'skipped'. */
  skipped: CategoryCoverage[];
  /** 3 when coverage is incomplete and not downgraded via --allow-partial. */
  exitCode: 0 | 3;
}

/**
 * Exit-code policy for report coverage: any 'failed' or 'partial' category
 * means the scan is incomplete (exit 3) unless the caller opted into partial
 * coverage. 'skipped' categories (feature not present in the org) are fine.
 */
export function evaluateCoverage(coverage: CategoryCoverage[], allowPartial: boolean): CoverageAssessment {
  // The data-sensitivity pass only feeds prioritisation (it falls back to
  // best-practice defaults); it never hides a cryptographic finding.
  const incomplete = coverage.filter(
    (c) => c.id !== 'data-profile' && (c.status === 'failed' || c.status === 'partial'),
  );
  const skipped = coverage.filter((c) => c.status === 'skipped');
  return {
    incomplete,
    skipped,
    exitCode: incomplete.length > 0 && !allowPartial ? 3 : 0,
  };
}

export async function scanCommand(args: ParsedArgs): Promise<number> {
  const parsed = parseFlagsStrict(args.rest, SCAN_FLAGS);
  // `qshield scan --help` is a request for help, not a usage error.
  if (getBool(parsed.flags, 'help')) {
    return helpCommand();
  }
  for (const warning of parsed.warnings) {
    writeLine(stderr, `warn: ${warning}`);
  }
  const usageErrors = [...parsed.errors];
  for (const extra of parsed.positional) {
    usageErrors.push(`unexpected argument: ${extra}`);
  }
  if (usageErrors.length > 0) {
    for (const error of usageErrors) writeLine(stderr, `error: ${error}`);
    writeLine(stderr, `valid scan flags: ${describeFlags(SCAN_FLAGS)}`);
    writeLine(stderr, 'run `qshield help` for details');
    return 2;
  }
  const flags = parsed.flags;

  const formats = getList(flags, 'format', ['pdf', 'cbom', 'vex', 'csv', 'json']).map((f) =>
    f.toLowerCase(),
  );
  if (formats.length === 0) {
    writeLine(stderr, 'error: --format requires at least one value (pdf, cbom, vex, csv, json)');
    return 2;
  }
  for (const f of formats) {
    if (!VALID_FORMATS.has(f)) {
      writeLine(stderr, `unknown --format value: ${f}. Valid: pdf, cbom, vex, csv, json`);
      return 2;
    }
  }

  const regions = getList(flags, 'region', []);
  for (const r of regions) {
    if (!VALID_REGIONS.has(r.toUpperCase())) {
      writeLine(stderr, `unknown --region value: ${r}. Valid: US, EU, NL, DE, FR, UK, INTL`);
      return 2;
    }
  }

  const overlays = getList(flags, 'overlay', []).map((o) => o.toLowerCase());
  for (const o of overlays) {
    if (!VALID_OVERLAYS.has(o)) {
      writeLine(stderr, `unknown --overlay value: ${o}. Valid: ${[...VALID_OVERLAYS].join(', ')}`);
      return 2;
    }
  }
  const targetOrg = getString(flags, 'target-org');
  const rawApiVersion = getString(flags, 'api-version');
  const apiVersion = rawApiVersion === undefined ? undefined : normaliseApiVersion(rawApiVersion);
  if (rawApiVersion !== undefined && apiVersion === undefined) {
    writeLine(stderr, `invalid --api-version value: ${rawApiVersion}. Expected a version such as 62.0 or v62.0`);
    return 2;
  }
  const rawQuantumYear = getString(flags, 'quantum-year');
  const quantumYear = rawQuantumYear === undefined ? DEFAULT_ASSUMPTIONS.quantumYear : Number(rawQuantumYear);
  if (!/^\d{4}$/.test(rawQuantumYear ?? '2033') || quantumYear < 2024 || quantumYear > 2100) {
    writeLine(stderr, `invalid --quantum-year value: ${rawQuantumYear}. Expected a year between 2024 and 2100`);
    return 2;
  }
  const outDir = getString(flags, 'out') ?? './qshield-out';
  const probe = getBool(flags, 'probe-tls');
  const allowPartial = getBool(flags, 'allow-partial');
  const quiet = getBool(flags, 'quiet');

  writeLine(stderr, `qshield: loading session from sf CLI${targetOrg ? ` (target-org=${targetOrg})` : ''}…`);

  let session;
  try {
    session = await buildSessionFromSfCli({ targetOrg, apiVersion });
  } catch (err) {
    writeLine(stderr, `auth failed: ${(err as Error).message}`);
    return 10;
  }

  writeLine(
    stderr,
    `qshield: connected to ${session.org.orgName} (${session.org.orgId}) as ${session.org.username ?? session.org.userId}`,
  );

  const scanId = randomUUID();
  const regionsUpper = regions.map((r) => r.toUpperCase());

  const emit = (event: ScanEvent) => {
    if (quiet) return;
    if (event.type === 'scanner-progress' && event.progress.status !== 'pending') {
      writeLine(stderr, formatScannerLine(event.progress));
    } else if (event.type === 'log') {
      writeLine(stderr, `${event.level}: ${event.message}`);
    } else if (event.type === 'failed') {
      writeLine(stderr, `scan failed: ${event.error}`);
    }
  };

  const started = Date.now();
  let report;
  try {
    report = await runScan(
      {
        scanId,
        session,
        overlays,
        regions: regionsUpper,
        probeTls: probe,
        generatorMode: 'cli',
        riskAssumptions: { ...DEFAULT_ASSUMPTIONS, quantumYear },
      },
      emit,
      probe ? new NodeTlsProbe() : undefined,
    );
  } catch (err) {
    writeLine(stderr, `scan aborted: ${(err as Error).message}`);
    return 20;
  }

  const outputs = await writeReportOutputs(report, {
    outDir,
    formats: formats as OutputFormat[],
  });
  for (const failure of outputs.failed) {
    writeLine(stderr, `error: failed to write ${failure.format} output: ${failure.error}`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  writeLine(
    stderr,
    `qshield: scan complete in ${elapsed}s · ${report.findings.length} findings · ${report.summary.hndlFindings} HNDL-exposed`,
  );

  const coverage = evaluateCoverage(report.coverage, allowPartial);
  if (!quiet) {
    for (const c of coverage.skipped) {
      writeLine(stderr, `info: ${c.label} skipped${c.detail ? ` (${c.detail})` : ''}`);
    }
  }
  if (coverage.incomplete.length > 0) {
    writeLine(stderr, 'qshield: coverage incomplete — the following categories could not be fully scanned:');
    for (const c of coverage.incomplete) {
      writeLine(stderr, `  - ${c.label}: ${c.status}${c.detail ? ` (${c.detail})` : ''}`);
    }
    if (allowPartial) {
      writeLine(stderr, 'qshield: --allow-partial set; treating partial coverage as success (exit 0)');
    } else {
      writeLine(stderr, 'qshield: exiting 3 (partial scan). Pass --allow-partial to accept partial coverage.');
    }
  }

  writeLine(
    stdout,
    JSON.stringify(
      { scanId, outDir, files: outputs.written, failedOutputs: outputs.failed, summary: report.summary },
      null,
      2,
    ),
  );

  if (outputs.written.length === 0) {
    writeLine(stderr, 'qshield: all requested output formats failed to write');
    return 20;
  }

  return coverage.exitCode;
}
