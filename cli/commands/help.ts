import { stdout } from 'node:process';

const HELP = `qshield — local post-quantum readiness scanner for Salesforce orgs

USAGE
  qshield <command> [flags]

COMMANDS
  scan        Scan an authenticated org and write PDF + CBOM + VEX + CSV + JSON
  orgs        List orgs authenticated via the Salesforce CLI
  help        Show this message

SCAN FLAGS
  --target-org, -o <alias|username>    Pick a specific org (else uses sf's default).
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
  --allow-partial                      Exit 0 even when some categories could not be
                                       fully scanned (coverage 'partial' or 'failed').
                                       For CI pipelines that accept partial coverage.
  --quiet, -q                          Suppress per-scanner progress and log lines.
  --help, -h                           Show this message.

ORGS FLAGS
  --json                               Print raw \`sf org list\` JSON instead of the
                                       human-readable table.

EXIT CODES
  0     Success. The scan ran with full coverage ('skipped' categories — features
        not present in the org — still count as success).
  2     Usage error: unknown command or flag, missing flag value, invalid value.
  3     Partial scan: the report was written, but at least one category has
        coverage status 'partial' or 'failed'. Downgrade to 0 with --allow-partial.
  10    Authentication failure (sf CLI missing, unknown org, expired session).
  20    Scan aborted, or every requested output format failed to write.

COVERAGE
  Reports record per-category coverage; categories not marked 'scanned' are
  unverified — zero findings there does not mean that category is clean.

EXAMPLES
  qshield scan                                    # default org, all outputs
  qshield scan -o prod-eu --region NL,EU          # Dutch/EU org, Dutch/EU citations first
  qshield scan --format cbom,vex --probe-tls      # CBOM + VEX + endpoint probing
  qshield scan --allow-partial                    # CI-friendly: partial coverage → exit 0
  qshield orgs                                    # list what sf CLI knows about

AUTHENTICATION
  qshield does not register its own Connected App. It reuses the session already
  established by:
      sf org login web --alias <name>
  Run 'sf org list' to confirm your org is connected, then point qshield at it
  with --target-org <alias>.
`;

export async function helpCommand(): Promise<number> {
  stdout.write(HELP);
  return 0;
}
