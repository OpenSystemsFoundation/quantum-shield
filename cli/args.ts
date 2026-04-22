export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Minimal arg parser. We intentionally avoid commander/yargs so the CLI stays
 * dependency-light; anything fancier should only be added once a command
 * needs it.
 *
 * Recognises:
 *   --flag value          (space-separated)
 *   --flag=value          (equals-separated)
 *   --flag                (boolean)
 *   -x value              (short, space-separated)
 *   -x                    (short boolean)
 *   positional args       (anything not preceded by a flag)
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [rawCommand = 'help', ...rest] = argv;
  const command = rawCommand.startsWith('-') ? 'help' : rawCommand;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = rawCommand.startsWith('-') ? [rawCommand] : [];

  const tokens = rawCommand.startsWith('-') ? argv : rest;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = tokens[i + 1];
        if (next && !next.startsWith('-')) {
          flags[body] = next;
          i += 1;
        } else {
          flags[body] = true;
        }
      }
    } else if (token.startsWith('-')) {
      const body = token.slice(1);
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        flags[body] = next;
        i += 1;
      } else {
        flags[body] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { command, flags, positional };
}

export function getString(flags: Record<string, string | boolean>, name: string, short?: string): string | undefined {
  const raw = flags[name] ?? (short ? flags[short] : undefined);
  return typeof raw === 'string' ? raw : undefined;
}

export function getBool(flags: Record<string, string | boolean>, name: string, short?: string): boolean {
  const raw = flags[name] ?? (short ? flags[short] : undefined);
  return raw === true || raw === 'true' || raw === '1';
}

export function getList(
  flags: Record<string, string | boolean>,
  name: string,
  fallback: string[] = [],
): string[] {
  const raw = flags[name];
  if (typeof raw !== 'string') return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
