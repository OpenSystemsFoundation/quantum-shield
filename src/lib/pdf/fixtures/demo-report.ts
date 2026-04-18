import type {
  Category,
  Citation,
  Finding,
  OverlayScope,
  Report,
  Severity,
} from '../types.js';

const NIST_FIPS_204: Citation = {
  sourceId: 'NIST-FIPS-204',
  title: 'Module-Lattice-Based Digital Signature Standard (ML-DSA)',
  jurisdiction: 'INTL',
  documentVersion: '2024-08',
  retrievalUrl: 'https://csrc.nist.gov/pubs/fips/204/final',
};

const NIST_FIPS_203: Citation = {
  sourceId: 'NIST-FIPS-203',
  title: 'Module-Lattice-Based Key-Encapsulation Mechanism (ML-KEM)',
  jurisdiction: 'INTL',
  documentVersion: '2024-08',
  retrievalUrl: 'https://csrc.nist.gov/pubs/fips/203/final',
};

const NIST_FIPS_205: Citation = {
  sourceId: 'NIST-FIPS-205',
  title: 'Stateless Hash-Based Digital Signature Standard (SLH-DSA)',
  jurisdiction: 'INTL',
  documentVersion: '2024-08',
  retrievalUrl: 'https://csrc.nist.gov/pubs/fips/205/final',
};

const NIST_SP_800_131A: Citation = {
  sourceId: 'NIST-SP-800-131A-r3',
  title: 'Transitioning the Use of Cryptographic Algorithms and Key Lengths',
  jurisdiction: 'INTL',
  section: '§5.6.1, §6.2.1',
  documentVersion: 'Rev 3',
  retrievalUrl: 'https://csrc.nist.gov/pubs/sp/800/131/a/r3/final',
};

const BSI_TR_02102: Citation = {
  sourceId: 'BSI-TR-02102-1',
  title: 'Cryptographic Mechanisms: Recommendations and Key Lengths',
  jurisdiction: 'DE',
  section: '§3.6, §5',
  documentVersion: '2025-01',
  retrievalUrl:
    'https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr02102/tr02102_node.html',
};

const ENISA_PQC: Citation = {
  sourceId: 'ENISA-PQC-2024',
  title: 'Post-Quantum Cryptography: Integration study',
  jurisdiction: 'EU',
  section: '§4 Migration priorities',
  documentVersion: '2024',
  retrievalUrl: 'https://www.enisa.europa.eu/publications/post-quantum-cryptography-integration-study',
};

const NCSC_NL_PQC: Citation = {
  sourceId: 'NCSC-NL-PQC-factsheet',
  title: 'Factsheet Post-Quantum Cryptography',
  jurisdiction: 'NL',
  documentVersion: '2024',
  retrievalUrl: 'https://www.ncsc.nl/documenten/factsheets/2023/januari/17/factsheet-pqc',
};

const NIS2: Citation = {
  sourceId: 'nis2-directive',
  title: 'NIS 2 Directive — cybersecurity risk-management measures',
  jurisdiction: 'EU',
  section: 'Art. 21(2)(h)',
  documentVersion: '2022/2555',
  retrievalUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj',
};

const DORA: Citation = {
  sourceId: 'dora-regulation',
  title: 'DORA — Digital Operational Resilience Act, ICT risk management',
  jurisdiction: 'EU',
  section: 'Art. 9(2)',
  documentVersion: '2022/2554',
  retrievalUrl: 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj',
};

const GDPR: Citation = {
  sourceId: 'gdpr-art32',
  title: 'GDPR — security of processing',
  jurisdiction: 'EU',
  section: 'Art. 32(1)(a)',
  documentVersion: '2016/679',
  retrievalUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
};

function mkFinding(f: Omit<Finding, 'id'> & { id?: string }): Finding {
  return { id: f.id ?? cryptoId(), ...f } as Finding;
}

function cryptoId(): string {
  return `F-${Math.floor(Math.random() * 1e9).toString(36).toUpperCase()}`;
}

const findings: Finding[] = [
  mkFinding({
    id: 'F-CERT-001',
    category: 'certificates',
    severity: 'critical',
    regulatoryStatus: 'already-non-compliant',
    migrationPosture: 'replace-now',
    effort: 'low',
    hndlExposure: true,
    title: '1024-bit RSA certificate in active use',
    asset: {
      kind: 'certificate',
      name: 'legacy_partner_signing',
      identifier: '03S1x00000ABcDeEAB',
      algorithm: 'RSA',
      keySize: 1024,
      signatureHash: 'SHA-1',
      issuer: 'Self-signed',
      expiresAt: '2026-11-14',
    },
    currentCrypto: 'RSA-1024 with SHA-1 signature; self-signed; expires 2026-11-14',
    recommendedReplacement:
      'Rotate immediately to an ML-DSA (FIPS 204) signing certificate; use ML-KEM (FIPS 203) for any key-transport usage. If interoperability blocks PQC adoption, at minimum move to RSA-3072 with SHA-256 as an interim step.',
    rationale:
      'RSA-1024 and SHA-1 are both already disallowed under NIST SP 800-131A Rev 3 and BSI TR-02102. Use of this certificate is a current compliance failure independent of the quantum timeline. Signatures produced by this key cannot be trusted against any modern regulator.',
    citations: [NIST_SP_800_131A, BSI_TR_02102, NIST_FIPS_204],
    deadline: '2020-12-31',
  }),
  mkFinding({
    id: 'F-CERT-002',
    category: 'certificates',
    severity: 'high',
    regulatoryStatus: 'deprecated-by-date',
    migrationPosture: 'plan-2030',
    effort: 'medium',
    hndlExposure: true,
    title: 'RSA-2048 SAML signing certificate — plan PQC migration',
    asset: {
      kind: 'certificate',
      name: 'sso_saml_signing',
      identifier: '03S1x00000XyZtWEAB',
      algorithm: 'RSA',
      keySize: 2048,
      signatureHash: 'SHA-256',
      issuer: 'Internal CA',
      expiresAt: '2027-06-01',
    },
    currentCrypto: 'RSA-2048 with SHA-256; issued by internal CA; expires 2027-06-01',
    recommendedReplacement:
      'At next rotation, issue an ML-DSA (FIPS 204) certificate. Deploy hybrid (classical + PQC) if IdP peers do not yet support ML-DSA — ENISA and NCSC-NL both endorse hybrid as the transition pattern.',
    rationale:
      'RSA-2048 remains compliant today but is on the deprecation path. BSI TR-02102 recommends migration planning now; ENISA flags SSO signing as a migration priority because SAML assertions are long-lived and harvestable.',
    citations: [BSI_TR_02102, ENISA_PQC, NCSC_NL_PQC, NIST_FIPS_204],
    deadline: '2030-12-31',
  }),
  mkFinding({
    id: 'F-SSO-001',
    category: 'sso',
    severity: 'critical',
    regulatoryStatus: 'already-non-compliant',
    migrationPosture: 'replace-now',
    effort: 'medium',
    hndlExposure: true,
    title: 'SAML assertions signed with SHA-1',
    asset: {
      kind: 'saml-sso',
      name: 'Corporate IdP',
      identifier: 'SamlSsoConfig/00F3x000001aBcD',
    },
    currentCrypto: 'SHA-1 RSA signature on SAML assertions',
    recommendedReplacement:
      'Reconfigure the SSO provider to sign assertions with SHA-256 or SHA-3 immediately. Plan migration to ML-DSA signing at next IdP upgrade window.',
    rationale:
      'SHA-1 is disallowed under SP 800-131A Rev 3 and BSI TR-02102. Exploitable collision attacks on SHA-1 are practical today; this is not a future risk.',
    citations: [NIST_SP_800_131A, BSI_TR_02102, NIS2],
    deadline: '2020-12-31',
  }),
  mkFinding({
    id: 'F-NC-001',
    category: 'named-credentials',
    severity: 'high',
    regulatoryStatus: 'already-non-compliant',
    migrationPosture: 'replace-now',
    effort: 'low',
    hndlExposure: false,
    title: 'Named Credential uses HTTP endpoint',
    asset: {
      kind: 'named-credential',
      name: 'legacy_billing_api',
      identifier: 'NamedCredential/0XA3x000000abCD',
      endpointUrl: 'http://billing-legacy.internal.example/api',
    },
    currentCrypto: 'Plaintext HTTP transport; no TLS',
    recommendedReplacement:
      'Switch endpoint to HTTPS with TLS 1.2+ (TLS 1.3 preferred per BSI TR-02102). Rotate any credentials that traversed the plaintext channel.',
    rationale:
      'GDPR Art. 32 and NIS 2 Art. 21 both require state-of-the-art protection of data in transit. Plaintext HTTP is an immediate compliance failure for any processing of personal or operational data.',
    citations: [GDPR, NIS2, BSI_TR_02102],
    deadline: '2018-05-25',
  }),
  mkFinding({
    id: 'F-NC-002',
    category: 'named-credentials',
    severity: 'medium',
    regulatoryStatus: 'deprecated-by-date',
    migrationPosture: 'plan-2030',
    effort: 'medium',
    hndlExposure: false,
    title: 'External Credential uses ECDSA-P256 client cert',
    asset: {
      kind: 'external-credential',
      name: 'partner_api_mtls',
      identifier: 'ExternalCredential/0XB3x000000bcDE',
      algorithm: 'ECDSA',
      keySize: 256,
    },
    currentCrypto: 'ECDSA P-256 client authentication certificate',
    recommendedReplacement:
      'Plan migration to ML-DSA (FIPS 204). If the partner endpoint does not yet support PQC, deploy a hybrid certificate (classical + ML-DSA) per ENISA guidance.',
    rationale:
      'ECDSA is compliant today but deprecated by 2030 under CNSA 2.0 and BSI guidance. Partner-facing mTLS is a known migration pain point — begin coordination now.',
    citations: [BSI_TR_02102, ENISA_PQC, NIST_FIPS_204],
    deadline: '2030-12-31',
  }),
  mkFinding({
    id: 'F-CA-001',
    category: 'connected-apps',
    severity: 'high',
    regulatoryStatus: 'deprecated-by-date',
    migrationPosture: 'plan-2030',
    effort: 'high',
    hndlExposure: true,
    title: 'Connected App JWT bearer flow signs with RSA-2048',
    asset: {
      kind: 'connected-app',
      name: 'Partner Data Integration',
      identifier: 'ConnectedApplication/0C03x000000Xyz1',
      algorithm: 'RSA',
      keySize: 2048,
    },
    currentCrypto: 'RSA-2048 JWT signing key for OAuth JWT bearer flow',
    recommendedReplacement:
      'Rotate to ML-DSA (FIPS 204) JWT signing once the integration partner adds support. Coordinate via JWKS rotation. SLH-DSA (FIPS 205) is an alternative where stateless hash-based signatures are preferred.',
    rationale:
      'JWT signing keys in long-lived integrations are a harvest-now-decrypt-later concern — captured signed tokens can be retroactively forged if the signing key is ever recovered via a CRQC. NCSC-NL lists service-to-service authentication as a high-priority migration surface.',
    citations: [NCSC_NL_PQC, ENISA_PQC, NIST_FIPS_204, NIST_FIPS_205],
    deadline: '2030-12-31',
  }),
  mkFinding({
    id: 'F-RS-001',
    category: 'remote-sites',
    severity: 'high',
    regulatoryStatus: 'already-non-compliant',
    migrationPosture: 'replace-now',
    effort: 'low',
    hndlExposure: false,
    title: 'Remote Site Setting points at non-TLS endpoint',
    asset: {
      kind: 'remote-site',
      name: 'internal_reporting_http',
      identifier: 'RemoteSiteSetting/0rp3x000000aa',
      endpointUrl: 'http://reporting.internal.example',
    },
    currentCrypto: 'Plaintext HTTP',
    recommendedReplacement:
      'Move endpoint to HTTPS. If the internal service does not support TLS, terminate TLS at a sidecar or reverse proxy.',
    rationale:
      'Plaintext HTTP callouts leak any data in transit. GDPR Art. 32 and NIS 2 require TLS for any personal or operational data.',
    citations: [GDPR, NIS2],
    deadline: '2018-05-25',
  }),
  mkFinding({
    id: 'F-SE-001',
    category: 'shield-encryption',
    severity: 'medium',
    regulatoryStatus: 'advisory',
    migrationPosture: 'plan-2030',
    effort: 'medium',
    hndlExposure: true,
    title: 'Shield Platform Encryption uses AES-128 tenant secrets',
    asset: {
      kind: 'shield-key',
      name: 'Tenant secret (platform-managed)',
      identifier: 'TenantSecret/active',
      algorithm: 'AES',
      keySize: 128,
    },
    currentCrypto: 'AES-128 symmetric encryption',
    recommendedReplacement:
      'Where available, configure Shield to use AES-256. AES-256 retains ~128-bit security margin against Grover’s algorithm; AES-128 is reduced to ~64-bit margin.',
    rationale:
      'Grover’s algorithm halves the effective security of symmetric ciphers. NIST, BSI, and ENISA all recommend migrating symmetric encryption to 256-bit keys in advance of CRQC availability, especially for long-confidentiality data.',
    citations: [BSI_TR_02102, ENISA_PQC, NCSC_NL_PQC, NIST_FIPS_203],
    deadline: '2030-12-31',
  }),
  mkFinding({
    id: 'F-APEX-001',
    category: 'apex-crypto',
    severity: 'critical',
    regulatoryStatus: 'already-non-compliant',
    migrationPosture: 'replace-now',
    effort: 'low',
    hndlExposure: false,
    title: 'Apex class calls Crypto.generateDigest with MD5',
    asset: {
      kind: 'apex-call',
      name: 'LegacyHashUtil.cls',
      identifier: 'ApexClass/01p3x000000abc',
      location: 'LegacyHashUtil.cls:42',
    },
    currentCrypto: "Crypto.generateDigest('MD5', ...)",
    recommendedReplacement:
      "Replace with Crypto.generateDigest('SHA-256', ...) or SHA-3. Review callers for any security-sensitive use of the digest.",
    rationale:
      'MD5 is broken for any security-relevant use. SP 800-131A disallows it; BSI TR-02102 excludes it from approved hash functions. Any security-relevant use is a current compliance failure.',
    citations: [NIST_SP_800_131A, BSI_TR_02102],
    deadline: '2010-12-31',
  }),
  mkFinding({
    id: 'F-APEX-002',
    category: 'apex-crypto',
    severity: 'high',
    regulatoryStatus: 'deprecated-by-date',
    migrationPosture: 'plan-2030',
    effort: 'medium',
    hndlExposure: true,
    title: 'Apex signs outbound payloads with RSA-SHA256',
    asset: {
      kind: 'apex-call',
      name: 'PartnerWebhookSigner.cls',
      identifier: 'ApexClass/01p3x000000def',
      location: 'PartnerWebhookSigner.cls:118',
    },
    currentCrypto: "Crypto.sign('RSA-SHA256', data, key)",
    recommendedReplacement:
      'Plan migration to ML-DSA once Salesforce exposes native PQC primitives. In the interim, document the key as a PQC-migration asset and shorten key rotation cadence.',
    rationale:
      'Salesforce does not yet expose FIPS 204 primitives via Apex, so immediate replacement is not possible. Track the asset and migrate at platform-readiness. HNDL exposure applies because signed payloads are retained by partners.',
    citations: [ENISA_PQC, NIST_FIPS_204],
    deadline: '2030-12-31',
  }),
  mkFinding({
    id: 'F-APEX-003',
    category: 'apex-crypto',
    severity: 'critical',
    regulatoryStatus: 'already-non-compliant',
    migrationPosture: 'replace-now',
    effort: 'low',
    hndlExposure: false,
    title: 'Hardcoded AES key in Apex source',
    asset: {
      kind: 'apex-call',
      name: 'LegacyCipher.cls',
      identifier: 'ApexClass/01p3x000000ghi',
      location: 'LegacyCipher.cls:27',
    },
    currentCrypto: "Hardcoded AES-128 key passed to Crypto.encryptWithManagedIV",
    recommendedReplacement:
      'Move the key to a Named Credential or Protected Custom Setting. Rotate the key immediately — the current value must be treated as compromised.',
    rationale:
      'Hardcoded cryptographic keys violate GDPR Art. 32 "state-of-the-art" requirements and every mainstream secure-coding standard. Apex source is accessible to any user with View All Data or developer access.',
    citations: [GDPR, NIS2],
    deadline: '2018-05-25',
  }),
  mkFinding({
    id: 'F-SESS-001',
    category: 'session-login',
    severity: 'medium',
    regulatoryStatus: 'advisory',
    migrationPosture: 'advisory',
    effort: 'low',
    hndlExposure: false,
    title: 'Session timeout exceeds NCSC-NL guidance',
    asset: {
      kind: 'connected-app',
      name: 'SessionSettings',
      identifier: 'SessionSettings/global',
    },
    currentCrypto: 'Session lifetime: 12 hours; MFA required for admin only',
    recommendedReplacement:
      'Reduce session lifetime to 2 hours with idle timeout at 30 minutes. Require MFA for all user profiles handling personal data, per NCSC-NL and NIS 2 guidance.',
    rationale:
      'Session length is not a cryptographic primitive, but long sessions extend the window for token theft and reduce the practical effectiveness of cryptographic controls upstream.',
    citations: [NCSC_NL_PQC, NIS2],
  }),
  mkFinding({
    id: 'F-PKG-001',
    category: 'packages',
    severity: 'low',
    regulatoryStatus: 'advisory',
    migrationPosture: 'advisory',
    effort: 'medium',
    hndlExposure: false,
    title: 'Installed package bundles its own crypto dependencies',
    asset: {
      kind: 'installed-package',
      name: 'Acme Signing Utilities',
      identifier: 'InstalledPackage/033xx0000000abc',
    },
    currentCrypto: 'Third-party managed package; cryptographic internals not inspectable',
    recommendedReplacement:
      "Request the vendor's PQC migration statement. Track the package as a supply-chain exposure until the vendor publishes a roadmap aligned with FIPS 203/204.",
    rationale:
      'Managed packages are opaque to QuantumShield scanning. ENISA and NCSC-NL both emphasize supply-chain crypto-agility as a post-quantum migration priority.',
    citations: [ENISA_PQC, NCSC_NL_PQC],
  }),
  mkFinding({
    id: 'F-CERT-003',
    category: 'certificates',
    severity: 'low',
    regulatoryStatus: 'advisory',
    migrationPosture: 'advisory',
    effort: 'low',
    hndlExposure: false,
    title: 'Certificate expiring within 90 days',
    asset: {
      kind: 'certificate',
      name: 'inbound_partner_mtls_2026',
      identifier: '03S1x00000FfGhIEAB',
      algorithm: 'RSA',
      keySize: 3072,
      signatureHash: 'SHA-256',
      issuer: 'DigiCert',
      expiresAt: '2026-07-11',
    },
    currentCrypto: 'RSA-3072 with SHA-256; expires 2026-07-11',
    recommendedReplacement:
      'Rotate before expiry. Consider issuing the replacement as a hybrid classical+PQC certificate now to validate PQC readiness in the partner chain.',
    rationale:
      'Operational hygiene. A forced rotation is an opportunity to trial PQC migration with minimal risk.',
    citations: [ENISA_PQC],
    deadline: '2026-07-11',
  }),
  mkFinding({
    id: 'F-DORA-001',
    category: 'sso',
    severity: 'high',
    regulatoryStatus: 'deprecated-by-date',
    migrationPosture: 'plan-2030',
    effort: 'high',
    hndlExposure: true,
    title: 'OIDC provider uses RSA-2048 JWKS (financial services)',
    asset: {
      kind: 'oidc-provider',
      name: 'Treasury Portal OIDC',
      identifier: 'AuthProvider/0SO3x000000jkL',
      algorithm: 'RSA',
      keySize: 2048,
    },
    currentCrypto: 'RSA-2048 JWKS; RS256 ID tokens',
    recommendedReplacement:
      'Plan migration to ML-DSA JWKS. Coordinate with ICT third-party providers per DORA Art. 9(2). Hybrid rollout via JWKS rotation is the recommended transition pattern.',
    rationale:
      'DORA requires financial entities to maintain state-of-the-art cryptographic protection proportional to ICT risk. RSA-2048 remains acceptable through 2030 but treasury-adjacent authentication is a priority migration surface under NIS 2 and DORA.',
    citations: [DORA, NIS2, ENISA_PQC, NIST_FIPS_204],
    deadline: '2030-12-31',
  }),
];

const severityCounts = findings.reduce<Record<Severity, number>>(
  (acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }),
  { critical: 0, high: 0, medium: 0, low: 0 },
);

const categoryCounts = findings.reduce<Record<Category, number>>(
  (acc, f) => ({ ...acc, [f.category]: (acc[f.category] ?? 0) + 1 }),
  {
    certificates: 0,
    'connected-apps': 0,
    'named-credentials': 0,
    'remote-sites': 0,
    sso: 0,
    'shield-encryption': 0,
    'apex-crypto': 0,
    'session-login': 0,
    packages: 0,
  },
);

const overlays: OverlayScope[] = [
  { id: 'gdpr', label: 'GDPR — security of processing (Art. 32)', enabled: true },
  { id: 'nis2', label: 'NIS 2 — risk-management measures (Art. 21)', enabled: true },
  { id: 'dora', label: 'DORA — ICT risk management (Art. 9)', enabled: true },
  { id: 'eidas2', label: 'eIDAS 2.0 — trust services', enabled: false },
  { id: 'pci-dss-4', label: 'PCI DSS 4.0 — requirements 3.5–3.7', enabled: false },
  { id: 'hipaa', label: 'HIPAA Security Rule', enabled: false },
  { id: 'cmmc', label: 'CMMC 2.0 Levels 2 & 3', enabled: false },
];

const hndlCount = findings.filter((f) => f.hndlExposure).length;
const earliest = findings
  .map((f) => f.deadline)
  .filter((d): d is string => Boolean(d))
  .sort()[0];

export const demoReport: Report = {
  schemaVersion: '1',
  generatedAt: '2026-04-18T10:24:00.000Z',
  scanStartedAt: '2026-04-18T10:18:12.000Z',
  scanFinishedAt: '2026-04-18T10:23:47.000Z',
  org: {
    orgId: '00D3x0000008cDaEAI',
    instanceUrl: 'https://nl-acme.my.salesforce.com',
    orgName: 'ACME Europe B.V.',
    orgType: 'production',
    apiVersion: 'v63.0',
    userLicense: 'Salesforce',
  },
  findings,
  overlays,
  sourceVersions: [
    { sourceId: 'BSI-TR-02102-1', documentVersion: '2025-01', retrievedAt: '2026-03-04' },
    { sourceId: 'ENISA-PQC-2024', documentVersion: '2024', retrievedAt: '2026-03-04' },
    { sourceId: 'NCSC-NL-PQC-factsheet', documentVersion: '2024', retrievedAt: '2026-03-04' },
    { sourceId: 'NIST-FIPS-203', documentVersion: '2024-08', retrievedAt: '2026-03-04' },
    { sourceId: 'NIST-FIPS-204', documentVersion: '2024-08', retrievedAt: '2026-03-04' },
    { sourceId: 'NIST-FIPS-205', documentVersion: '2024-08', retrievedAt: '2026-03-04' },
    { sourceId: 'NIST-SP-800-131A-r3', documentVersion: 'Rev 3', retrievedAt: '2026-03-04' },
    { sourceId: 'nis2-directive', documentVersion: '2022/2555', retrievedAt: '2026-03-04' },
    { sourceId: 'dora-regulation', documentVersion: '2022/2554', retrievedAt: '2026-03-04' },
    { sourceId: 'gdpr-art32', documentVersion: '2016/679', retrievedAt: '2026-03-04' },
  ],
  summary: {
    totalFindings: findings.length,
    bySeverity: severityCounts,
    byCategory: categoryCounts,
    earliestDeadline: earliest,
    hndlFindings: hndlCount,
    postureSentence: `ACME Europe B.V. has ${findings.length} cryptographic findings across ${Object.values(categoryCounts).filter((n) => n > 0).length} asset categories. ${severityCounts.critical} must be remediated immediately to restore baseline compliance; the remainder should be scheduled against the 2030 BSI and ENISA migration milestone.`,
  },
  cbom: [
    { name: 'legacy_partner_signing', type: 'certificate', algorithm: 'RSA', keySize: 1024, location: 'Certificate/03S1x00000ABcDeEAB', quantumSafe: false },
    { name: 'sso_saml_signing', type: 'certificate', algorithm: 'RSA', keySize: 2048, location: 'Certificate/03S1x00000XyZtWEAB', quantumSafe: false },
    { name: 'inbound_partner_mtls_2026', type: 'certificate', algorithm: 'RSA', keySize: 3072, location: 'Certificate/03S1x00000FfGhIEAB', quantumSafe: false },
    { name: 'partner_api_mtls', type: 'key', algorithm: 'ECDSA-P256', keySize: 256, location: 'ExternalCredential/0XB3x000000bcDE', quantumSafe: false },
    { name: 'Partner Data Integration JWT key', type: 'key', algorithm: 'RSA', keySize: 2048, location: 'ConnectedApplication/0C03x000000Xyz1', quantumSafe: false },
    { name: 'Treasury Portal OIDC JWKS', type: 'key', algorithm: 'RSA', keySize: 2048, location: 'AuthProvider/0SO3x000000jkL', quantumSafe: false },
    { name: 'Shield tenant secret', type: 'key', algorithm: 'AES', keySize: 128, location: 'TenantSecret/active', quantumSafe: false },
    { name: 'LegacyHashUtil.cls:42', type: 'algorithm', algorithm: 'MD5', location: 'ApexClass/01p3x000000abc', quantumSafe: false },
    { name: 'PartnerWebhookSigner.cls:118', type: 'algorithm', algorithm: 'RSA-SHA256', keySize: 2048, location: 'ApexClass/01p3x000000def', quantumSafe: false },
    { name: 'SAML signature hash', type: 'algorithm', algorithm: 'SHA-1', location: 'SamlSsoConfig/00F3x000001aBcD', quantumSafe: false },
    { name: 'legacy_billing_api endpoint', type: 'protocol', algorithm: 'HTTP (no TLS)', location: 'NamedCredential/0XA3x000000abCD', quantumSafe: false },
    { name: 'internal_reporting_http endpoint', type: 'protocol', algorithm: 'HTTP (no TLS)', location: 'RemoteSiteSetting/0rp3x000000aa', quantumSafe: false },
  ],
};
