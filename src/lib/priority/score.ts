import type {
  CryptoAsset,
  DataProfile,
  DataTier,
  Finding,
  FindingPriority,
  PriorityBand,
  Report,
  RiskAssumptions,
  Severity,
} from '../pdf/types.js';
import { DEFAULT_ASSUMPTIONS, TIER_LABELS, type StoredTier } from './defaults.js';

/**
 * A finding whose margin is within this many years of the quantum date is
 * "plan": not yet exposed, but the slack is smaller than a typical budget
 * and procurement cycle.
 */
export const PLAN_WINDOW_YEARS = 3;

/** Reader overrides: what a given asset carries, keyed by `assetKey()`. */
export type AssetTierOverrides = Record<string, StoredTier>;

export function assetKey(asset: Pick<CryptoAsset, 'kind' | 'identifier'>): string {
  return `${asset.kind}:${asset.identifier}`;
}

/** Assets that move data between Salesforce and somewhere else. */
const TRANSIT_KINDS = new Set<CryptoAsset['kind']>([
  'named-credential',
  'external-credential',
  'remote-site',
  'external-data-source',
  'tls-endpoint',
]);

export function canOverrideTier(asset: CryptoAsset): boolean {
  return TRANSIT_KINDS.has(asset.kind) || asset.kind === 'apex-call' || asset.kind === 'shield-key';
}

interface TierResult {
  tier: DataTier;
  basis: string;
}

function strongestDescription(profile: DataProfile | undefined, tier: StoredTier): string {
  const example = profile?.entries.find((e) => e.tier === tier);
  if (!example) return TIER_LABELS[tier].toLowerCase();
  const where = example.field ? `${example.object}.${example.field}` : example.object;
  return `${TIER_LABELS[tier].toLowerCase()} (e.g. ${where})`;
}

/** Which data tier a finding's asset protects, and why we think so. */
export function dataTierFor(
  finding: Finding,
  profile: DataProfile | undefined,
  overrides: AssetTierOverrides = {},
): TierResult {
  const asset = finding.asset;
  const override = overrides[assetKey(asset)];
  if (override) return { tier: override, basis: `Set by you: ${TIER_LABELS[override].toLowerCase()}` };

  // Signatures, certificates, digests and identity configuration protect
  // authenticity, not stored or transmitted data.
  const carriesData =
    TRANSIT_KINDS.has(asset.kind) ||
    asset.kind === 'shield-key' ||
    asset.kind === 'session-settings' ||
    (asset.kind === 'apex-call' && (asset.usage === 'encryption' || asset.usage === 'key-establishment'));
  if (!carriesData) {
    return { tier: 'none', basis: 'Protects authenticity, not data: nothing recorded today can be decrypted later' };
  }

  const orgTier: StoredTier = profile?.orgTier ?? 'personal';
  if (asset.kind === 'session-settings') {
    return { tier: 'ephemeral', basis: 'Session data expires quickly' };
  }
  if (asset.kind === 'shield-key') {
    if (profile?.shieldTier) {
      return {
        tier: profile.shieldTier,
        basis: `Protects Shield-encrypted fields: ${strongestDescription(profile, profile.shieldTier)}`,
      };
    }
    return { tier: orgTier, basis: `Assumed to protect the org’s most sensitive data: ${strongestDescription(profile, orgTier)}` };
  }
  if (TRANSIT_KINDS.has(asset.kind)) {
    return {
      tier: orgTier,
      basis: `Assumed to carry the org’s most sensitive data: ${strongestDescription(profile, orgTier)}`,
    };
  }
  if (asset.kind === 'apex-call') {
    return { tier: orgTier, basis: `Assumed to encrypt the org’s most sensitive data: ${strongestDescription(profile, orgTier)}` };
  }
  return { tier: orgTier, basis: `Assumed: ${strongestDescription(profile, orgTier)}` };
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const BAND_RANK: Record<PriorityBand, number> = { 'act-now': 0, plan: 1, monitor: 2 };
const TIER_RANK: Record<DataTier, number> = {
  regulated: 0,
  personal: 1,
  confidential: 2,
  internal: 3,
  ephemeral: 4,
  none: 5,
};

function scanYear(scanDate: string | Date): number {
  const d = typeof scanDate === 'string' ? new Date(scanDate) : scanDate;
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  // Fractional so a scan in December is not a full year better off than one in January.
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Unranked priority for one finding (rank is assigned by `prioritize`). */
export function scoreFinding(
  finding: Finding,
  profile: DataProfile | undefined,
  assumptions: RiskAssumptions,
  scanDate: string | Date,
  overrides: AssetTierOverrides = {},
): Omit<FindingPriority, 'rank'> {
  const { tier, basis } = dataTierFor(finding, profile, overrides);
  // Shelf life only matters when recorded ciphertext could be decrypted
  // later; for anything else the deadline is just migration vs quantum date.
  const shelf = tier === 'none' || !finding.hndlExposure ? 0 : assumptions.shelfLifeYears[tier];
  const migration = assumptions.migrationYears[finding.effort];
  const yearsToQuantum = round1(assumptions.quantumYear - scanYear(scanDate));
  const margin = round1(shelf + migration - yearsToQuantum);

  const classicallyWeak = finding.regulatoryStatus === 'already-non-compliant' || finding.migrationPosture === 'replace-now';

  let band: PriorityBand;
  let reason: string;
  if (classicallyWeak) {
    band = 'act-now';
    reason = 'Weak or non-compliant today, before any quantum computer exists.';
  } else if (margin > 0) {
    band = 'act-now';
    reason =
      shelf === 0
        ? `The fix takes longer than the time left before ${assumptions.quantumYear}.`
        : `Data recorded today would still need protecting ${margin} years after a quantum computer could read it.`;
  } else if (margin > -PLAN_WINDOW_YEARS) {
    band = 'plan';
    reason = `Only ${round1(-margin)} years of slack before the ${assumptions.quantumYear} quantum date.`;
  } else {
    band = 'monitor';
    reason = `${round1(-margin)} years of slack before the ${assumptions.quantumYear} quantum date.`;
  }

  return {
    band,
    dataTier: tier,
    dataBasis: basis,
    shelfLifeYears: shelf,
    migrationYears: migration,
    yearsToQuantum,
    marginYears: margin,
    reason,
  };
}

export interface PrioritizeInput {
  findings: Finding[];
  dataProfile?: DataProfile;
  scanDate: string | Date;
  assumptions?: RiskAssumptions;
  overrides?: AssetTierOverrides;
}

/**
 * Scores and ranks every finding. Order: band; then the data at stake (most
 * sensitive first, so plaintext or harvestable traffic carrying regulated
 * data leads); then margin (largest exposure first); then severity; then id
 * for stability. Returns a map keyed by finding id; inputs are not mutated.
 */
export function prioritize(input: PrioritizeInput): Map<string, FindingPriority> {
  const assumptions = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const scored = input.findings.map((f) => ({
    f,
    p: scoreFinding(f, input.dataProfile, assumptions, input.scanDate, input.overrides),
  }));
  scored.sort(
    (a, b) =>
      BAND_RANK[a.p.band] - BAND_RANK[b.p.band] ||
      TIER_RANK[a.p.dataTier] - TIER_RANK[b.p.dataTier] ||
      b.p.marginYears - a.p.marginYears ||
      SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] ||
      a.f.id.localeCompare(b.f.id),
  );
  const out = new Map<string, FindingPriority>();
  scored.forEach(({ f, p }, i) => out.set(f.id, { ...p, rank: i + 1 }));
  return out;
}

export function priorityCounts(priorities: Iterable<FindingPriority>): Record<PriorityBand, number> {
  const counts: Record<PriorityBand, number> = { 'act-now': 0, plan: 0, monitor: 0 };
  for (const p of priorities) counts[p.band] += 1;
  return counts;
}

/** Returns a copy of the report's findings with `priority` filled in and sorted by rank. */
export function withPriorities<T extends { findings: Finding[] }>(
  report: T & { dataProfile?: DataProfile; scanStartedAt: string },
  assumptions: RiskAssumptions = DEFAULT_ASSUMPTIONS,
  overrides: AssetTierOverrides = {},
): Finding[] {
  const map = prioritize({
    findings: report.findings,
    dataProfile: report.dataProfile,
    scanDate: report.scanStartedAt,
    assumptions,
    overrides,
  });
  return report.findings
    .map((f) => ({ ...f, priority: map.get(f.id) }))
    .sort((a, b) => (a.priority?.rank ?? 0) - (b.priority?.rank ?? 0));
}


/**
 * A copy of the report re-prioritised under the reader's assumptions and
 * overrides: findings carry `priority` and are sorted by rank, and the
 * summary and `riskAssumptions` match. Used for the findings view and every
 * export, so what is downloaded is what is on screen.
 */
export function applyRiskSettings<R extends Report>(
  report: R,
  assumptions: RiskAssumptions = DEFAULT_ASSUMPTIONS,
  overrides: AssetTierOverrides = {},
): R {
  const findings = withPriorities(report, assumptions, overrides);
  return {
    ...report,
    findings,
    riskAssumptions: assumptions,
    summary: {
      ...report.summary,
      priorityCounts: priorityCounts(findings.flatMap((f) => (f.priority ? [f.priority] : []))),
    },
  };
}
