import type {
  Category,
  CryptoAsset,
  Finding,
  OverlayScope,
  Report,
  Severity,
} from '@lib/pdf';
import { evaluate, ruleCatalogForOverlays } from '@lib/rules/engine';
import { AuthError, CorsBlockedError, SfClient } from './sfClient.js';
import { allScanners } from './scanners.js';
import type { ScanEvent, ScanEventListener, ScanOptions } from './types.js';
import { buildMockAssets } from './fixtures/mockAssets.js';

function emptyCategoryCounts(): Record<Category, number> {
  return {
    certificates: 0,
    'connected-apps': 0,
    'named-credentials': 0,
    'remote-sites': 0,
    sso: 0,
    'shield-encryption': 0,
    'apex-crypto': 0,
    'session-login': 0,
    packages: 0,
  };
}

function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

const OVERLAY_DEFS: OverlayScope[] = [
  { id: 'gdpr', label: 'GDPR — security of processing (Art. 32)', enabled: false },
  { id: 'nis2', label: 'NIS 2 — risk-management measures (Art. 21)', enabled: false },
  { id: 'dora', label: 'DORA — ICT risk management (Art. 9)', enabled: false },
  { id: 'eidas2', label: 'eIDAS 2.0 — trust services', enabled: false },
  { id: 'pci-dss-4', label: 'PCI DSS 4.0 — requirements 3.5–3.7', enabled: false },
  { id: 'hipaa', label: 'HIPAA Security Rule', enabled: false },
  { id: 'cmmc', label: 'CMMC 2.0 Levels 2 & 3', enabled: false },
  { id: 'swift-csp', label: 'SWIFT Customer Security Programme', enabled: false },
];

export async function runScan(
  options: ScanOptions,
  emit: ScanEventListener,
): Promise<Report> {
  const startedAt = new Date();
  const scanners = allScanners();
  const send = (e: ScanEvent) => emit(e);

  send({
    type: 'started',
    scanId: options.scanId,
    categories: scanners.map((s) => s.category),
  });

  const assets: CryptoAsset[] = [];

  try {
    if (options.mock) {
      for (const scanner of scanners) {
        send({
          type: 'scanner-progress',
          progress: {
            category: scanner.category,
            label: scanner.label,
            status: 'running',
            startedAt: new Date().toISOString(),
          },
        });
        const mockAssets = buildMockAssets(scanner.category);
        for (const a of mockAssets) {
          assets.push(a);
          send({ type: 'asset', category: scanner.category, asset: a });
        }
        send({
          type: 'scanner-progress',
          progress: {
            category: scanner.category,
            label: scanner.label,
            status: 'completed',
            assetCount: mockAssets.length,
            finishedAt: new Date().toISOString(),
          },
        });
        await new Promise((r) => setTimeout(r, 120));
      }
    } else {
      const client = new SfClient(options.session);
      for (const scanner of scanners) {
        const progressBase = { category: scanner.category, label: scanner.label };
        send({
          type: 'scanner-progress',
          progress: { ...progressBase, status: 'running', startedAt: new Date().toISOString() },
        });
        try {
          let count = 0;
          await scanner.scan(client, (a: CryptoAsset) => {
            count += 1;
            assets.push(a);
            send({ type: 'asset', category: scanner.category, asset: a });
          });
          send({
            type: 'scanner-progress',
            progress: {
              ...progressBase,
              status: 'completed',
              assetCount: count,
              finishedAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          if (err instanceof CorsBlockedError) {
            send({
              type: 'failed',
              kind: 'cors',
              error: err.message,
            });
            throw err;
          }
          if (err instanceof AuthError) {
            send({ type: 'failed', kind: 'auth', error: err.message });
            throw err;
          }
          const message = err instanceof Error ? err.message : String(err);
          send({
            type: 'scanner-progress',
            progress: { ...progressBase, status: 'failed', error: message, finishedAt: new Date().toISOString() },
          });
          send({ type: 'log', level: 'warn', message: `${scanner.category} failed: ${message}` });
        }
      }
    }

    const rules = ruleCatalogForOverlays(options.overlays);
    const ctx = { scanId: options.scanId, now: new Date() };
    const findings: Finding[] = [];
    const dedupe = new Set<string>();
    for (const asset of assets) {
      const produced = evaluate(asset, rules, ctx);
      for (const f of produced) {
        if (dedupe.has(f.id)) continue;
        dedupe.add(f.id);
        findings.push(f);
        send({ type: 'finding', finding: f });
      }
    }

    const severityCounts = emptySeverityCounts();
    const categoryCounts = emptyCategoryCounts();
    for (const f of findings) {
      severityCounts[f.severity] += 1;
      categoryCounts[f.category] += 1;
    }

    const hndlCount = findings.filter((f) => f.hndlExposure).length;
    const deadlines = findings
      .map((f) => f.deadline)
      .filter((d): d is string => Boolean(d))
      .sort();

    const overlays = OVERLAY_DEFS.map((o) => ({
      ...o,
      enabled: options.overlays.includes(o.id),
    }));

    const finishedAt = new Date();
    const report: Report = {
      schemaVersion: '1',
      generatedAt: finishedAt.toISOString(),
      scanStartedAt: startedAt.toISOString(),
      scanFinishedAt: finishedAt.toISOString(),
      org: {
        orgId: options.session.org.orgId,
        instanceUrl: options.session.instanceUrl,
        orgName: options.session.org.orgName ?? options.session.org.orgId,
        orgType: (options.session.org.orgType?.toLowerCase() as Report['org']['orgType']) ?? 'production',
        apiVersion: options.session.apiVersion,
        userLicense: 'Salesforce',
      },
      findings,
      overlays,
      sourceVersions: [
        { sourceId: 'BSI-TR-02102-1', documentVersion: '2025-01', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'ENISA-PQC-2024', documentVersion: '2024', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'NCSC-NL-PQC-factsheet', documentVersion: '2024', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'NIST-FIPS-203', documentVersion: '2024-08', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'NIST-FIPS-204', documentVersion: '2024-08', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'NIST-FIPS-205', documentVersion: '2024-08', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'NIST-SP-800-131A-r3', documentVersion: 'Rev 3', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'nis2-directive', documentVersion: '2022/2555', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'dora-regulation', documentVersion: '2022/2554', retrievedAt: finishedAt.toISOString().slice(0, 10) },
        { sourceId: 'gdpr-art32', documentVersion: '2016/679', retrievedAt: finishedAt.toISOString().slice(0, 10) },
      ],
      summary: {
        totalFindings: findings.length,
        bySeverity: severityCounts,
        byCategory: categoryCounts,
        earliestDeadline: deadlines[0],
        hndlFindings: hndlCount,
        postureSentence:
          findings.length === 0
            ? `${options.session.org.orgName ?? 'This org'} has no detectable cryptographic findings against the currently enabled sources. Re-scan after every major configuration change.`
            : `${options.session.org.orgName ?? 'This org'} has ${findings.length} cryptographic finding${findings.length === 1 ? '' : 's'} across ${Object.values(categoryCounts).filter((n) => n > 0).length} asset categor${Object.values(categoryCounts).filter((n) => n > 0).length === 1 ? 'y' : 'ies'}. ${severityCounts.critical} must be remediated immediately to restore baseline compliance; the remainder should be scheduled against the 2030 BSI and ENISA migration milestone.`,
      },
      cbom: assets.map((a) => ({
        name: a.name,
        type:
          a.kind === 'certificate'
            ? 'certificate'
            : a.kind === 'apex-call'
              ? 'algorithm'
              : a.kind === 'remote-site' || a.kind === 'named-credential' || a.kind === 'external-credential'
                ? 'protocol'
                : a.kind === 'installed-package'
                  ? 'library'
                  : 'key',
        algorithm: a.algorithm ?? a.endpointUrl ?? 'unknown',
        keySize: a.keySize,
        location: a.location ?? `${a.kind}:${a.identifier}`,
        quantumSafe: false,
      })),
    };

    send({ type: 'completed', report });
    return report;
  } catch (err) {
    if (err instanceof CorsBlockedError || err instanceof AuthError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'failed', error: message });
    throw err;
  }
}
