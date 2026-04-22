import { stdout } from 'node:process';

const HELP = `qshield — local post-quantum readiness scanner for Salesforce orgs

USAGE
  qshield <command> [flags]

COMMANDS
  scan        Scan an authenticated org and write PDF + CBOM + VEX + CSV + JSON
  orgs        List orgs authenticated via the Salesforce CLI
  help        Show this message

SCAN FLAGS
  --target-org, -o <alias|username>    Pick a specific org (else uses sf's default)
  --api-version <vN>                   API version (default: reuse sf's)
  --out, -O <dir>                      Output directory (default: ./qshield-out)
  --format <list>                      Comma-separated outputs. Default: pdf,cbom,vex,csv,json
                                       Accepted: pdf | cbom | vex | csv | json
  --region <list>                      Comma-separated regulatory regions.
                                       Accepted: US, EU, NL, DE, FR, UK, INTL
                                       When set, only rules citing the listed
                                       jurisdictions (or INTL) fire.
  --overlay <list>                     Comma-separated regulatory overlays.
                                       e.g. nis2,dora,gdpr,pci-dss-4,hipaa,cmmc
  --probe-tls                          Probe NamedCredential / RemoteSite endpoints
                                       for TLS version + hybrid-KEM support.
  --quiet, -q                          Suppress per-scanner progress lines.

EXAMPLES
  qshield scan                                    # default org, all outputs
  qshield scan -o prod-eu --region NL,EU          # Dutch/EU org, Dutch/EU rules only
  qshield scan --format cbom,vex --probe-tls      # CBOM + VEX + endpoint probing
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
