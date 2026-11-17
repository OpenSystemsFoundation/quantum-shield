import { cite } from './citations.js';
import type { Rule } from './types.js';

/**
 * Inline rules that fire against `tls-endpoint` assets produced by the live
 * TLS prober. These rules are code-defined rather than Markdown-defined
 * because they describe runtime handshake observations, not policy text; the
 * MD → rule-catalog sync pipeline is reserved for regulatory sources.
 *
 * Every probe runs from the machine executing `qshield`, not from Salesforce.
 * A result therefore describes what the *endpoint* supports. It does not say
 * what Salesforce's own outbound callout stack negotiates with that endpoint.
 */

/**
 * Sentence appended to TLS findings so readers do not mistake the probe's
 * view for the Salesforce callout's view.
 */
const PROBE_VANTAGE_NOTE =
  'This result comes from a handshake made by the machine running the scan, not by Salesforce. Salesforce has not announced NIST post-quantum algorithms in its core services, so Salesforce callouts to this endpoint should still be assumed to use classical key establishment.';

/**
 * OpenSSL-style TLS 1.2 cipher names encode the key exchange as a prefix
 * (ECDHE-…, DHE-…). Names without one, such as `AES256-GCM-SHA384` or
 * `DES-CBC3-SHA`, use static RSA key transport: no forward secrecy.
 * TLS 1.3 names (`TLS_AES_…`) never use RSA key exchange.
 */
export function isStaticRsaKeyExchange(cipher: string | undefined): boolean {
  if (!cipher) return false;
  if (/^TLS_/i.test(cipher)) return false;
  if (/^(ECDHE|DHE|EDH|ECDH|DH|ADH|AECDH)-/i.test(cipher)) return false;
  if (/PSK|SRP|anon/i.test(cipher)) return false;
  return true;
}

function staticRsaKexRule(): Rule {
  return {
    id: 'R-TLS-RSA-KEX',
    description: 'Endpoint negotiated static RSA key exchange — no forward secrecy.',
    matches(asset) {
      if (asset.kind !== 'tls-endpoint') return null;
      if (!asset.tlsVersion || asset.tlsVersion === 'TLSv1.3') return null;
      if (!isStaticRsaKeyExchange(asset.algorithm)) return null;
      return {
        title: `Static RSA key exchange (${asset.algorithm}) — no forward secrecy`,
        severity: 'critical',
        regulatoryStatus: 'already-non-compliant',
        migrationPosture: 'replace-now',
        effort: 'medium',
        hndlExposure: true,
        currentCrypto: `${asset.tlsVersion} · ${asset.algorithm} (RSA key transport)`,
        recommendedReplacement:
          'Disable non-ECDHE cipher suites on the endpoint and require TLS 1.3. Salesforce explicitly recommends moving integrations off RSA key exchange.',
        rationale:
          `With static RSA key exchange every session key is encrypted to the server's long-term RSA key. Anyone who records the traffic today can decrypt all of it once that one key is recovered, whether by theft today or by Shor's algorithm later. That makes it the worst case for store-now-decrypt-later. ${PROBE_VANTAGE_NOTE}`,
        citations: cite('SALESFORCE_PQC_2026', 'NIST_SP_800_52', 'BSI_TR_02102_1', 'NIS_CG_PQC_ROADMAP'),
        deadline: '2030-12-31',
      };
    },
  };
}

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
          `TLS 1.2 key establishment relies on classical ECDHE / RSA which Shor's algorithm breaks outright once a cryptographically relevant quantum computer exists. Salesforce callouts to this endpoint are candidates for store-now-decrypt-later harvesting. ${PROBE_VANTAGE_NOTE}`,
        citations: cite('ENISA_PQC_2024', 'NCSC_NL_PQC', 'NIST_FIPS_203', 'NIST_SP_800_52', 'NIS_CG_PQC_ROADMAP', 'SALESFORCE_PQC_2026'),
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
      // Only fire when we KNOW no hybrid KEM was negotiated. `undefined`
      // means the probing client could not offer ML-KEM groups itself
      // (OpenSSL < 3.5), so the endpoint's capability is unknown — reporting
      // a finding would state a fact about the server that is actually a
      // limitation of the client.
      if (asset.hybridKem !== false) return null;
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
          `Even on TLS 1.3, a purely classical ECDHE handshake is vulnerable to Shor's once a CRQC exists. Negotiating a hybrid KEM such as X25519MLKEM768 adds post-quantum key establishment without breaking interop with classical peers. ${PROBE_VANTAGE_NOTE}`,
        citations: cite('NCSC_NL_PQC', 'ENISA_PQC_2024', 'NIST_FIPS_203', 'NIS_CG_PQC_ROADMAP'),
        deadline: '2030-12-31',
      };
    },
  };
}

/**
 * The endpoint negotiated a hybrid KEM with the scanning machine. That is the
 * right server-side posture, but it is not evidence that Salesforce's callouts
 * get the same protection, so record it as advisory rather than staying
 * silent (silence reads as "clean").
 */
function hybridCapableEndpointRule(): Rule {
  return {
    id: 'R-TLS-HYBRID-SF-SIDE',
    description: 'Endpoint supports a hybrid PQC KEM, but Salesforce callouts are likely still classical.',
    matches(asset) {
      if (asset.kind !== 'tls-endpoint') return null;
      if (asset.tlsVersion !== 'TLSv1.3') return null;
      if (asset.hybridKem !== true) return null;
      return {
        title: 'Endpoint supports hybrid PQC key exchange — Salesforce callouts likely still classical',
        severity: 'low',
        regulatoryStatus: 'advisory',
        migrationPosture: 'advisory',
        effort: 'low',
        hndlExposure: false,
        currentCrypto: `TLS 1.3 · ${asset.kexGroup ?? 'hybrid KEM'} (as negotiated with the scanner)`,
        recommendedReplacement:
          'No change needed on the endpoint. Track Salesforce release notes for post-quantum TLS on outbound callouts, and re-scan when it ships.',
        rationale:
          `The endpoint is ready for post-quantum key establishment. ${PROBE_VANTAGE_NOTE}`,
        citations: cite('SALESFORCE_PQC_2026', 'NIST_FIPS_203'),
      };
    },
  };
}

export function tlsProbeRules(): Rule[] {
  return [staticRsaKexRule(), tlsVersionRule(), hybridKemRule(), hybridCapableEndpointRule()];
}
