import { describe, expect, it, vi, afterEach } from 'vitest';

const execFileMock = vi.fn();
const execMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (
    command: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, out: { stdout: string; stderr: string }) => void,
  ) => {
    execFileMock(command, args).then(
      (stdout: string) => cb(null, { stdout, stderr: '' }),
      (err: Error) => cb(err, { stdout: '', stderr: '' }),
    );
  },
  exec: (
    command: string,
    _opts: unknown,
    cb: (err: Error | null, out: { stdout: string; stderr: string }) => void,
  ) => {
    execMock(command).then(
      (stdout: string) => cb(null, { stdout, stderr: '' }),
      (err: Error) => cb(err, { stdout: '', stderr: '' }),
    );
  },
}));

import { buildSessionFromSfCli, SfCliError } from './sfCli.js';

afterEach(() => {
  execFileMock.mockReset();
  execMock.mockReset();
});

function displayJson(partial: Record<string, unknown> = {}) {
  return JSON.stringify({
    status: 0,
    result: {
      id: '00D000000000001',
      orgId: '00D000000000001',
      username: 'admin@acme.com',
      instanceUrl: 'https://acme.my.salesforce.com',
      accessToken: '00D...!ABCD',
      apiVersion: '62.0',
      connectedStatus: 'Connected',
      ...partial,
    },
  });
}

function listJson(): string {
  return JSON.stringify({
    status: 0,
    result: {
      nonScratchOrgs: [
        {
          username: 'admin@acme.com',
          orgId: '00D000000000001',
          instanceUrl: 'https://acme.my.salesforce.com',
          alias: 'prod-eu',
          isDefaultUsername: true,
          connectedStatus: 'Connected',
        },
      ],
    },
  });
}

describe('buildSessionFromSfCli', () => {
  it('constructs a Session from sf org display output', async () => {
    execFileMock
      .mockResolvedValueOnce(displayJson())
      .mockResolvedValueOnce(listJson());

    const session = await buildSessionFromSfCli({ targetOrg: 'prod-eu' });
    expect(session.accessToken).toBe('00D...!ABCD');
    expect(session.instanceUrl).toBe('https://acme.my.salesforce.com');
    expect(session.org.orgId).toBe('00D000000000001');
    expect(session.org.username).toBe('admin@acme.com');
    expect(session.org.orgType).toBe('production');
    expect(session.apiVersion).toBe('62.0');

    // Verify we passed --target-org through
    const firstCallArgs = execFileMock.mock.calls[0][1];
    expect(firstCallArgs).toContain('--target-org');
    expect(firstCallArgs).toContain('prod-eu');
  });

  it('falls back to show-access-token when org display redacts the token', async () => {
    execFileMock
      .mockResolvedValueOnce(
        displayJson({ accessToken: "[REDACTED] Use 'sf org auth show-access-token' to view" }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ status: 0, result: { accessToken: '00D...!REAL' } }),
      )
      .mockResolvedValueOnce(listJson());

    const session = await buildSessionFromSfCli({ targetOrg: 'prod-eu' });
    expect(session.accessToken).toBe('00D...!REAL');

    const tokenCallArgs = execFileMock.mock.calls[1][1];
    expect(tokenCallArgs).toEqual([
      'org',
      'auth',
      'show-access-token',
      '--json',
      '--target-org',
      'prod-eu',
    ]);
  });

  it('throws SfCliError when the fallback token is also unusable', async () => {
    execFileMock
      .mockResolvedValueOnce(
        displayJson({ accessToken: "[REDACTED] Use 'sf org auth show-access-token' to view" }),
      )
      .mockResolvedValueOnce(JSON.stringify({ status: 0, result: {} }));

    const thrown = await buildSessionFromSfCli({ targetOrg: 'prod-eu' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(SfCliError);
    expect((thrown as Error).message).toMatch(/access token/i);
  });

  it('classifies sandbox orgs from the list output', async () => {
    execFileMock
      .mockResolvedValueOnce(
        displayJson({ instanceUrl: 'https://acme--uat.sandbox.my.salesforce.com' }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: 0,
          result: {
            sandboxes: [
              {
                username: 'admin@acme.com',
                orgId: '00D000000000001',
                instanceUrl: 'https://acme--uat.sandbox.my.salesforce.com',
                isSandbox: true,
              },
            ],
          },
        }),
      );

    const session = await buildSessionFromSfCli();
    expect(session.org.orgType).toBe('sandbox');
    expect(session.environmentId).toBe('sandbox');
  });

  it('surfaces sf stderr detail when the CLI exits non-zero', async () => {
    const err = new Error('Command failed: sf org display --json --verbose') as Error & {
      stderr?: string;
    };
    err.stderr = 'Error (NamedOrgNotFoundError): No authorized org found for "badalias".';
    execFileMock.mockRejectedValueOnce(err);

    const thrown = await buildSessionFromSfCli({ targetOrg: 'badalias' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(SfCliError);
    expect((thrown as Error).message).toMatch(/NamedOrgNotFoundError/);
    expect((thrown as Error).message).toMatch(/badalias/);
  });

  it('extracts the sf error JSON from stdout when the process exits non-zero', async () => {
    const err = new Error('Command failed: sf org display --json --verbose') as Error & {
      stdout?: string;
    };
    err.stdout = JSON.stringify({
      status: 1,
      name: 'ExpiredAccessTokenError',
      message: 'The access token for user admin@acme.com has expired.',
    });
    execFileMock.mockRejectedValueOnce(err);

    const thrown = await buildSessionFromSfCli().catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(SfCliError);
    expect((thrown as Error).message).toMatch(/ExpiredAccessTokenError/);
    expect((thrown as Error).message).toMatch(/has expired/);
  });

  it('includes name/message when sf --json reports a non-zero status', async () => {
    execFileMock.mockResolvedValueOnce(
      JSON.stringify({
        status: 1,
        name: 'NamedOrgNotFoundError',
        message: 'No authorized org found for prod-eu.',
        result: {},
      }),
    );

    const thrown = await buildSessionFromSfCli({ targetOrg: 'prod-eu' }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(SfCliError);
    expect((thrown as Error).message).toMatch(/returned status 1/);
    expect((thrown as Error).message).toMatch(/NamedOrgNotFoundError/);
    expect((thrown as Error).message).toMatch(/No authorized org found/);
  });

  it('throws SfCliError with a helpful message when sf is not installed', async () => {
    const err = new Error('spawn sf ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    execFileMock.mockRejectedValue(err);
    execMock.mockRejectedValue(new Error("'sf' is not recognized as an internal or external command"));

    const thrown = await buildSessionFromSfCli().catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(SfCliError);
    expect((thrown as Error).message).toMatch(/Salesforce CLI/);
  });

  it('falls back to shell invocation on Windows when sf is shell-resolved', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    try {
      const err = new Error('spawn sf ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      execFileMock.mockRejectedValueOnce(err);
      execMock.mockResolvedValueOnce(displayJson());
      execFileMock.mockRejectedValueOnce(err);
      execMock.mockResolvedValueOnce(listJson());

      const session = await buildSessionFromSfCli({ targetOrg: 'qs-scan' });

      expect(session.org.orgId).toBe('00D000000000001');
      expect(execMock).toHaveBeenCalledTimes(2);
      expect(execMock.mock.calls[0][0]).toContain('sf org display --json --verbose --target-org qs-scan');
      expect(execMock.mock.calls[1][0]).toContain('sf org list --json');
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });
});
