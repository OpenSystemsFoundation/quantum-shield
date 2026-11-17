import { stdout } from 'node:process';

const OVERVIEW = `qshield — local post-quantum readiness scanner for Salesforce orgs

USAGE
  qshield <command> [flags]
  qshield help <command>          Help for one command

COMMANDS
  scan        Scan an authenticated org and write PDF + CBOM + VEX + CSV + JSON
  orgs        List orgs authenticated via the Salesforce CLI
  doctor      Check Node, the sf CLI and authenticated orgs before a scan
  version     Print the qshield version (also --version, -v)
  help        Show this message

Every command is non-interactive and accepts --json: stdout then carries
exactly one JSON document (the result, or a qshield.error/v1 envelope), and
progress goes to stderr.

FOR AI AGENTS
  The repo ships an agent skill at .agents/skills/quantumshield/SKILL.md.
  Typical loop:
      qshield doctor --json
      qshield scan --target-org <alias> --json --fail-on high
  then read topFindings and coverage from stdout and the files it lists.
`;

const SCAN = `qshield scan — scan an authenticated org and write report files

USAGE
  qshield scan [flags]

FLAGS
  --target-org, -o <alias|username>    Pick a specific org (else sf's default, which
                                       also honours the SF_TARGET_ORG env var).
                                       Note: lowercase -o. Uppercase -O is --out.
  --api-version <NN.0>                 API version, e.g. 62.0 or v62.0 (default: reuse sf's)
  --out, -O <dir>                      Output directory (default: ./qshield-out).
                                       Note: uppercase -O. Lowercase -o is --target-org.
  --format <list>                      Comma-separated outputs (case-insensitive).
                                       Default: pdf,cbom,vex,csv,json
                                       Accepted: pdf | cbom | vex | csv | json
  --region <list>                      Comma-separated regulatory regions.
                                       Accepted: US, EU, NL, DE, FR, UK, INTL
                                       Scopes the citations shown on each finding to
                                       those jurisdictions (plus international
                                       sources). Every rule runs for every region:
                                       this never changes which findings you get.
  --overlay <list>                     Comma-separated regulatory overlays.
                                       Accepted: gdpr, dora, nis2, eidas2, pci-dss-4,
                                       hipaa, cmmc, swift-csp
  --probe-tls                          Probe NamedCredential / RemoteSite endpoints
                                       for TLS version + hybrid-KEM support. Makes up
                                       to three handshakes per endpoint from this
                                       machine; no request is sent after a handshake.
  --fail-on <severity>                 Exit 4 when any finding is at or above this
                                       severity: critical | high | medium | low.
  --quantum-year <YYYY>                Year a quantum computer is assumed to break
                                       today's public-key crypto (default: 2033).
                                       Findings are ranked act-now / plan / monitor
                                       by data shelf life + fix time vs this year.
  --allow-partial                      Exit 0 even when some categories could not be
                                       fully scanned (coverage 'partial' or 'failed').
                                       For CI pipelines that accept partial coverage.
  --json                               Machine mode: no progress on stderr, one JSON
                                       document on stdout (errors included).
  --quiet, -q                          Suppress per-scanner progress and log lines.
  --help, -h                           Show this message.

OUTPUT
  stdout always carries one JSON result (schema qshield.scan-result/v1) with
  ok, exitCode, org, files, summary, coverage and topFindings (the 10 most
  urgent findings). Full detail is in the *.report.json file it lists.

COVERAGE
  Reports record per-category coverage; categories not marked 'scanned' are
  unverified — zero findings there does not mean that category is clean.

EXAMPLES
  qshield scan                                    # default org, all outputs
  qshield scan -o prod-eu --region NL,EU          # Dutch/EU org, Dutch/EU citations first
  qshield scan --format cbom,vex --probe-tls      # CBOM + VEX + endpoint probing
  qshield scan --json --fail-on high              # agent/CI gate: exit 4 on high+
  qshield scan --allow-partial                    # CI-friendly: partial coverage → exit 0
`;

const ORGS = `qshield orgs — list orgs authenticated via the Salesforce CLI

USAGE
  qshield orgs [--json]

FLAGS
  --json        Print the org list as JSON (alias, username, orgId, type flags,
                isDefaultUsername, connectedStatus) instead of a table.
  --help, -h    Show this message.

Add an org with:  sf org login web --alias <name>
Scratch orgs created with  sf org create scratch  appear here automatically.
`;

const DOCTOR = `qshield doctor — check that this machine is ready to scan

USAGE
  qshield doctor [--target-org <alias>] [--json]

Checks the Node.js version, that the sf CLI is on PATH, which orgs sf is
authenticated to, and (with --target-org, or the default org) that the org is
reachable. Read-only: it never changes sf configuration or the org.

FLAGS
  --target-org, -o <alias|username>    Check this org instead of sf's default.
  --json                               Print the checks as JSON (qshield.doctor/v1).
  --help, -h                           Show this message.

Exit 0 when ready to scan, 10 when sf is missing or no usable org is found.
`;

const VERSION = `qshield version — print the qshield version

USAGE
  qshield version [--json]
  qshield --version
`;

const EXIT_CODES = `
EXIT CODES (stable; scripts and agents may branch on them)
  0     Success. Full coverage ('skipped' categories, features not present in
        the org, still count as success).
  1     Unexpected internal error.
  2     Usage error: unknown command or flag, missing flag value, invalid value.
  3     Partial scan: the report was written, but at least one category has
        coverage status 'partial' or 'failed'. Downgrade to 0 with --allow-partial.
  4     --fail-on threshold met: the report was written and at least one finding
        is at or above the given severity.
  10    Authentication failure (sf CLI missing, unknown org, expired session).
  20    Scan aborted, or every requested output format failed to write.

AUTHENTICATION
  qshield does not register its own Connected App. It reuses the session already
  established by the Salesforce CLI, for example:
      sf org login web --alias <name>          # interactive, run by a human once
      sf org login jwt ...                     # headless / CI
      sf org create scratch ...                # scratch orgs work as-is
  Run 'qshield doctor' to confirm, then point qshield at the org with
  --target-org <alias>.
`;

const TOPICS: Record<string, string> = {
  scan: SCAN,
  orgs: ORGS,
  doctor: DOCTOR,
  version: VERSION,
};

/** Known help topics, for `qshield help <topic>` validation. */
export const HELP_TOPICS = Object.keys(TOPICS);

export async function helpCommand(topic?: string): Promise<number> {
  const body = topic && TOPICS[topic] ? TOPICS[topic] : OVERVIEW;
  stdout.write(body + EXIT_CODES);
  return 0;
}
