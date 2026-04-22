import type {
  Category,
  CryptoAsset,
  Finding,
  OverlayScope,
  Report,
  Severity,
} from '@lib/pdf';
import { evaluate, ruleCatalogFor } from '../rules/engine.js';
import { tlsProbeRules } from '../rules/tls-rules.js';
import { GENERATED_OVERLAYS, GENERATED_SOURCE_VERSIONS } from '../rules/regulations.generated.js';
import { AuthError, CorsBlockedError, type ScanClient, SfClient } from './sfClient.js';
import { allScanners } from './scanners.js';
import type { EndpointProbe } from './probe.js';
import type { ScanEvent, ScanEventListener, ScanOptions } from './types.js';
import { SnapshotSfClient } from './fixtures/client.js';
import { LIVE_ORG_SCAN_SNAPSHOT } from './fixtures/liveOrgSnapshot.generated.js';

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

const OVERLAY_DEFS: OverlayScope[] = GENERATED_OVERLAYS.map((overlay) => ({ ...overlay, enabled: false }));

async function scanWithClient(
  client: ScanClient,
  emit: ScanEventListener,
  assets: CryptoAsset[],
): Promise<void> {
  const scanners = allScanners();
  const send = (e: ScanEvent) => emit(e);

  for (const scanner of scanners) {
    const progressBase = { category: scanner.category, label: scanner.label };
    send({
      type: 'scanner-progress',
      progress: { ...progressBase, status: 'running', startedAt: new Date().toISOString() },
    });
    try {
      let count = 0;
      await scanner.scan(client, (asset: CryptoAsset) => {
        count += 1;
        assets.push(asset);
        send({ type: 'asset', category: scanner.category, asset });
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
        send({ type: 'failed', kind: 'cors', error: err.message });
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

async function runEndpointProbes(
  probe: EndpointProbe,
  assets: CryptoAsset[],
  emit: ScanEventListener,
): Promise<void> {
  const endpoints = new Map<string, CryptoAsset>();
  for (const asset of assets) {
    if (!asset.endpointUrl) continue;
    try {
      const url = new URL(asset.endpointUrl);
      if (url.protocol !== 'https:') continue;
      if (!endpoints.has(url.origin)) endpoints.set(url.origin, asset);
    } catch {
      /* ignore unparseable URLs */
    }
  }

  if (endpoints.size === 0) return;

  emit({
    type: 'scanner-progress',
    progress: {
      category: 'named-credentials',
      label: 'TLS endpoint probing',
      status: 'running',
      startedAt: new Date().toISOString(),
    },
  });

  let probed = 0;
  for (const [origin, source] of endpoints) {
    const result = await probe.probe(origin);
    if (!result.ok) {
      emit({ type: 'log', level: 'warn', message: `probe failed for ${origin}: ${result.error ?? 'unknown'}` });
      continue;
    }
    probed += 1;
    const asset: CryptoAsset = {
      kind: 'tls-endpoint',
      name: `${origin} (probed)`,
      identifier: origin,
      endpointUrl: origin,
      algorithm: result.cipher,
      tlsVersion: result.tlsVersion,
      kexGroup: result.keyExchangeGroup,
      hybridKem: result.hybridKemNegotiated === true,
      location: `discovered via ${source.kind}:${source.identifier}`,
    };
    assets.push(asset);
    emit({ type: 'asset', category: 'named-credentials', asset });
  }

  emit({
    type: 'scanner-progress',
    progress: {
      category: 'named-credentials',
      label: 'TLS endpoint probing',
      status: 'completed',
      assetCount: probed,
      finishedAt: new Date().toISOString(),
    },
  });
}

export async function runScan(
  options: ScanOptions,
  emit: ScanEventListener,
  probe?: EndpointProbe,
): Promise<Report> {
  const startedAt = new Date();
  const send = (e: ScanEvent) => emit(e);
  const scanners = allScanners();

  send({
    type: 'started',
    scanId: options.scanId,
    categories: scanners.map((s) => s.category),
  });

  const assets: CryptoAsset[] = [];

  try {
    if (options.mock) {
      await scanWithClient(new SnapshotSfClient(LIVE_ORG_SCAN_SNAPSHOT), emit, assets);
    } else {
      await scanWithClient(new SfClient(options.session), emit, assets);
    }

    if (options.probeTls && probe) {
      try {
        await runEndpointProbes(probe, assets, emit);
      } catch (err) {
        emit({ type: 'log', level: 'warn', message: `TLS probing pass failed: ${(err as Error).message}` });
      }
    }

    const rules = [
      ...ruleCatalogFor(options.overlays, (options.regions ?? []) as string[]),
      ...tlsProbeRules(),
    ];
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
      sourceVersions: GENERATED_SOURCE_VERSIONS,
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
              : a.kind === 'remote-site' ||
                  a.kind === 'named-credential' ||
                  a.kind === 'external-credential' ||
                  a.kind === 'tls-endpoint'
                ? 'protocol'
                : a.kind === 'installed-package'
                  ? 'library'
                  : 'key',
        algorithm: a.algorithm ?? a.tlsVersion ?? a.endpointUrl ?? 'unknown',
        keySize: a.keySize,
        location: a.location ?? `${a.kind}:${a.identifier}`,
        quantumSafe: a.kind === 'tls-endpoint' ? Boolean(a.hybridKem) : false,
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
