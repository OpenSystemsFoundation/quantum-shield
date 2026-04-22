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
  userLicense: string;
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
}

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
  type: 'certificate' | 'key' | 'algorithm' | 'protocol' | 'library';
  algorithm: string;
  keySize?: number;
  location: string;
  quantumSafe: boolean;
}

export interface Report {
  schemaVersion: '1';
  generatedAt: string;
  scanStartedAt: string;
  scanFinishedAt: string;
  org: OrgIdentity;
  findings: Finding[];
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
    earliestDeadline?: string;
    postureSentence: string;
    hndlFindings: number;
  };
  cbom: CbomComponent[];
}
