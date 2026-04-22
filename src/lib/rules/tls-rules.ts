import { cite } from './citations.js';
import type { Rule } from './types.js';

/**
 * Inline rules that fire against `tls-endpoint` assets produced by the live
 * TLS prober. These rules are code-defined rather than Markdown-defined
 * because they describe runtime handshake observations, not policy text; the
 * MD → rule-catalog sync pipeline is reserved for regulatory sources.
 */

function tlsVersionRule(): Rule {
  return {
    id: 'R-TLS-1_2-SNDL',
    description: 'Endpoint accepts TLS 1.2 — exposed to store-now-decrypt-later harvesting.',
    matches(asset) {
      if (asset.kind !== 'tls-endpoint') return null;
      if (!asset.tlsVersion) return null;
      if (asset.tlsVersion === 'TLSv1.3') return null;
      return {
        title: `Endpoint negotiated ${asset.tlsVersion} — PQC hybrid KEMs unavailable before TLS 1.3`,
        severity: 'high',
        regulatoryStatus: 'deprecated-by-date',
        migrationPosture: 'plan-2030',
        effort: 'medium',
        hndlExposure: true,
        currentCrypto: `${asset.tlsVersion}${asset.kexGroup ? ` · KEX ${asset.kexGroup}` : ''}`,
        recommendedReplacement:
          'Require TLS 1.3 on the endpoint and negotiate a hybrid KEM such as X25519MLKEM768 or SecP256r1MLKEM768. Upgrade the upstream server (or put a TLS 1.3-terminating reverse proxy in front of it) and disable TLS 1.2 for outbound callouts where the partner supports it.',
        rationale:
          'TLS 1.2 key establishment relies on classical ECDHE / RSA which Shor\'s algorithm breaks outright once a cryptographically relevant quantum computer exists. Salesforce callouts to this endpoint are candidates for store-now-decrypt-later harvesting.',
        citations: cite('ENISA_PQC_2024', 'NCSC_NL_PQC', 'NIST_FIPS_203', 'NIST_SP_800_52'),
        deadline: '2030-12-31',
      };
    },
  };
}

function hybridKemRule(): Rule {
  return {
    id: 'R-TLS-NO-HYBRID-KEM',
    description: 'TLS 1.3 negotiated without a hybrid post-quantum KEM.',
    matches(asset) {
      if (asset.kind !== 'tls-endpoint') return null;
      if (asset.tlsVersion !== 'TLSv1.3') return null;
      if (asset.hybridKem) return null;
      return {
        title: `TLS 1.3 without hybrid KEM — still exposed to SNDL harvesting`,
        severity: 'medium',
        regulatoryStatus: 'advisory',
        migrationPosture: 'plan-2030',
        effort: 'medium',
        hndlExposure: true,
        currentCrypto: `TLS 1.3 · ${asset.kexGroup ?? 'classical ECDHE'}`,
        recommendedReplacement:
          'Enable hybrid key exchange on the endpoint. For Dutch/EU environments the NCSC-NL factsheet explicitly recommends hybrids (classical + ML-KEM) during the transition period; US CNSA 2.0 aligns on the same target.',
        rationale:
          'Even on TLS 1.3, a purely classical ECDHE handshake is vulnerable to Shor\'s once a CRQC exists. Negotiating a hybrid KEM such as X25519MLKEM768 adds post-quantum key establishment without breaking interop with classical peers.',
        citations: cite('NCSC_NL_PQC', 'ENISA_PQC_2024', 'NIST_FIPS_203'),
        deadline: '2030-12-31',
      };
    },
  };
}

export function tlsProbeRules(): Rule[] {
  return [tlsVersionRule(), hybridKemRule()];
}
