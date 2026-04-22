import { argv, exit, stderr } from 'node:process';
import { parseArgs } from './args.js';
import { scanCommand } from './commands/scan.js';
import { orgsCommand } from './commands/orgs.js';
import { helpCommand } from './commands/help.js';

async function main(): Promise<number> {
  const parsed = parseArgs(argv.slice(2));

  switch (parsed.command) {
    case 'scan':
      return scanCommand(parsed);
    case 'orgs':
      return orgsCommand();
    case 'help':
    case '--help':
    case '-h':
      return helpCommand();
    default:
      stderr.write(`unknown command: ${parsed.command}\n`);
      await helpCommand();
      return 2;
  }
}

main()
  .then((code) => exit(code))
  .catch((err) => {
    stderr.write(`fatal: ${(err as Error).stack ?? (err as Error).message ?? String(err)}\n`);
    exit(1);
  });
