import { stderr, stdout } from 'node:process';
import { listAuthenticatedOrgs } from '../auth/sfCli.js';

export async function orgsCommand(): Promise<number> {
  try {
    const orgs = await listAuthenticatedOrgs();
    if (orgs.length === 0) {
      stderr.write('no authenticated orgs. run `sf org login web` first.\n');
      return 0;
    }
    stdout.write(JSON.stringify(orgs, null, 2) + '\n');
    return 0;
  } catch (err) {
    stderr.write(`failed to list orgs: ${(err as Error).message}\n`);
    return 10;
  }
}
