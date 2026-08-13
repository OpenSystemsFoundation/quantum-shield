export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
  /**
   * Raw tokens following the command. Commands that declare a flag spec
   * re-parse these with parseFlagsStrict for validation.
   */
  rest: string[];
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

  return { command, flags, positional, rest: tokens };
}

export interface FlagSpec {
  /** Long name without leading dashes, e.g. 'target-org'. */
  name: string;
  /** Single-character alias without the dash. Case-sensitive: -o ≠ -O. */
  short?: string;
  /** True when the flag consumes a value (`--flag value` / `--flag=value`). */
  takesValue?: boolean;
}

export interface StrictParseResult {
  /** Flags keyed by their long name, regardless of which alias was used. */
  flags: Record<string, string | boolean>;
  positional: string[];
  /** Usage errors (unknown flag, missing value). Non-empty ⇒ exit 2. */
  errors: string[];
  /** Non-fatal notices (e.g. repeated value flag). Print to stderr. */
  warnings: string[];
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

function suggestFlag(input: string, specs: FlagSpec[]): string | undefined {
  let best: { name: string; dist: number } | undefined;
  for (const spec of specs) {
    const dist = levenshtein(input.toLowerCase(), spec.name.toLowerCase());
    if (!best || dist < best.dist) best = { name: spec.name, dist };
  }
  if (best && best.dist <= Math.max(2, Math.floor(input.length / 3))) {
    return `--${best.name}`;
  }
  return undefined;
}

/** Human-readable listing of a command's valid flags, for usage errors. */
export function describeFlags(specs: FlagSpec[]): string {
  return specs.map((s) => (s.short ? `--${s.name}/-${s.short}` : `--${s.name}`)).join(', ');
}

/**
 * Spec-aware parser used by commands that validate their flags.
 *
 * Unlike parseArgs it rejects unknown flags (with a "did you mean" hint),
 * errors on value flags with a missing value, and warns when a value flag is
 * repeated (last occurrence wins). Flags are stored under their long name, so
 * `-o x` and `--target-org x` land on the same key.
 */
export function parseFlagsStrict(tokens: string[], specs: FlagSpec[]): StrictParseResult {
  const byLong = new Map(specs.map((s) => [s.name, s]));
  const byShort = new Map(
    specs.filter((s) => s.short).map((s) => [s.short as string, s]),
  );
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const assign = (spec: FlagSpec, value: string | boolean, display: string) => {
    if (spec.takesValue && spec.name in flags) {
      warnings.push(`flag ${display} given multiple times; using the last value ('${String(value)}')`);
    }
    flags[spec.name] = value;
  };

  let afterSeparator = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (afterSeparator || token === '-' || !token.startsWith('-')) {
      positional.push(token);
      continue;
    }
    if (token === '--') {
      afterSeparator = true;
      continue;
    }

    const isLong = token.startsWith('--');
    const body = token.slice(isLong ? 2 : 1);
    const eq = body.indexOf('=');
    const name = eq >= 0 ? body.slice(0, eq) : body;
    const inline = eq >= 0 ? body.slice(eq + 1) : undefined;
    const display = isLong ? `--${name}` : `-${name}`;
    const spec = isLong ? byLong.get(name) : byShort.get(name);

    if (!spec) {
      const hint = suggestFlag(name, specs);
      errors.push(`unknown flag ${display}${hint ? ` (did you mean ${hint}?)` : ''}`);
      continue;
    }

    if (spec.takesValue) {
      if (inline !== undefined) {
        if (inline === '') {
          errors.push(`flag ${display} requires a value`);
        } else {
          assign(spec, inline, display);
        }
        continue;
      }
      const next = tokens[i + 1];
      if (next === undefined || (next.startsWith('-') && next !== '-')) {
        errors.push(`flag ${display} requires a value`);
        continue;
      }
      assign(spec, next, display);
      i += 1;
    } else {
      // Boolean flag. `--flag=true` style values pass through for getBool.
      assign(spec, inline !== undefined ? inline : true, display);
    }
  }

  return { flags, positional, errors, warnings };
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
