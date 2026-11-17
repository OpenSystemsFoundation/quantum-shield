import { stderr, stdout, versions } from 'node:process';
import { describeFlags, getBool, getString, parseFlagsStrict, type FlagSpec, type ParsedArgs } from '../args.js';
import { buildSessionFromSfCli, getSfVersion, listAuthenticatedOrgs, type OrgListEntry } from '../auth/sfCli.js';
import { EXIT } from '../exitCodes.js';
import { writeJson, writeJsonError } from '../output/json.js';
import { QSHIELD_VERSION } from '../../src/lib/version.js';
import { helpCommand } from './help.js';

const DOCTOR_FLAGS: FlagSpec[] = [
  { name: 'target-org', short: 'o', takesValue: true },
  { name: 'json' },
  { name: 'help', short: 'h' },
];

/** Minimum Node version, mirrored from package.json `engines`. */
export const MIN_NODE = '22.23.4';

export interface DoctorCheck {
  id: 'node' | 'sf-cli' | 'orgs' | 'target-org';
  ok: boolean;
  detail: string;
  /** Next step when the check fails. */
  fix?: string;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function dedupe(entries: OrgListEntry[]): OrgListEntry[] {
  const seen = new Set<string>();
  return entries.filter((o) => {
    const key = `${o.orgId} ${o.username}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function doctorCommand(args: ParsedArgs): Promise<number> {
  const parsed = parseFlagsStrict(args.rest, DOCTOR_FLAGS);
  const json = getBool(parsed.flags, 'json');
  if (getBool(parsed.flags, 'help')) return helpCommand('doctor');
  const usageErrors = [...parsed.errors, ...parsed.positional.map((p) => `unexpected argument: ${p}`)];
  if (usageErrors.length > 0) {
    if (json) {
      return writeJsonError(EXIT.USAGE, 'USAGE', usageErrors[0], {
        details: usageErrors,
        hint: `valid doctor flags: ${describeFlags(DOCTOR_FLAGS)}`,
      });
    }
    for (const error of usageErrors) stderr.write(`error: ${error}\n`);
    stderr.write(`valid doctor flags: ${describeFlags(DOCTOR_FLAGS)}\n`);
    return EXIT.USAGE;
  }
  const targetOrg = getString(parsed.flags, 'target-org');

  const checks: DoctorCheck[] = [];
  const nodeOk = compareVersions(versions.node, MIN_NODE) >= 0;
  checks.push({
    id: 'node',
    ok: nodeOk,
    detail: `Node.js ${versions.node} (need >= ${MIN_NODE})`,
    fix: nodeOk ? undefined : `Install Node.js ${MIN_NODE} or newer.`,
  });

  let sfVersion: string | undefined;
  try {
    sfVersion = await getSfVersion();
    checks.push({ id: 'sf-cli', ok: true, detail: `Salesforce CLI ${sfVersion}` });
  } catch (err) {
    checks.push({
      id: 'sf-cli',
      ok: false,
      detail: (err as Error).message,
      fix: 'Install the Salesforce CLI: npm install -g @salesforce/cli',
    });
  }

  let orgs: OrgListEntry[] = [];
  if (sfVersion) {
    try {
      orgs = dedupe(await listAuthenticatedOrgs());
      checks.push({
        id: 'orgs',
        ok: orgs.length > 0,
        detail: `${orgs.length} authenticated org(s)`,
        fix:
          orgs.length > 0
            ? undefined
            : 'Log in with sf: a human runs sf org login web --alias <name> (opens a browser); headless setups use sf org login jwt or sf org login sfdx-url.',
      });
    } catch (err) {
      checks.push({ id: 'orgs', ok: false, detail: (err as Error).message, fix: 'Run: sf org list' });
    }
  }

  let target: { username: string; orgId: string; instanceUrl: string; orgType: string } | undefined;
  if (sfVersion && orgs.length > 0) {
    try {
      const session = await buildSessionFromSfCli({ targetOrg });
      const resolved = {
        username: session.org.username ?? session.org.userId,
        orgId: session.org.orgId,
        instanceUrl: session.instanceUrl,
        orgType: String(session.org.orgType),
      };
      target = resolved;
      checks.push({
        id: 'target-org',
        ok: true,
        detail: `${targetOrg ? `--target-org ${targetOrg}` : 'default org'} resolves to ${resolved.username} (${resolved.orgType})`,
      });
    } catch (err) {
      checks.push({
        id: 'target-org',
        ok: false,
        detail: (err as Error).message,
        fix: targetOrg
          ? `Check the alias with 'qshield orgs', or re-authenticate: sf org login web --alias ${targetOrg}`
          : 'Pass --target-org <alias>, or set a default: sf config set target-org <alias>',
      });
    }
  }

  const ready = checks.every((c) => c.ok) && checks.some((c) => c.id === 'target-org');
  const exitCode = ready ? EXIT.OK : nodeOk ? EXIT.AUTH : EXIT.INTERNAL;

  if (json) {
    writeJson({
      schema: 'qshield.doctor/v1',
      ok: ready,
      exitCode,
      qshieldVersion: QSHIELD_VERSION,
      checks,
      targetOrg: target ?? null,
      orgs: orgs.map((o) => ({
        alias: o.alias ?? null,
        username: o.username,
        orgId: o.orgId,
        isDefault: Boolean(o.isDefaultUsername),
        isScratch: Boolean(o.isScratch),
        isSandbox: Boolean(o.isSandbox),
        isDevHub: Boolean(o.isDevHub),
        connectedStatus: o.connectedStatus ?? null,
      })),
    });
    return exitCode;
  }

  for (const c of checks) {
    stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.id.padEnd(10)}  ${c.detail}\n`);
    if (!c.ok && c.fix) stdout.write(`                  fix: ${c.fix}\n`);
  }
  stdout.write(ready ? '\nready to scan: qshield scan' + (targetOrg ? ` --target-org ${targetOrg}` : '') + '\n' : '\nnot ready to scan\n');
  return exitCode;
}
