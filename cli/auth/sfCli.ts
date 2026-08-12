import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Session } from '../../src/lib/auth/types.js';

const run = promisify(execFile);
const runInShell = promisify(exec);
const MAX_BUFFER = 32 * 1024 * 1024;

export class SfCliError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SfCliError';
  }
}

interface SfCliBaseResult<R> {
  status: number;
  result: R;
}

interface OrgDisplayResult {
  id: string;
  username: string;
  connectedStatus?: string;
  instanceUrl: string;
  accessToken: string;
  apiVersion?: string;
  alias?: string;
  orgId?: string;
  instanceApiVersion?: string;
}

interface OrgListEntry {
  username: string;
  orgId: string;
  instanceUrl: string;
  alias?: string;
  isDevHub?: boolean;
  isScratch?: boolean;
  isSandbox?: boolean;
  isDefaultUsername?: boolean;
  connectedStatus?: string;
}

interface OrgListResult {
  nonScratchOrgs?: OrgListEntry[];
  scratchOrgs?: OrgListEntry[];
  sandboxes?: OrgListEntry[];
  devHubs?: OrgListEntry[];
  other?: OrgListEntry[];
}

interface ShowAccessTokenResult {
  accessToken: string;
}

// Newer sf CLI releases replace the token in `org display` output with a
// "[REDACTED] …" placeholder and only expose it via `org auth show-access-token`.
function isRedactedToken(token: string | undefined): boolean {
  return !token || token.startsWith('[REDACTED');
}

function notFoundError(cause: unknown): SfCliError {
  return new SfCliError(
    'Salesforce CLI (`sf`) was not found on PATH. Install it from https://developer.salesforce.com/tools/salesforcecli and run `sf org login web` before using qshield.',
    cause,
  );
}

function quoteForShell(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function shellLookupFailed(message: string): boolean {
  return /not recognized as an internal or external command|could not be found/i.test(message);
}

async function invokeSfStdout(args: string[]): Promise<string> {
  try {
    const { stdout } = await run('sf', args, {
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    });
    return stdout;
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (process.platform === 'win32' && nodeErr?.code === 'ENOENT') {
      const command = ['sf', ...args].map(quoteForShell).join(' ');
      try {
        const { stdout } = await runInShell(command, {
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
        });
        return stdout;
      } catch (shellErr) {
        const shellNodeErr = shellErr as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
        const details = [shellNodeErr.stderr, shellNodeErr.stdout, shellNodeErr.message]
          .filter((value): value is string => Boolean(value))
          .join('\n');
        if (shellLookupFailed(details)) {
          throw notFoundError(shellErr);
        }
        throw shellErr;
      }
    }
    throw err;
  }
}

async function invokeSf<R>(args: string[]): Promise<R> {
  try {
    const stdout = await invokeSfStdout(args);
    const parsed = JSON.parse(stdout) as SfCliBaseResult<R>;
    if (parsed.status !== 0) {
      throw new SfCliError(`sf ${args.join(' ')} returned status ${parsed.status}`);
    }
    return parsed.result;
  } catch (err) {
    if (err instanceof SfCliError) throw err;
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === 'ENOENT') {
      throw notFoundError(err);
    }
    throw new SfCliError(`Failed to invoke sf CLI: ${(err as Error).message ?? String(err)}`, err);
  }
}

function classifyOrgType(entry: OrgListEntry | undefined, display: OrgDisplayResult): Session['org']['orgType'] {
  if (entry?.isScratch) return 'scratch';
  if (entry?.isSandbox) return 'sandbox';
  const host = new URL(display.instanceUrl).host;
  if (host.endsWith('.sandbox.my.salesforce.com') || host.endsWith('.sandbox.salesforce.com')) return 'sandbox';
  if (host.endsWith('.develop.my.salesforce.com') || host.includes('.scratch.')) return 'developer';
  return 'production';
}

export interface SfCliOrgRef {
  targetOrg?: string;
}

/**
 * Builds a Session from the local `sf` CLI state.
 *
 * Invokes `sf org display --json` (optionally with --target-org) to retrieve
 * the access token and instance URL for the org the admin already authorised.
 * No external Connected App setup is required — qshield reuses the CLI's own
 * OAuth session.
 */
export async function buildSessionFromSfCli(
  opts: SfCliOrgRef & { apiVersion?: string } = {},
): Promise<Session> {
  const args = ['org', 'display', '--json', '--verbose'];
  if (opts.targetOrg) args.push('--target-org', opts.targetOrg);
  const display = await invokeSf<OrgDisplayResult>(args);

  let accessToken = display.accessToken;
  if (isRedactedToken(accessToken)) {
    const tokenArgs = ['org', 'auth', 'show-access-token', '--json'];
    if (opts.targetOrg) tokenArgs.push('--target-org', opts.targetOrg);
    const shown = await invokeSf<ShowAccessTokenResult>(tokenArgs);
    accessToken = shown.accessToken;
    if (isRedactedToken(accessToken)) {
      throw new SfCliError(
        'sf CLI did not return a usable access token for this org. Re-authenticate with `sf org login web` and try again.',
      );
    }
  }

  let entry: OrgListEntry | undefined;
  try {
    const list = await invokeSf<OrgListResult>(['org', 'list', '--json']);
    const all = [
      ...(list.nonScratchOrgs ?? []),
      ...(list.scratchOrgs ?? []),
      ...(list.sandboxes ?? []),
      ...(list.devHubs ?? []),
      ...(list.other ?? []),
    ];
    entry = all.find((o) => o.username === display.username);
  } catch {
    /* list is optional; display alone is enough */
  }

  const apiVersion =
    opts.apiVersion ?? display.apiVersion ?? display.instanceApiVersion ?? '62.0';
  const orgId = display.orgId ?? display.id;
  if (!orgId) throw new SfCliError('sf org display did not return an orgId');

  const orgType = classifyOrgType(entry, display);

  const environmentId: Session['environmentId'] =
    orgType === 'sandbox' ? 'sandbox' : orgType === 'production' ? 'production' : 'custom';

  return {
    accessToken,
    instanceUrl: display.instanceUrl.replace(/\/$/, ''),
    identityUrl: `${display.instanceUrl.replace(/\/$/, '')}/id/${orgId}/${display.username}`,
    tokenType: 'Bearer',
    issuedAt: new Date().toISOString(),
    scope: 'api id',
    org: {
      orgId,
      userId: display.username,
      username: display.username,
      displayName: entry?.alias ?? display.alias ?? display.username,
      orgName: entry?.alias ?? display.alias ?? display.username,
      orgType,
    },
    environmentId,
    apiVersion,
    mock: false,
  };
}

export async function listAuthenticatedOrgs(): Promise<OrgListEntry[]> {
  const list = await invokeSf<OrgListResult>(['org', 'list', '--json']);
  return [
    ...(list.nonScratchOrgs ?? []),
    ...(list.scratchOrgs ?? []),
    ...(list.sandboxes ?? []),
    ...(list.devHubs ?? []),
    ...(list.other ?? []),
  ];
}
