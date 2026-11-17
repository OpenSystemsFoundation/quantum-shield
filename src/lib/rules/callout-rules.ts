import { cite } from './citations.js';
import type { Rule } from './types.js';

/** Asset kinds that describe an outbound Salesforce callout target. */
const CALLOUT_KINDS = new Set(['named-credential', 'remote-site', 'external-data-source']);

export function isHttpsCallout(asset: { kind: string; endpointUrl?: string }): boolean {
  if (!CALLOUT_KINDS.has(asset.kind) || !asset.endpointUrl) return false;
  try {
    return new URL(asset.endpointUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Every HTTPS callout from Salesforce is a harvest-now-decrypt-later
 * candidate: Salesforce has not announced post-quantum key establishment for
 * outbound callouts, so the session keys are agreed with classical ECDHE (or
 * RSA) whatever the partner endpoint supports. Traffic recorded today can be
 * decrypted once a quantum computer breaks that key exchange.
 *
 * How urgent that is depends on what the callout carries and how long it
 * must stay secret, which is what prioritisation ranks. The finding itself
 * is deliberately moderate.
 */
function classicalCalloutRule(): Rule {
  return {
    id: 'R-CALLOUT-HNDL',
    description: 'HTTPS callout uses classical key establishment — traffic can be recorded now and decrypted later.',
    matches(asset) {
      if (!isHttpsCallout(asset)) return null;
      const origin = (() => {
        try {
          return new URL(asset.endpointUrl as string).origin;
        } catch {
          return asset.endpointUrl as string;
        }
      })();
      return {
        title: `Callouts to ${origin} can be recorded now and decrypted later`,
        severity: 'medium',
        regulatoryStatus: 'deprecated-by-date',
        migrationPosture: 'plan-2030',
        effort: 'high',
        hndlExposure: true,
        currentCrypto: 'TLS with classical key establishment (ECDHE or RSA) on the Salesforce side',
        recommendedReplacement:
          'Send this integration only the data it needs, and keep long-lived sensitive fields (identifiers, health and financial data) out of the payload or tokenised. Require TLS 1.3 on the partner endpoint so it is ready for hybrid post-quantum key exchange (X25519MLKEM768), and track Salesforce release notes for post-quantum TLS on outbound callouts.',
        rationale:
          'Salesforce has not announced post-quantum key establishment for outbound callouts, so the keys protecting this traffic are agreed with classical elliptic-curve or RSA cryptography. An attacker who records the traffic today can decrypt it once a cryptographically relevant quantum computer exists. The risk depends on how long the data sent here must stay secret; the priority ranking weighs exactly that.',
        citations: cite('SALESFORCE_PQC_2026', 'NIST_IR_8547', 'ENISA_PQC_2024', 'NIST_FIPS_203'),
        deadline: '2030-12-31',
      };
    },
  };
}

export function calloutRules(): Rule[] {
  return [classicalCalloutRule()];
}
