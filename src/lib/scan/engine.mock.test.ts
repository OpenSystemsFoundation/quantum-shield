import { describe, expect, it } from 'vitest';
import { buildMockSession } from '../auth/oauth.js';
import { runScan } from './engine.js';
import { LIVE_ORG_SCAN_SNAPSHOT } from './fixtures/liveOrgSnapshot.generated.js';

describe('mock scan fixtures', () => {
  it('replays captured Salesforce API snapshots through the real scanners', async () => {
    expect(LIVE_ORG_SCAN_SNAPSHOT.responses.length).toBeGreaterThan(0);

    const events = [] as Array<{ type: string }>;
    const report = await runScan(
      {
        scanId: 'fixture-scan',
        session: buildMockSession(),
        overlays: [],
        mock: true,
      },
      (event) => events.push({ type: event.type }),
    );

    expect(report.summary.totalFindings).toBe(report.findings.length);
    expect(report.cbom.length).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'asset')).toBe(true);
    expect(events.some((event) => event.type === 'completed')).toBe(true);
  });
});