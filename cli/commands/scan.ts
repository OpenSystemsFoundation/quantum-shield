import { randomUUID } from 'node:crypto';
import { stderr } from 'node:process';
import { runScan } from '../../src/lib/scan/engine.js';
import type { ScanEvent } from '../../src/lib/scan/types.js';
import type { CategoryCoverage, Finding, Report, Severity } from '../../src/lib/pdf/types.js';
import { buildSessionFromSfCli } from '../auth/sfCli.js';
import { EXIT } from '../exitCodes.js';
import { writeJson, writeJsonError } from '../output/json.js';
import type { WriteFailure, WriteResult } from '../output/writers.js';
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
  { name: 'fail-on', takesValue: true },
  { name: 'json' },
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

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

function severityRank(s: Severity): number {
  const i = SEVERITY_ORDER.indexOf(s);
  return i < 0 ? SEVERITY_ORDER.length : i;
}

export function parseSeverity(raw: string): Severity | undefined {
  const v = raw.trim().toLowerCase();
  return (SEVERITY_ORDER as string[]).includes(v) ? (v as Severity) : undefined;
}

/** Findings at or above `threshold` (critical is the highest). */
export function findingsAtOrAbove(findings: Finding[], threshold: Severity): Finding[] {
  const limit = severityRank(threshold);
  return findings.filter((f) => severityRank(f.severity) <= limit);
}

/**
 * Most urgent findings first: by explicit priority rank when the report has
 * one, then severity, then harvest-now-decrypt-later exposure, then deadline.
 */
export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const pa = a.priority?.rank;
    const pb = b.priority?.rank;
    if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb;
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    if (a.hndlExposure !== b.hndlExposure) return a.hndlExposure ? -1 : 1;
    return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
  });
}

export const TOP_FINDINGS_LIMIT = 10;

export interface ScanResultInput {
  report: Report;
  scanId: string;
  outDir: string;
  written: WriteResult[];
  failed: WriteFailure[];
  coverage: CoverageAssessment;
  exitCode: number;
  failOn?: Severity;
}

/**
 * The single JSON document `qshield scan` prints on stdout. Schema
 * `qshield.scan-result/v1`: fields may be added, never renamed or removed.
 * The original keys (scanId, outDir, files, failedOutputs, summary) are kept
 * as they were for existing consumers.
 */
export function buildScanResult(input: ScanResultInput) {
  const { report, coverage, failOn } = input;
  const atThreshold = failOn ? findingsAtOrAbove(report.findings, failOn).length : undefined;
  return {
    schema: 'qshield.scan-result/v1' as const,
    ok: input.exitCode === EXIT.OK,
    exitCode: input.exitCode,
    scanId: input.scanId,
    org: {
      orgId: report.org.orgId,
      orgName: report.org.orgName,
      orgType: report.org.orgType,
      instanceUrl: report.org.instanceUrl,
      apiVersion: report.org.apiVersion,
    },
    outDir: input.outDir,
    files: input.written,
    failedOutputs: input.failed,
    summary: report.summary,
    coverage: {
      complete: coverage.incomplete.length === 0,
      incomplete: coverage.incomplete.map((c) => ({ id: c.id, label: c.label, status: c.status, detail: c.detail ?? null })),
      skipped: coverage.skipped.map((c) => ({ id: c.id, label: c.label, detail: c.detail ?? null })),
    },
    failOn: failOn ? { severity: failOn, matchingFindings: atThreshold } : null,
    topFindings: rankFindings(report.findings)
      .slice(0, TOP_FINDINGS_LIMIT)
      .map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        asset: { kind: f.asset.kind, name: f.asset.name },
        currentCrypto: f.currentCrypto,
        recommendedReplacement: f.recommendedReplacement,
        hndlExposure: f.hndlExposure,
        migrationPosture: f.migrationPosture,
        effort: f.effort,
        deadline: f.deadline ?? null,
        ...(f.priority ? { priority: f.priority } : {}),
      })),
  };
}

export async function scanCommand(args: ParsedArgs): Promise<number> {
  const parsed = parseFlagsStrict(args.rest, SCAN_FLAGS);
  // `qshield scan --help` is a request for help, not a usage error.
  if (getBool(parsed.flags, 'help')) {
    return helpCommand('scan');
  }
  const json = getBool(parsed.flags, 'json');
  /** Usage error: JSON envelope on stdout in --json mode, text on stderr otherwise. */
  const usage = (message: string, details?: string[]): number => {
    if (json) {
      return writeJsonError(EXIT.USAGE, 'USAGE', message, {
        details,
        hint: `valid scan flags: ${describeFlags(SCAN_FLAGS)}. Run 'qshield help scan' for details.`,
      });
    }
    for (const line of details ?? [message]) writeLine(stderr, line.startsWith('unknown --') || line.startsWith('invalid --') ? line : `error: ${line}`);
    return EXIT.USAGE;
  };
  for (const warning of parsed.warnings) {
    if (!json) writeLine(stderr, `warn: ${warning}`);
  }
  const usageErrors = [...parsed.errors];
  for (const extra of parsed.positional) {
    usageErrors.push(`unexpected argument: ${extra}`);
  }
  if (usageErrors.length > 0) {
    if (json) return usage(usageErrors[0], usageErrors);
    for (const error of usageErrors) writeLine(stderr, `error: ${error}`);
    writeLine(stderr, `valid scan flags: ${describeFlags(SCAN_FLAGS)}`);
    writeLine(stderr, 'run `qshield help scan` for details');
    return EXIT.USAGE;
  }
  const flags = parsed.flags;

  const formats = getList(flags, 'format', ['pdf', 'cbom', 'vex', 'csv', 'json']).map((f) =>
    f.toLowerCase(),
  );
  if (formats.length === 0) {
    return usage('--format requires at least one value (pdf, cbom, vex, csv, json)');
  }
  for (const f of formats) {
    if (!VALID_FORMATS.has(f)) {
      return usage(`unknown --format value: ${f}. Valid: pdf, cbom, vex, csv, json`);
    }
  }

  const regions = getList(flags, 'region', []);
  for (const r of regions) {
    if (!VALID_REGIONS.has(r.toUpperCase())) {
      return usage(`unknown --region value: ${r}. Valid: US, EU, NL, DE, FR, UK, INTL`);
    }
  }

  const overlays = getList(flags, 'overlay', []).map((o) => o.toLowerCase());
  for (const o of overlays) {
    if (!VALID_OVERLAYS.has(o)) {
      return usage(`unknown --overlay value: ${o}. Valid: ${[...VALID_OVERLAYS].join(', ')}`);
    }
  }
  const targetOrg = getString(flags, 'target-org');
  const rawApiVersion = getString(flags, 'api-version');
  const apiVersion = rawApiVersion === undefined ? undefined : normaliseApiVersion(rawApiVersion);
  if (rawApiVersion !== undefined && apiVersion === undefined) {
    return usage(`invalid --api-version value: ${rawApiVersion}. Expected a version such as 62.0 or v62.0`);
  }
  const rawFailOn = getString(flags, 'fail-on');
  const failOn = rawFailOn === undefined ? undefined : parseSeverity(rawFailOn);
  if (rawFailOn !== undefined && failOn === undefined) {
    return usage(`invalid --fail-on value: ${rawFailOn}. Valid: critical, high, medium, low`);
  }
  const rawQuantumYear = getString(flags, 'quantum-year');
  const quantumYear = rawQuantumYear === undefined ? DEFAULT_ASSUMPTIONS.quantumYear : Number(rawQuantumYear);
  if (!/^\d{4}$/.test(rawQuantumYear ?? '2033') || quantumYear < 2024 || quantumYear > 2100) {
    return usage(`invalid --quantum-year value: ${rawQuantumYear}. Expected a year between 2024 and 2100`);
  }
  const outDir = getString(flags, 'out') ?? './qshield-out';
  const probe = getBool(flags, 'probe-tls');
  const allowPartial = getBool(flags, 'allow-partial');
  // --json implies --quiet: an agent reads stdout and should not have to
  // filter progress noise out of stderr.
  const quiet = getBool(flags, 'quiet') || json;
  /** Status lines that are useful to a human but noise for a machine. */
  const status = (msg: string) => {
    if (!json) writeLine(stderr, msg);
  };

  status(`qshield: loading session from sf CLI${targetOrg ? ` (target-org=${targetOrg})` : ''}…`);

  let session;
  try {
    session = await buildSessionFromSfCli({ targetOrg, apiVersion });
  } catch (err) {
    const message = (err as Error).message;
    if (json) {
      const missing = /not found on PATH/.test(message);
      return writeJsonError(EXIT.AUTH, missing ? 'SF_CLI_MISSING' : 'AUTH_FAILED', message, {
        hint: missing
          ? 'Install the Salesforce CLI (npm install -g @salesforce/cli), then ask a human to run: sf org login web --alias <name>'
          : "Run 'qshield doctor --json' to see which orgs are authenticated. Re-authenticating (sf org login web) needs a human.",
      });
    }
    writeLine(stderr, `auth failed: ${message}`);
    return EXIT.AUTH;
  }

  status(
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
    const message = (err as Error).message;
    if (json) return writeJsonError(EXIT.SCAN_FAILED, 'SCAN_ABORTED', `scan aborted: ${message}`);
    writeLine(stderr, `scan aborted: ${message}`);
    return EXIT.SCAN_FAILED;
  }

  const outputs = await writeReportOutputs(report, {
    outDir,
    formats: formats as OutputFormat[],
  });
  for (const failure of outputs.failed) {
    if (!json) writeLine(stderr, `error: failed to write ${failure.format} output: ${failure.error}`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  status(
    `qshield: scan complete in ${elapsed}s · ${report.findings.length} findings · ${report.summary.hndlFindings} HNDL-exposed`,
  );

  const coverage = evaluateCoverage(report.coverage, allowPartial);
  if (!quiet) {
    for (const c of coverage.skipped) {
      writeLine(stderr, `info: ${c.label} skipped${c.detail ? ` (${c.detail})` : ''}`);
    }
  }
  if (coverage.incomplete.length > 0 && !json) {
    writeLine(stderr, 'qshield: coverage incomplete — the following categories could not be fully scanned:');
    for (const c of coverage.incomplete) {
      writeLine(stderr, `  - ${c.label}: ${c.status}${c.detail ? ` (${c.detail})` : ''}`);
    }
    if (allowPartial) {
      writeLine(stderr, 'qshield: --allow-partial set; partial coverage is not treated as a failure');
    } else {
      writeLine(stderr, 'qshield: partial scan (exit 3 unless --fail-on applies). Pass --allow-partial to accept partial coverage.');
    }
  }

  const atThreshold = failOn ? findingsAtOrAbove(report.findings, failOn) : [];
  let exitCode: number;
  if (outputs.written.length === 0) {
    status('qshield: all requested output formats failed to write');
    exitCode = EXIT.SCAN_FAILED;
  } else if (atThreshold.length > 0) {
    status(`qshield: exiting 4 — ${atThreshold.length} finding(s) at or above --fail-on ${failOn}`);
    exitCode = EXIT.FINDINGS_AT_THRESHOLD;
  } else {
    exitCode = coverage.exitCode;
  }

  writeJson(
    buildScanResult({
      report,
      scanId,
      outDir,
      written: outputs.written,
      failed: outputs.failed,
      coverage,
      exitCode,
      failOn,
    }),
  );
  return exitCode;
}
