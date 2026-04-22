import { randomUUID } from 'node:crypto';
import { stderr, stdout } from 'node:process';
import { runScan } from '../../src/lib/scan/engine.js';
import type { ScanEvent } from '../../src/lib/scan/types.js';
import { buildSessionFromSfCli } from '../auth/sfCli.js';
import { writeReportOutputs } from '../output/writers.js';
import { getBool, getList, getString, type ParsedArgs } from '../args.js';
import { NodeTlsProbe } from '../probe/tls.js';

const VALID_FORMATS = new Set(['pdf', 'cbom', 'vex', 'csv', 'json']);
const VALID_REGIONS = new Set(['US', 'EU', 'NL', 'DE', 'FR', 'UK', 'INTL']);

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
        : '';
  return `[${pad(status, 9)}] ${pad(progress.label, 36)} ${tail}`;
}

export async function scanCommand(args: ParsedArgs): Promise<number> {
  const formats = getList(args.flags, 'format', ['pdf', 'cbom', 'vex', 'csv', 'json']);
  for (const f of formats) {
    if (!VALID_FORMATS.has(f)) {
      writeLine(stderr, `unknown --format value: ${f}`);
      return 2;
    }
  }

  const regions = getList(args.flags, 'region', []);
  for (const r of regions) {
    if (!VALID_REGIONS.has(r.toUpperCase())) {
      writeLine(stderr, `unknown --region value: ${r}. Valid: US, EU, NL, DE, FR, UK, INTL`);
      return 2;
    }
  }

  const overlays = getList(args.flags, 'overlay', []);
  const targetOrg = getString(args.flags, 'target-org', 'o');
  const apiVersion = getString(args.flags, 'api-version');
  const outDir = getString(args.flags, 'out', 'O') ?? './qshield-out';
  const probe = getBool(args.flags, 'probe-tls');
  const quiet = getBool(args.flags, 'quiet', 'q');

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
    if (event.type === 'scanner-progress' && (event.progress.status === 'running' || event.progress.status === 'completed' || event.progress.status === 'failed')) {
      writeLine(stderr, formatScannerLine(event.progress));
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
      },
      emit,
      probe ? new NodeTlsProbe() : undefined,
    );
  } catch (err) {
    writeLine(stderr, `scan aborted: ${(err as Error).message}`);
    return 20;
  }

  const results = await writeReportOutputs(report, {
    outDir,
    formats: formats as Array<'pdf' | 'cbom' | 'vex' | 'csv' | 'json'>,
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  writeLine(
    stderr,
    `qshield: scan complete in ${elapsed}s · ${report.findings.length} findings · ${report.summary.hndlFindings} HNDL-exposed`,
  );
  writeLine(stdout, JSON.stringify({ scanId, outDir, files: results, summary: report.summary }, null, 2));
  return 0;
}
