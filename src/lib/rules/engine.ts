import type {
  Citation,
  CryptoAsset,
  Finding,
  MigrationPosture,
  RegulatoryStatus,
  Severity,
} from '@lib/pdf';
import { cite } from './citations.js';

export interface RuleContext {
  scanId: string;
  now: Date;
}

export interface RuleMatchResult {
  title: string;
  severity: Severity;
  regulatoryStatus: RegulatoryStatus;
  migrationPosture: MigrationPosture;
  effort: 'low' | 'medium' | 'high';
  hndlExposure: boolean;
  currentCrypto: string;
  recommendedReplacement: string;
  rationale: string;
  citations: Citation[];
  deadline?: string;
}

export interface Rule {
  id: string;
  description: string;
  matches(asset: CryptoAsset, ctx: RuleContext): RuleMatchResult | null;
}

const HNDL_KINDS = new Set<CryptoAsset['kind']>([
  'certificate',
  'connected-app',
  'saml-sso',
  'oidc-provider',
  'shield-key',
]);

function idFor(ruleId: string, asset: CryptoAsset): string {
  return `${ruleId}:${asset.kind}:${asset.identifier}`;
}

export function evaluate(
  asset: CryptoAsset,
  rules: Rule[],
  ctx: RuleContext,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const match = rule.matches(asset, ctx);
    if (!match) continue;
    findings.push({
      id: idFor(rule.id, asset),
      category: categoryForKind(asset.kind),
      asset,
      title: match.title,
      severity: match.severity,
      regulatoryStatus: match.regulatoryStatus,
      migrationPosture: match.migrationPosture,
      effort: match.effort,
      hndlExposure: match.hndlExposure && HNDL_KINDS.has(asset.kind),
      currentCrypto: match.currentCrypto,
      recommendedReplacement: match.recommendedReplacement,
      rationale: match.rationale,
      citations: match.citations,
      deadline: match.deadline,
    });
  }
  return findings;
}

export function categoryForKind(kind: CryptoAsset['kind']): Finding['category'] {
  switch (kind) {
    case 'certificate':
      return 'certificates';
    case 'connected-app':
      return 'connected-apps';
    case 'named-credential':
    case 'external-credential':
      return 'named-credentials';
    case 'remote-site':
    case 'external-data-source':
      return 'remote-sites';
    case 'saml-sso':
    case 'oidc-provider':
      return 'sso';
    case 'shield-key':
      return 'shield-encryption';
    case 'apex-call':
      return 'apex-crypto';
    case 'installed-package':
      return 'packages';
  }
}

const WEAK_HASHES = new Set(['SHA-1', 'SHA1', 'MD5', 'MD4']);

function isQuantumVulnerableSignature(algo: string | undefined): boolean {
  if (!algo) return false;
  const normalised = algo.toUpperCase();
  return (
    normalised.includes('RSA') ||
    normalised.includes('ECDSA') ||
    normalised.includes('DSA') ||
    normalised.includes('ED25519') ||
    normalised.includes('ECDH')
  );
}

export const RULES: Rule[] = [
  {
    id: 'R-RSA-1024',
    description: 'RSA with key size < 2048 — non-compliant today.',
    matches(asset) {
      if (asset.algorithm?.toUpperCase() !== 'RSA') return null;
      if (!asset.keySize || asset.keySize >= 2048) return null;
      return {
        title: `RSA-${asset.keySize} in active use — already non-compliant`,
        severity: 'critical',
        regulatoryStatus: 'already-non-compliant',
        migrationPosture: 'replace-now',
        effort: 'low',
        hndlExposure: true,
        currentCrypto: `RSA-${asset.keySize}${asset.signatureHash ? ` with ${asset.signatureHash}` : ''}`,
        recommendedReplacement:
          'Rotate immediately to ML-DSA (FIPS 204) for signing or ML-KEM (FIPS 203) for key transport. If interoperability blocks PQC adoption, RSA-3072 with SHA-256 is the minimum acceptable interim step.',
        rationale:
          'RSA key lengths below 2048 bits are disallowed under NIST SP 800-131A Rev 3 and excluded from BSI TR-02102 approved parameters. Use is a current compliance failure, independent of the post-quantum timeline.',
        citations: cite('NIST_SP_800_131A', 'BSI_TR_02102_1', 'NIST_FIPS_204'),
        deadline: '2020-12-31',
      };
    },
  },
  {
    id: 'R-RSA-2048',
    description: 'RSA-2048 and RSA-3072 — compliant today, deprecated by 2030.',
    matches(asset) {
      if (asset.algorithm?.toUpperCase() !== 'RSA') return null;
      if (!asset.keySize || asset.keySize < 2048) return null;
      return {
        title: `RSA-${asset.keySize} — plan PQC migration`,
        severity: asset.keySize < 3072 ? 'high' : 'medium',
        regulatoryStatus: 'deprecated-by-date',
        migrationPosture: 'plan-2030',
        effort: 'medium',
        hndlExposure: true,
        currentCrypto: `RSA-${asset.keySize}${asset.signatureHash ? ` with ${asset.signatureHash}` : ''}`,
        recommendedReplacement:
          'Plan migration to ML-DSA (FIPS 204). Deploy a hybrid (classical + PQC) certificate at next rotation if partner endpoints do not yet support ML-DSA — ENISA and NCSC-NL both endorse hybrid as the transition pattern.',
        rationale:
          'RSA remains compliant today but is on the deprecation path. BSI TR-02102 recommends migration planning now; ENISA flags asymmetric signing and key transport as migration priorities because signed/encrypted artefacts are long-lived and harvestable.',
        citations: cite('BSI_TR_02102_1', 'ENISA_PQC_2024', 'NCSC_NL_PQC', 'NIST_FIPS_204'),
        deadline: '2030-12-31',
      };
    },
  },
  {
    id: 'R-ECDSA',
    description: 'ECDSA — compliant today, deprecated by 2030.',
    matches(asset) {
      const algo = asset.algorithm?.toUpperCase() ?? '';
      if (!algo.includes('ECDSA') && !algo.includes('ECC')) return null;
      return {
        title: `${asset.algorithm} — plan PQC migration`,
        severity: 'medium',
        regulatoryStatus: 'deprecated-by-date',
        migrationPosture: 'plan-2030',
        effort: 'medium',
        hndlExposure: true,
        currentCrypto: `${asset.algorithm}${asset.keySize ? `-${asset.keySize}` : ''}`,
        recommendedReplacement:
          'Plan migration to ML-DSA (FIPS 204). Where stateless hash-based assurance is preferred, SLH-DSA (FIPS 205) is an alternative.',
        rationale:
          'ECDSA and other elliptic curve primitives are compliant today but are broken by a cryptographically relevant quantum computer. BSI, ENISA and NCSC-NL all direct organisations to schedule migration in advance of 2030.',
        citations: cite('BSI_TR_02102_1', 'ENISA_PQC_2024', 'NIST_FIPS_204', 'NIST_FIPS_205'),
        deadline: '2030-12-31',
      };
    },
  },
  {
    id: 'R-WEAK-HASH',
    description: 'SHA-1 / MD5 — disallowed today.',
    matches(asset) {
      const hash = asset.signatureHash?.toUpperCase();
      if (!hash || !WEAK_HASHES.has(hash)) return null;
      return {
        title: `${hash} signature in use — already non-compliant`,
        severity: 'critical',
        regulatoryStatus: 'already-non-compliant',
        migrationPosture: 'replace-now',
        effort: 'low',
        hndlExposure: false,
        currentCrypto: `${hash} signature`,
        recommendedReplacement: 'Replace with SHA-256 or SHA-3. For signed assertions, reissue the signing certificate if the hash was baked into the signature.',
        rationale:
          'SHA-1 and MD5 are disallowed under NIST SP 800-131A Rev 3 and excluded from BSI TR-02102. Practical collision attacks on SHA-1 are public; MD5 is broken for any security-relevant use.',
        citations: cite('NIST_SP_800_131A', 'BSI_TR_02102_1'),
        deadline: '2020-12-31',
      };
    },
  },
  {
    id: 'R-HTTP-ENDPOINT',
    description: 'Plaintext HTTP endpoint.',
    matches(asset) {
      if (!asset.endpointUrl) return null;
      let url: URL;
      try {
        url = new URL(asset.endpointUrl);
      } catch {
        return null;
      }
      if (url.protocol !== 'http:') return null;
      return {
        title: `${asset.name} uses plaintext HTTP`,
        severity: 'high',
        regulatoryStatus: 'already-non-compliant',
        migrationPosture: 'replace-now',
        effort: 'low',
        hndlExposure: false,
        currentCrypto: 'Plaintext HTTP — no TLS',
        recommendedReplacement:
          'Move the endpoint to HTTPS with TLS 1.2+ (TLS 1.3 preferred per BSI TR-02102). If the target service lacks TLS, terminate at a proxy or sidecar before exposing the callout.',
        rationale:
          'GDPR Art. 32 and NIS 2 Art. 21 require state-of-the-art protection of personal and operational data in transit. Plaintext HTTP is an immediate compliance failure for any processing of regulated data.',
        citations: cite('GDPR_ART_32', 'NIS2', 'BSI_TR_02102_1'),
        deadline: '2018-05-25',
      };
    },
  },
  {
    id: 'R-AES-128',
    description: 'AES-128 — Grover halves effective security.',
    matches(asset) {
      if (asset.algorithm?.toUpperCase() !== 'AES') return null;
      if (!asset.keySize || asset.keySize >= 256) return null;
      return {
        title: `AES-${asset.keySize} — migrate to AES-256`,
        severity: 'medium',
        regulatoryStatus: 'advisory',
        migrationPosture: 'plan-2030',
        effort: 'medium',
        hndlExposure: true,
        currentCrypto: `AES-${asset.keySize}`,
        recommendedReplacement:
          'Where available, configure AES-256. AES-256 retains ~128-bit security margin against Grover’s algorithm; AES-128 is reduced to ~64-bit margin.',
        rationale:
          'Grover’s algorithm halves the effective security of symmetric ciphers. NIST, BSI and ENISA all recommend migrating symmetric encryption to 256-bit keys in advance of CRQC availability, especially for long-confidentiality data.',
        citations: cite('BSI_TR_02102_1', 'ENISA_PQC_2024', 'NCSC_NL_PQC'),
        deadline: '2030-12-31',
      };
    },
  },
  {
    id: 'R-CERT-EXPIRY',
    description: 'Certificate expiring within 90 days.',
    matches(asset, ctx) {
      if (asset.kind !== 'certificate' || !asset.expiresAt) return null;
      const exp = Date.parse(asset.expiresAt);
      if (Number.isNaN(exp)) return null;
      const days = (exp - ctx.now.getTime()) / 86_400_000;
      if (days > 90 || days < -30) return null;
      return {
        title: days < 0 ? 'Certificate expired' : `Certificate expires in ${Math.ceil(days)} days`,
        severity: days < 0 ? 'high' : 'low',
        regulatoryStatus: 'advisory',
        migrationPosture: 'advisory',
        effort: 'low',
        hndlExposure: false,
        currentCrypto: `${asset.algorithm ?? 'Unknown'}${asset.keySize ? `-${asset.keySize}` : ''}; expires ${asset.expiresAt}`,
        recommendedReplacement:
          'Rotate before expiry. Consider issuing the replacement as a hybrid classical+PQC certificate to validate PQC readiness in the partner chain.',
        rationale:
          'Operational hygiene. A forced rotation is an opportunity to trial PQC migration with minimal risk.',
        citations: cite('ENISA_PQC_2024'),
        deadline: asset.expiresAt.slice(0, 10),
      };
    },
  },
  {
    id: 'R-APEX-CRYPTO',
    description: 'Apex crypto calls with weak or quantum-vulnerable primitives.',
    matches(asset) {
      if (asset.kind !== 'apex-call') return null;
      const algo = (asset.algorithm ?? '').toUpperCase();
      if (!algo) return null;
      if (algo.includes('MD5') || algo.includes('SHA-1')) {
        return {
          title: `Apex uses ${asset.algorithm}`,
          severity: 'critical',
          regulatoryStatus: 'already-non-compliant',
          migrationPosture: 'replace-now',
          effort: 'low',
          hndlExposure: false,
          currentCrypto: asset.algorithm ?? 'weak hash',
          recommendedReplacement: "Replace with Crypto.generateDigest('SHA-256', ...) or SHA-3.",
          rationale:
            'MD5 and SHA-1 are disallowed for security-relevant use under SP 800-131A and BSI TR-02102.',
          citations: cite('NIST_SP_800_131A', 'BSI_TR_02102_1'),
          deadline: '2010-12-31',
        };
      }
      if (isQuantumVulnerableSignature(algo)) {
        return {
          title: `Apex signs with ${asset.algorithm}`,
          severity: 'high',
          regulatoryStatus: 'deprecated-by-date',
          migrationPosture: 'plan-2030',
          effort: 'medium',
          hndlExposure: true,
          currentCrypto: asset.algorithm ?? '',
          recommendedReplacement:
            'Plan migration to ML-DSA once Salesforce exposes native PQC primitives. Track as a PQC-migration asset and shorten rotation cadence in the interim.',
          rationale:
            'Salesforce does not yet expose FIPS 204 primitives via Apex, so immediate replacement is not possible. Record the asset and migrate at platform-readiness.',
          citations: cite('ENISA_PQC_2024', 'NIST_FIPS_204'),
          deadline: '2030-12-31',
        };
      }
      if (algo.includes('HARDCODED')) {
        return {
          title: 'Hardcoded cryptographic key in Apex',
          severity: 'critical',
          regulatoryStatus: 'already-non-compliant',
          migrationPosture: 'replace-now',
          effort: 'low',
          hndlExposure: false,
          currentCrypto: 'Hardcoded key material in source',
          recommendedReplacement:
            'Move the key to a Named Credential or Protected Custom Setting. Rotate the key immediately — the current value must be treated as compromised.',
          rationale:
            'Hardcoded cryptographic keys violate GDPR Art. 32 "state-of-the-art" requirements. Apex source is accessible to any user with View All Data or developer access.',
          citations: cite('GDPR_ART_32', 'NIS2'),
          deadline: '2018-05-25',
        };
      }
      return null;
    },
  },
  {
    id: 'R-SESSION-LENGTH',
    description: 'Session lifetime exceeds recommendations.',
    matches(asset) {
      if (asset.kind !== 'connected-app' && asset.name !== 'SessionSettings') return null;
      if (asset.name !== 'SessionSettings') return null;
      const match = /(\d+)\s*h/.exec(asset.location ?? '');
      if (!match) return null;
      const hours = Number(match[1]);
      if (hours < 8) return null;
      return {
        title: 'Session timeout exceeds NCSC-NL guidance',
        severity: 'medium',
        regulatoryStatus: 'advisory',
        migrationPosture: 'advisory',
        effort: 'low',
        hndlExposure: false,
        currentCrypto: `Session lifetime: ${hours} hours`,
        recommendedReplacement:
          'Reduce session lifetime to 2 hours with idle timeout at 30 minutes. Require MFA for all user profiles handling personal data, per NCSC-NL and NIS 2 guidance.',
        rationale:
          'Long sessions extend the window for token theft and reduce the practical effectiveness of cryptographic controls upstream.',
        citations: cite('NCSC_NL_PQC', 'NIS2'),
      };
    },
  },
  {
    id: 'R-INSTALLED-PACKAGE-CRYPTO',
    description: 'Installed package flagged as crypto-bearing.',
    matches(asset) {
      if (asset.kind !== 'installed-package') return null;
      return {
        title: `${asset.name} — supply-chain PQC exposure`,
        severity: 'low',
        regulatoryStatus: 'advisory',
        migrationPosture: 'advisory',
        effort: 'medium',
        hndlExposure: false,
        currentCrypto: 'Third-party managed package; cryptographic internals not inspectable',
        recommendedReplacement:
          "Request the vendor's PQC migration statement. Track the package as a supply-chain exposure until the vendor publishes a roadmap aligned with FIPS 203/204.",
        rationale:
          'Managed packages are opaque to QuantumShield scanning. ENISA and NCSC-NL both emphasize supply-chain crypto-agility as a post-quantum migration priority.',
        citations: cite('ENISA_PQC_2024', 'NCSC_NL_PQC'),
      };
    },
  },
];

export function ruleCatalogForOverlays(overlays: string[]): Rule[] {
  // Overlays modulate which citations ship with findings but the base rules apply universally.
  // Future overlay-specific rules could be spliced in here.
  void overlays;
  return RULES;
}
