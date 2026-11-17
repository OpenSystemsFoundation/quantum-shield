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

    // Data-sensitivity pass ran against the captured metadata and every
    // finding is ranked, most urgent first.
    expect(report.coverage.find((c) => c.id === 'data-profile')?.status).toBe('scanned');
    expect(report.dataProfile?.entries.some((e) => e.sources.includes('classification'))).toBe(true);
    expect(report.riskAssumptions?.quantumYear).toBe(2033);
    expect(report.findings.map((f) => f.priority?.rank)).toEqual(report.findings.map((_, i) => i + 1));
    const counts = report.summary.priorityCounts!;
    expect(counts['act-now'] + counts.plan + counts.monitor).toBe(report.findings.length);
    expect(report.findings[0].priority?.band).toBe('act-now');
  });
});