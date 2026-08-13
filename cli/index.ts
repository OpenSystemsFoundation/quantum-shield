import { argv, env, exit, stderr } from 'node:process';
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
      return orgsCommand(parsed);
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
    const e = err as Error;
    stderr.write(`fatal: ${e?.message ?? String(err)}\n`);
    if (env.QSHIELD_DEBUG === '1' && e?.stack) {
      stderr.write(`${e.stack}\n`);
    } else {
      stderr.write('set QSHIELD_DEBUG=1 for a stack trace\n');
    }
    exit(1);
  });
