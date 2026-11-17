import { stdout } from 'node:process';
import type { ErrorCode } from '../exitCodes.js';

/**
 * JSON error envelope printed on stdout when a command runs with --json and
 * fails before it can print its normal result. Agents parse stdout, so every
 * --json invocation prints exactly one JSON document there, success or not.
 */
export interface JsonError {
  schema: 'qshield.error/v1';
  ok: false;
  exitCode: number;
  error: {
    code: ErrorCode;
    message: string;
    /** What to do next, phrased for a human or an agent. */
    hint?: string;
    /** Individual usage errors, when there were several. */
    details?: string[];
  };
}

export function writeJson(value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeJsonError(
  exitCode: number,
  code: ErrorCode,
  message: string,
  extra: { hint?: string; details?: string[] } = {},
): number {
  const body: JsonError = { schema: 'qshield.error/v1', ok: false, exitCode, error: { code, message, ...extra } };
  writeJson(body);
  return exitCode;
}
