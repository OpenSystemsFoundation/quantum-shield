export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type MigrationPosture =
  | 'replace-now'
  | 'plan-2030'
  | 'prepare-2033'
  | 'advisory';

export type RegulatoryStatus =
  | 'already-non-compliant'
  | 'deprecated-by-date'
  | 'disallowed-by-date'
  | 'advisory';

export type Jurisdiction =
  | 'EU'
  | 'NL'
  | 'DE'
  | 'FR'
  | 'UK'
  | 'US'
  | 'INTL';

export type Category =
  | 'certificates'
  | 'connected-apps'
  | 'named-credentials'
  | 'remote-sites'
  | 'sso'
  | 'shield-encryption'
  | 'apex-crypto'
  | 'session-login'
  | 'packages';

export type EffortLevel = 'low' | 'medium' | 'high';

export interface Citation {
  sourceId: string;
  title: string;
  jurisdiction: Jurisdiction;
  section?: string;
  documentVersion: string;
  retrievalUrl: string;
}

export interface OrgIdentity {
  orgId: string;
  instanceUrl: string;
  orgName: string;
  orgType: 'production' | 'sandbox' | 'developer' | 'scratch';
  apiVersion: string;
  /**
   * Licence of the scanning user, when known. Neither front-end queries it
   * today, so new reports omit it instead of asserting a guessed value.
   */
  userLicense?: string;
}

export interface CryptoAsset {
  kind:
    | 'certificate'
    | 'connected-app'
    | 'named-credential'
    | 'external-credential'
    | 'remote-site'
    | 'external-data-source'
    | 'saml-sso'
    | 'oidc-provider'
    | 'shield-key'
    | 'apex-call'
    | 'installed-package'
    | 'session-settings'
    | 'tls-endpoint';
  name: string;
  identifier: string;
  location?: string;
  algorithm?: string;
  keySize?: number;
  signatureHash?: string;
  issuer?: string;
  expiresAt?: string;
  endpointUrl?: string;
  /** TLS protocol version reported by a probe, e.g. "TLSv1.2" */
  tlsVersion?: string;
  /** Ephemeral KEX group reported by a probe, e.g. "X25519MLKEM768" */
  kexGroup?: string;
  /** True if probe saw a negotiated PQC hybrid KEM */
  hybridKem?: boolean;
  /** ISO timestamp of the most recent key rotation (e.g. Shield tenant secret version) */
  lastRotatedAt?: string;
  /**
   * What the primitive is used for, when the scanner can tell. Harvest-now-
   * decrypt-later exposure only applies to `encryption` and
   * `key-establishment`; signatures, digests and MACs cannot be attacked
   * retroactively by recording traffic today.
   */
  usage?: CryptoUsage;
}

export type CryptoUsage =
  | 'signature'
  | 'encryption'
  | 'key-establishment'
  | 'digest'
  | 'mac'
  | 'key-generation'
  | 'key-material';

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  regulatoryStatus: RegulatoryStatus;
  migrationPosture: MigrationPosture;
  effort: EffortLevel;
  hndlExposure: boolean;
  title: string;
  asset: CryptoAsset;
  currentCrypto: string;
  recommendedReplacement: string;
  rationale: string;
  citations: Citation[];
  deadline?: string;
  /**
   * Regulatory overlay frameworks this finding maps to (rule-declared).
   * Populated regardless of which overlays were enabled for the scan; the
   * regulatory appendix filters to the enabled subset.
   */
  overlayIds?: string[];
  /**
   * Harvest-now-decrypt-later priority under the report's risk assumptions.
   * Absent on reports written before prioritisation existed; viewers
   * recompute it from `report.dataProfile` and the reader's assumptions.
   */
  priority?: FindingPriority;
}

/**
 * How long data must stay confidential, from least to most demanding.
 * `none` means the finding does not protect stored or transmitted data at all
 * (signatures, certificates), so shelf life does not apply.
 */
export type DataTier = 'none' | 'ephemeral' | 'internal' | 'confidential' | 'personal' | 'regulated';

export type PriorityBand = 'act-now' | 'plan' | 'monitor';

export interface RiskAssumptions {
  /** Year a cryptographically relevant quantum computer is assumed to exist. */
  quantumYear: number;
  /** Years each data tier must stay confidential (shelf life). */
  shelfLifeYears: Record<Exclude<DataTier, 'none'>, number>;
  /** Years a fix takes, by finding effort. */
  migrationYears: Record<EffortLevel, number>;
}

export interface FindingPriority {
  band: PriorityBand;
  /** 1 = most urgent; ranks are unique within a report. */
  rank: number;
  dataTier: DataTier;
  /** Where the data tier came from, in plain words. */
  dataBasis: string;
  shelfLifeYears: number;
  migrationYears: number;
  yearsToQuantum: number;
  /**
   * shelf life + migration − years to quantum. Positive: data recorded today
   * would still need protecting after a quantum computer could read it.
   */
  marginYears: number;
  reason: string;
}

export type SensitiveDataSource = 'classification' | 'compliance' | 'shield' | 'default';

export interface SensitiveDataEntry {
  object: string;
  /** Field API name; absent for object-level best-practice defaults. */
  field?: string;
  tier: Exclude<DataTier, 'none'>;
  sources: SensitiveDataSource[];
  /** e.g. "Restricted · PII;GDPR · Shield-encrypted" */
  detail: string;
}

export interface DataProfile {
  entries: SensitiveDataEntry[];
  /** Highest tier found anywhere in the org (drives integrations by default). */
  orgTier: Exclude<DataTier, 'none'>;
  /** Highest tier among Shield-encrypted fields, when any were visible. */
  shieldTier?: Exclude<DataTier, 'none'>;
  /** Objects inspected for classification / encryption. */
  objectsInspected: number;
  /** User-facing caveat, e.g. field-level security limits. */
  note?: string;
}

export interface OverlayScope {
  id:
    | 'gdpr'
    | 'dora'
    | 'nis2'
    | 'eidas2'
    | 'pci-dss-4'
    | 'hipaa'
    | 'cmmc'
    | 'swift-csp';
  label: string;
  enabled: boolean;
}

export interface CbomComponent {
  name: string;
  /**
   * `library` is kept for reports written by older versions; the scan engine
   * no longer emits it (installed packages are not cryptographic assets).
   */
  type: 'certificate' | 'key' | 'algorithm' | 'protocol' | 'library';
  algorithm: string;
  keySize?: number;
  location: string;
  /**
   * Tri-state: `true` / `false` when the scanner observed enough to say,
   * `null` when it could not tell (e.g. an HTTPS endpoint that was not
   * probed). Unknown must never be rendered as "No".
   */
  quantumSafe: boolean | null;
  /** What the primitive is used for, when known (drives the CBOM primitive). */
  usage?: CryptoUsage;
  /** Protocol components: 'tls' when the asset is an HTTPS/TLS endpoint. */
  protocol?: 'tls' | 'http' | 'other';
  /** Protocol components: negotiated version, e.g. '1.3' (probe only). */
  protocolVersion?: string;
  /** Certificate components: ISO expiry timestamp. */
  notValidAfter?: string;
}

/**
 * Outcome of one scan category (or the TLS probe pass).
 *
 * - `scanned`  — every query for the category completed.
 * - `partial`  — some data was collected but at least one sub-query failed;
 *                results for this category are incomplete.
 * - `failed`   — the category could not be scanned at all.
 * - `skipped`  — the underlying feature is not available in this org
 *                (e.g. Shield Platform Encryption not licensed).
 */
export type CoverageStatus = 'scanned' | 'partial' | 'failed' | 'skipped';

export interface CategoryCoverage {
  /**
   * Category id, 'tls-probe' for the live TLS probing pass, or
   * 'data-profile' for the data-sensitivity pass that feeds prioritisation.
   */
  id: Category | 'tls-probe' | 'data-profile';
  label: string;
  status: CoverageStatus;
  assetCount: number;
  findingCount: number;
  /** Failure detail or skip reason — user-facing, no stack traces. */
  detail?: string;
}

export interface ReportGenerator {
  name: string;
  version: string;
  /** Which front-end produced this report. */
  mode: 'cli' | 'browser';
}

export interface Report {
  schemaVersion: '1';
  generatedAt: string;
  scanStartedAt: string;
  scanFinishedAt: string;
  generator: ReportGenerator;
  org: OrgIdentity;
  findings: Finding[];
  /**
   * Per-category scan outcome. Consumers MUST treat categories whose status
   * is not `scanned` as unverified — zero findings there does not mean clean.
   */
  coverage: CategoryCoverage[];
  overlays: OverlayScope[];
  sourceVersions: {
    sourceId: string;
    documentVersion: string;
    retrievedAt: string;
  }[];
  summary: {
    totalFindings: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<Category, number>;
    /** Earliest finding deadline that is still in the future at scan time. */
    earliestDeadline?: string;
    postureSentence: string;
    hndlFindings: number;
    /** Findings per priority band under `riskAssumptions`. */
    priorityCounts?: Record<PriorityBand, number>;
  };
  /** Sensitive data the scan found (or assumed) — input to prioritisation. */
  dataProfile?: DataProfile;
  /** Assumptions the stored `finding.priority` values were computed with. */
  riskAssumptions?: RiskAssumptions;
  cbom: CbomComponent[];
}
