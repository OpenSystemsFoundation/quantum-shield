/**
 * Stable process exit codes. These are part of the CLI's public contract:
 * CI pipelines and AI agents branch on them, so never renumber one. Add new
 * codes instead.
 */
export const EXIT = {
  OK: 0,
  /** Unexpected internal error. */
  INTERNAL: 1,
  /** Unknown command or flag, missing or invalid flag value. */
  USAGE: 2,
  /** Report written, but at least one category is 'partial' or 'failed'. */
  PARTIAL: 3,
  /** Report written, and a finding met the --fail-on severity threshold. */
  FINDINGS_AT_THRESHOLD: 4,
  /** sf CLI missing, unknown org, expired session, or no authenticated org. */
  AUTH: 10,
  /** Scan aborted, or every requested output format failed to write. */
  SCAN_FAILED: 20,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Machine-readable error codes paired with the exit codes above. */
export type ErrorCode =
  | 'USAGE'
  | 'AUTH_FAILED'
  | 'SF_CLI_MISSING'
  | 'SCAN_ABORTED'
  | 'INTERNAL';
