import type {
  Category,
  CategoryCoverage,
  CbomComponent,
  CryptoAsset,
  Finding,
  OverlayScope,
  Report,
  Severity,
} from '@lib/pdf';
import { evaluate, ruleCatalogFor, scopeCitationsToRegions } from '../rules/engine.js';
import { tlsProbeRules } from '../rules/tls-rules.js';
import { keyRotationRules } from '../rules/key-rotation-rules.js';
import { calloutRules } from '../rules/callout-rules.js';
import { GENERATED_OVERLAYS, GENERATED_SOURCE_VERSIONS } from '../rules/regulations.generated.js';
import { classifyCryptoAsset } from '../pdf/crypto-classification.js';
import type { DataProfile } from '../pdf/types.js';
import { buildDataProfile } from '../priority/profile.js';
import { DEFAULT_ASSUMPTIONS } from '../priority/defaults.js';
import { prioritize, priorityCounts } from '../priority/score.js';
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
  // Probe with bounded concurrency: orgs can reference dozens of endpoints,
  // some stale — strictly sequential probing with an 8s timeout each would
  // stall the scan for minutes.
  const PROBE_CONCURRENCY = 5;
  const queue = [...endpoints.entries()];
  const runOne = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [origin, source] = next;
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
        location:
          `discovered via ${source.kind}:${source.identifier}` +
          (result.certificateTrusted === false
            ? ` · certificate not trusted by the scanning machine (${result.authorizationError ?? 'verification failed'})`
            : ''),
        usage: 'key-establishment',
      };
      if (result.certificateTrusted === false) {
        emit({
          type: 'log',
          level: 'info',
          message: `${origin}: certificate did not verify against the local CA store (${result.authorizationError ?? 'unknown'}); handshake inspected anyway`,
        });
      }
      assets.push(asset);
      emit({ type: 'asset', category: 'named-credentials', asset });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, runOne));

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

const DATA_PROFILE_LABEL = 'Data sensitivity (for prioritisation)';

/**
 * Reads field classification, Shield-encrypted fields and the standard
 * objects present, to estimate how long the org's data must stay secret.
 * Failures never abort the scan: prioritisation falls back to assuming
 * personal data, and coverage records what could not be read.
 */
async function runDataProfile(
  client: ScanClient,
  emit: ScanEventListener,
  coverage: CategoryCoverage[],
): Promise<DataProfile | undefined> {
  // Reported as log lines, not scanner-progress: it is not a crypto
  // category and must not overwrite a category row in the scan view.
  emit({ type: 'log', level: 'info', message: `reading ${DATA_PROFILE_LABEL.toLowerCase()}…` });
  try {
    const { profile, failures } = await buildDataProfile(client);
    const status: CategoryCoverage['status'] =
      failures.length === 0 ? 'scanned' : profile.entries.length > 0 ? 'partial' : 'failed';
    coverage.push({
      id: 'data-profile',
      label: DATA_PROFILE_LABEL,
      status,
      assetCount: profile.entries.length,
      findingCount: 0,
      ...(failures.length > 0
        ? { detail: `${failures.length} metadata quer${failures.length === 1 ? 'y' : 'ies'} failed; priorities use best-practice defaults where data was missing. ${failures[0]}` }
        : {}),
    });
    emit({
      type: 'log',
      level: status === 'scanned' ? 'info' : 'warn',
      message: `${DATA_PROFILE_LABEL} · ${profile.entries.length} sensitive objects/fields · org data tier: ${profile.orgTier}`,
    });
    return profile;
  } catch (err) {
    if (err instanceof CorsBlockedError || err instanceof AuthError || err instanceof NetworkError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    coverage.push({ id: 'data-profile', label: DATA_PROFILE_LABEL, status: 'failed', assetCount: 0, findingCount: 0, detail: message });
    emit({ type: 'log', level: 'warn', message: `data sensitivity pass failed: ${message}` });
    return undefined;
  }
}

function findingCountFor(entry: CategoryCoverage, findings: Finding[]): number {
  if (entry.id === 'data-profile') return 0;
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
  categoryCounts: Record<Category, number>,
  coverage: CategoryCoverage[],
): string {
  const unverified = coverage.filter((c) => c.id !== 'data-profile' && (c.status === 'failed' || c.status === 'partial'));
  const coverageCaveat =
    unverified.length > 0
      ? ` Note: ${unverified.length} scan categor${unverified.length === 1 ? 'y' : 'ies'} could not be fully scanned — zero findings there does not mean clean; see scan coverage.`
      : '';

  if (findings.length === 0) {
    return `${orgName} has no detectable cryptographic findings against the currently enabled sources. Re-scan after every major configuration change.${coverageCaveat}`;
  }

  const activeCategories = Object.values(categoryCounts).filter((n) => n > 0).length;
  // "Now" is every finding the rules mark replace-now, whatever its severity:
  // a high-severity plaintext endpoint is as immediate as a critical one.
  const immediate = findings.filter((f) => f.migrationPosture === 'replace-now').length;
  const rest = findings.length - immediate;
  const immediateSentence =
    immediate > 0
      ? `${immediate} should be remediated now, independent of the post-quantum timeline`
      : 'None requires immediate remediation';
  const restSentence =
    rest > 0
      ? `; the remaining ${rest} should be scheduled against the post-quantum migration milestones (NIST IR 8547: quantum-vulnerable algorithms deprecated after 2030, disallowed after 2035) or reviewed as advisories.`
      : '.';
  return (
    `${orgName} has ${findings.length} cryptographic finding${findings.length === 1 ? '' : 's'} across ` +
    `${activeCategories} asset categor${activeCategories === 1 ? 'y' : 'ies'}. ` +
    immediateSentence +
    restSentence +
    coverageCaveat
  );
}

/** "TLSv1.3" → "1.3". */
function tlsVersionNumber(version: string | undefined): string | undefined {
  const match = /(\d+(?:\.\d+)?)$/.exec(version ?? '');
  return match ? match[1] : undefined;
}

function endpointProtocol(endpointUrl: string | undefined): 'tls' | 'http' | undefined {
  if (!endpointUrl) return undefined;
  try {
    const protocol = new URL(endpointUrl).protocol;
    return protocol === 'https:' ? 'tls' : protocol === 'http:' ? 'http' : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Maps a scanned asset to a CBOM entry, or `null` when the asset carries no
 * cryptographic fact. Session settings, Connected Apps, auth providers and
 * installed packages are inventory the scanner reads, but nothing about their
 * cryptography is observable, so listing them in a *cryptographic* bill of
 * materials (as keys or libraries with an "unknown" algorithm) would be
 * fabrication.
 */
export function cbomComponentFor(a: CryptoAsset): CbomComponent | null {
  const location = a.location ?? `${a.kind}:${a.identifier}`;
  switch (a.kind) {
    case 'session-settings':
    case 'connected-app':
    case 'oidc-provider':
    case 'installed-package':
      return null;

    case 'certificate':
      return {
        name: a.name,
        type: 'certificate',
        algorithm: a.algorithm ?? 'unknown',
        keySize: a.keySize,
        location,
        quantumSafe: a.algorithm ? false : null,
        ...(a.expiresAt ? { notValidAfter: a.expiresAt } : {}),
      };

    case 'tls-endpoint':
      return {
        name: a.name,
        type: 'protocol',
        algorithm: a.algorithm ?? 'unknown',
        location,
        // `hybridKem` is undefined when the probe could not tell.
        quantumSafe: a.hybridKem ?? null,
        protocol: 'tls',
        ...(tlsVersionNumber(a.tlsVersion) ? { protocolVersion: tlsVersionNumber(a.tlsVersion) } : {}),
      };

    case 'named-credential':
    case 'remote-site':
    case 'external-data-source': {
      const protocol = endpointProtocol(a.endpointUrl);
      if (!protocol) return null;
      return {
        name: a.name,
        type: 'protocol',
        algorithm: protocol === 'tls' ? 'TLS (version and cipher not probed)' : 'HTTP (no TLS)',
        location: a.endpointUrl ?? location,
        // Plaintext HTTP protects nothing. For HTTPS the key exchange is
        // unknown until the endpoint is probed (see the tls-endpoint entry).
        quantumSafe: protocol === 'http' ? false : null,
        protocol,
      };
    }

    case 'external-credential':
      if (!a.algorithm) return null;
      return {
        name: a.name,
        type: 'protocol',
        algorithm: a.algorithm,
        location,
        quantumSafe: null,
        protocol: 'other',
      };

    case 'saml-sso':
      if (!a.algorithm) return null;
      return {
        name: a.name,
        type: 'algorithm',
        algorithm: a.signatureHash ? `${a.algorithm}-${a.signatureHash.replace('-', '')}` : a.algorithm,
        keySize: a.keySize,
        location,
        quantumSafe: false,
        usage: a.usage ?? 'signature',
      };

    case 'shield-key':
      return {
        name: a.name,
        type: 'key',
        algorithm: a.algorithm ?? 'AES',
        keySize: a.keySize,
        location,
        quantumSafe: a.algorithm === 'AES' && (a.keySize ?? 0) >= 256,
        usage: a.usage ?? 'key-material',
      };

    case 'apex-call': {
      const algorithm = a.algorithm ?? 'unknown';
      const hardcoded = algorithm.toUpperCase().startsWith('HARDCODED');
      return {
        name: a.name,
        type: hardcoded ? 'key' : 'algorithm',
        algorithm,
        keySize: a.keySize,
        location,
        // Decided per algorithm by classifyCryptoAsset; unknown until then.
        quantumSafe: null,
        ...(a.usage ? { usage: a.usage } : {}),
      };
    }
  }
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
    const client: ScanClient = options.mock
      ? new SnapshotSfClient(LIVE_ORG_SCAN_SNAPSHOT)
      : new SfClient(options.session);
    await scanWithClient(client, emit, assets, coverage);

    let dataProfile: DataProfile | undefined;
    if (!options.skipDataProfile) {
      dataProfile = await runDataProfile(client, emit, coverage);
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

    const regions = (options.regions ?? []) as string[];
    const rules = [
      ...ruleCatalogFor(options.overlays, regions),
      ...tlsProbeRules(),
      ...keyRotationRules(),
      ...calloutRules(),
    ];
    const ctx = { scanId: options.scanId, now: new Date() };
    const findings: Finding[] = [];
    const dedupe = new Set<string>();
    for (const asset of assets) {
      const produced = evaluate(asset, rules, ctx);
      for (const f of produced) {
        // Regions scope and order the citations; they never suppress the
        // finding itself.
        f.citations = scopeCitationsToRegions(f.citations, regions);
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

    const riskAssumptions = options.riskAssumptions ?? DEFAULT_ASSUMPTIONS;
    const priorities = prioritize({
      findings,
      dataProfile,
      scanDate: startedAt,
      assumptions: riskAssumptions,
    });
    for (const f of findings) f.priority = priorities.get(f.id);
    findings.sort((a, b) => (a.priority?.rank ?? 0) - (b.priority?.rank ?? 0));

    const hndlCount = findings.filter((f) => f.hndlExposure).length;
    // Earliest deadline that is still ahead. Dates already in the past
    // (SHA-1 signatures disallowed since 2013, an expired certificate) are
    // not "the next deadline" — the PDF reports those as overdue instead.
    const today = startedAt.toISOString().slice(0, 10);
    const deadlines = findings
      .map((f) => f.deadline)
      .filter((d): d is string => Boolean(d) && /^\d{4}-\d{2}-\d{2}/.test(d as string))
      .filter((d) => d.slice(0, 10) >= today)
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
        postureSentence: postureSentence(orgName, findings, categoryCounts, coverage),
        priorityCounts: priorityCounts(priorities.values()),
      },
      ...(dataProfile ? { dataProfile } : {}),
      riskAssumptions,
      cbom: assets
        .map((a) => cbomComponentFor(a))
        .filter((c): c is CbomComponent => c !== null)
        // One source of truth for quantum safety: the classifier that also
        // drives the CycloneDX export, so the PDF table and the CBOM agree.
        .map((c) => ({ ...c, quantumSafe: classifyCryptoAsset(c).quantumSafe })),
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
