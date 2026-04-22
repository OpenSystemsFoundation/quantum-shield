import { describe, expect, it, vi, afterEach } from 'vitest';

const execFileMock = vi.fn();

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
}));

import { buildSessionFromSfCli, SfCliError } from './sfCli.js';

afterEach(() => {
  execFileMock.mockReset();
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

  it('throws SfCliError with a helpful message when sf is not installed', async () => {
    const err = new Error('spawn sf ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    execFileMock.mockRejectedValue(err);

    const thrown = await buildSessionFromSfCli().catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(SfCliError);
    expect((thrown as Error).message).toMatch(/Salesforce CLI/);
  });
});
