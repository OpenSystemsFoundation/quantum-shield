import type {
  Category,
  CategoryCoverage,
  CryptoAsset,
  Finding,
  OverlayScope,
  Report,
  Severity,
} from '@lib/pdf';
import { evaluate, ruleCatalogFor } from '../rules/engine.js';
import { tlsProbeRules } from '../rules/tls-rules.js';
import { GENERATED_OVERLAYS, GENERATED_SOURCE_VERSIONS } from '../rules/regulations.generated.js';
import { QSHIELD_NAME, QSHIELD_VERSION } from '../version.js';
import {
  AuthError,
  CorsBlockedError,
  NetworkError,
  type ScanClient,
  SfClient,
} from './sfClient.js';
import { allScanners, ScannerPartialError, ScannerSkipError } from './scanners.js';
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
  coverage: CategoryCoverage[],
): Promise<void> {
  const scanners = allScanners();
  const send = (e: ScanEvent) => emit(e);

  for (const scanner of scanners) {
    const progressBase = { category: scanner.category, label: scanner.label };
    send({
      type: 'scanner-progress',
      progress: { ...progressBase, status: 'running', startedAt: new Date().toISOString() },
    });
    let count = 0;
    try {
      await scanner.scan(client, (asset: CryptoAsset) => {
        count += 1;
        assets.push(asset);
        send({ type: 'asset', category: scanner.category, asset });
      });
      coverage.push({
        id: scanner.category,
        label: scanner.label,
        status: 'scanned',
        assetCount: count,
        findingCount: 0,
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
      // Transport/auth problems abort the whole scan — every remaining
      // category would fail the same way and a partial report would mislead.
      if (err instanceof CorsBlockedError) {
        send({ type: 'failed', kind: 'cors', error: err.message });
        throw err;
      }
      if (err instanceof AuthError) {
        send({ type: 'failed', kind: 'auth', error: err.message });
        throw err;
      }
      if (err instanceof NetworkError) {
        send({ type: 'failed', kind: 'unknown', error: err.message });
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof ScannerSkipError) {
        coverage.push({
          id: scanner.category,
          label: scanner.label,
          status: 'skipped',
          assetCount: count,
          findingCount: 0,
          detail: message,
        });
        send({
          type: 'scanner-progress',
          progress: {
            ...progressBase,
            status: 'skipped',
            assetCount: count,
            error: message,
            finishedAt: new Date().toISOString(),
          },
        });
        send({ type: 'log', level: 'info', message: `${scanner.category} skipped: ${message}` });
        continue;
      }

      const status = err instanceof ScannerPartialError ? 'partial' : 'failed';
      coverage.push({
        id: scanner.category,
        label: scanner.label,
        status,
        assetCount: count,
        findingCount: 0,
        detail: message,
      });
      send({
        type: 'scanner-progress',
        progress: {
          ...progressBase,
          status: 'failed',
          assetCount: count,
          error: message,
          finishedAt: new Date().toISOString(),
        },
      });
      send({
        type: 'log',
        level: 'warn',
        message: `${scanner.category} ${status === 'partial' ? 'partially failed' : 'failed'}: ${message}`,
      });
    }
  }
}

async function runEndpointProbes(
  probe: EndpointProbe,
  assets: CryptoAsset[],
  emit: ScanEventListener,
  coverage: CategoryCoverage[],
): Promise<void> {
  const endpoints = new Map<string, CryptoAsset>();
  for (const asset of assets) {
    if (!asset.endpointUrl) continue;
    if (asset.kind === 'tls-endpoint') continue;
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
  const failures: string[] = [];
  for (const [origin, source] of endpoints) {
    const result = await probe.probe(origin);
    if (!result.ok) {
      failures.push(`${origin} (${result.error ?? 'unknown'})`);
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
      hybridKem: result.hybridKemNegotiated,
      location: `discovered via ${source.kind}:${source.identifier}`,
    };
    assets.push(asset);
    emit({ type: 'asset', category: 'named-credentials', asset });
  }

  const status: CategoryCoverage['status'] =
    failures.length === 0 ? 'scanned' : probed > 0 ? 'partial' : 'failed';
  const detailParts: string[] = [];
  if (failures.length > 0) {
    detailParts.push(
      `${failures.length} of ${endpoints.size} endpoints unreachable: ${failures.slice(0, 5).join(', ')}${failures.length > 5 ? ', …' : ''}`,
    );
  }
  coverage.push({
    id: 'tls-probe',
    label: 'TLS endpoint probing',
    status,
    assetCount: probed,
    findingCount: 0,
    ...(detailParts.length > 0 ? { detail: detailParts.join(' · ') } : {}),
  });

  emit({
    type: 'scanner-progress',
    progress: {
      category: 'named-credentials',
      label: 'TLS endpoint probing',
      status: failures.length > 0 && probed === 0 ? 'failed' : 'completed',
      assetCount: probed,
      ...(failures.length > 0 ? { error: `${failures.length} endpoint(s) unreachable` } : {}),
      finishedAt: new Date().toISOString(),
    },
  });
}

function findingCountFor(entry: CategoryCoverage, findings: Finding[]): number {
  if (entry.id === 'tls-probe') {
    return findings.filter((f) => f.asset.kind === 'tls-endpoint').length;
  }
  if (entry.id === 'named-credentials') {
    return findings.filter((f) => f.category === 'named-credentials' && f.asset.kind !== 'tls-endpoint').length;
  }
  return findings.filter((f) => f.category === entry.id).length;
}

function postureSentence(
  orgName: string,
  findings: Finding[],
  severityCounts: Record<Severity, number>,
  categoryCounts: Record<Category, number>,
  coverage: CategoryCoverage[],
): string {
  const unverified = coverage.filter((c) => c.status === 'failed' || c.status === 'partial');
  const coverageCaveat =
    unverified.length > 0
      ? ` Note: ${unverified.length} scan categor${unverified.length === 1 ? 'y' : 'ies'} could not be fully scanned — zero findings there does not mean clean; see scan coverage.`
      : '';

  if (findings.length === 0) {
    return `${orgName} has no detectable cryptographic findings against the currently enabled sources. Re-scan after every major configuration change.${coverageCaveat}`;
  }

  const activeCategories = Object.values(categoryCounts).filter((n) => n > 0).length;
  return (
    `${orgName} has ${findings.length} cryptographic finding${findings.length === 1 ? '' : 's'} across ` +
    `${activeCategories} asset categor${activeCategories === 1 ? 'y' : 'ies'}. ` +
    `${severityCounts.critical} must be remediated immediately to restore baseline compliance; ` +
    `the remainder should be scheduled against the applicable post-quantum migration milestones (2030 deprecation, 2033 prohibition).` +
    coverageCaveat
  );
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
  const coverage: CategoryCoverage[] = [];

  try {
    if (options.mock) {
      await scanWithClient(new SnapshotSfClient(LIVE_ORG_SCAN_SNAPSHOT), emit, assets, coverage);
    } else {
      await scanWithClient(new SfClient(options.session), emit, assets, coverage);
    }

    if (options.probeTls && probe) {
      try {
        await runEndpointProbes(probe, assets, emit, coverage);
      } catch (err) {
        const message = (err as Error).message;
        coverage.push({
          id: 'tls-probe',
          label: 'TLS endpoint probing',
          status: 'failed',
          assetCount: 0,
          findingCount: 0,
          detail: message,
        });
        emit({ type: 'log', level: 'warn', message: `TLS probing pass failed: ${message}` });
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
    for (const entry of coverage) {
      entry.findingCount = findingCountFor(entry, findings);
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

    const orgName = options.session.org.orgName ?? options.session.org.orgId;
    const finishedAt = new Date();
    const report: Report = {
      schemaVersion: '1',
      generatedAt: finishedAt.toISOString(),
      scanStartedAt: startedAt.toISOString(),
      scanFinishedAt: finishedAt.toISOString(),
      generator: {
        name: QSHIELD_NAME,
        version: QSHIELD_VERSION,
        mode: options.generatorMode ?? 'browser',
      },
      org: {
        orgId: options.session.org.orgId,
        instanceUrl: options.session.instanceUrl,
        orgName,
        orgType: (options.session.org.orgType?.toLowerCase() as Report['org']['orgType']) ?? 'production',
        apiVersion: options.session.apiVersion,
        userLicense: 'Salesforce',
      },
      findings,
      coverage,
      overlays,
      sourceVersions: GENERATED_SOURCE_VERSIONS,
      summary: {
        totalFindings: findings.length,
        bySeverity: severityCounts,
        byCategory: categoryCounts,
        earliestDeadline: deadlines[0],
        hndlFindings: hndlCount,
        postureSentence: postureSentence(orgName, findings, severityCounts, categoryCounts, coverage),
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
        quantumSafe:
          a.kind === 'tls-endpoint'
            ? a.hybridKem === true
            : a.algorithm === 'AES' && (a.keySize ?? 0) >= 256,
      })),
    };

    send({ type: 'completed', report });
    return report;
  } catch (err) {
    if (err instanceof CorsBlockedError || err instanceof AuthError || err instanceof NetworkError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'failed', error: message });
    throw err;
  }
}
