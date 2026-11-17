import { argv, env, exit, stderr } from 'node:process';
import { parseArgs } from './args.js';
import { scanCommand } from './commands/scan.js';
import { orgsCommand } from './commands/orgs.js';
import { doctorCommand } from './commands/doctor.js';
import { versionCommand } from './commands/version.js';
import { helpCommand, HELP_TOPICS } from './commands/help.js';
import { EXIT } from './exitCodes.js';
import { writeJsonError } from './output/json.js';

const COMMANDS = ['scan', 'orgs', 'doctor', 'version', 'help'];
const rawArgs = argv.slice(2);
const wantsJson = rawArgs.includes('--json');

async function main(): Promise<number> {
  const first = rawArgs[0];
  if (first === '--version' || first === '-v' || first === '-V') {
    return versionCommand(wantsJson);
  }
  const parsed = parseArgs(rawArgs);

  switch (parsed.command) {
    case 'scan':
      return scanCommand(parsed);
    case 'orgs':
      return orgsCommand(parsed);
    case 'doctor':
      return doctorCommand(parsed);
    case 'version':
      return versionCommand(wantsJson);
    case 'help': {
      const topic = parsed.positional.find((p) => !p.startsWith('-'));
      if (topic && !HELP_TOPICS.includes(topic)) {
        stderr.write(`unknown help topic: ${topic}. Topics: ${HELP_TOPICS.join(', ')}\n`);
        return EXIT.USAGE;
      }
      return helpCommand(topic);
    }
    default:
      if (wantsJson) {
        return writeJsonError(EXIT.USAGE, 'USAGE', `unknown command: ${parsed.command}`, {
          hint: `commands: ${COMMANDS.join(', ')}`,
        });
      }
      stderr.write(`unknown command: ${parsed.command}. Commands: ${COMMANDS.join(', ')}\n`);
      stderr.write("run 'qshield help' for usage\n");
      return EXIT.USAGE;
  }
}

main()
  .then((code) => exit(code))
  .catch((err) => {
    const e = err as Error;
    if (wantsJson) {
      writeJsonError(EXIT.INTERNAL, 'INTERNAL', e?.message ?? String(err), {
        hint: 'set QSHIELD_DEBUG=1 for a stack trace on stderr',
      });
    } else {
      stderr.write(`fatal: ${e?.message ?? String(err)}\n`);
    }
    if (env.QSHIELD_DEBUG === '1' && e?.stack) {
      stderr.write(`${e.stack}\n`);
    } else if (!wantsJson) {
      stderr.write('set QSHIELD_DEBUG=1 for a stack trace\n');
    }
    exit(EXIT.INTERNAL);
  });
