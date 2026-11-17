/**
 * Public sample report ("View a sample report", /demo).
 *
 * The sample is produced by running the real scan engine and rule catalog
 * over the bundled fixture snapshot — the same data the engine's mock mode
 * uses — so it always shows what the current rules actually report.
 *
 * It is deliberately separate from the dev-mock OAuth bypass in
 * `@lib/auth`: nothing here creates, stores or loads a session, nothing is
 * written to sessionStorage or IndexedDB, and no network request is made.
 * The identity below exists only in memory to label the sample, and is named
 * so that an exported artifact cannot be mistaken for a real org's report.
 */
import type { Session } from '@lib/auth/types';
import type { Report } from '@lib/pdf/types';

export const SAMPLE_BANNER_TEXT = 'Sample data — not your org';
export const SAMPLE_ORG_NAME = 'Sample org (demo data)';
export const SAMPLE_SCAN_ID = 'sample-report';

/** In-memory identity for the sample. Never persisted; the token is not a credential. */
export const SAMPLE_SESSION: Session = {
  accessToken: '',
  instanceUrl: 'https://sample.invalid',
  identityUrl: 'https://sample.invalid/id/sample',
  tokenType: 'none',
  issuedAt: '2026-01-01T00:00:00.000Z',
  scope: '',
  org: {
    orgId: 'SAMPLE-ORG',
    userId: 'SAMPLE-USER',
    username: 'sample data',
    displayName: 'Sample data',
    orgName: SAMPLE_ORG_NAME,
    orgType: 'Developer',
  },
  environmentId: 'production',
  apiVersion: '0.0',
  mock: true,
};

export async function buildSampleReport(): Promise<Report> {
  // Loaded on demand so pages that never show the sample do not bundle it.
  const { runScan } = await import('@lib/scan/engine');
  return runScan(
    {
      scanId: SAMPLE_SCAN_ID,
      session: SAMPLE_SESSION,
      overlays: ['gdpr', 'nis2', 'dora'],
      regions: [],
      mock: true,
    },
    () => {},
  );
}
