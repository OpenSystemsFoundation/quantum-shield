import { cite } from './citations.js';
import type { Rule } from './types.js';

/**
 * Days after which an active Shield Platform Encryption tenant secret is
 * considered stale. Salesforce's PQC paper and NIST SP 800-57 both treat
 * regular, rehearsed key rotation as a prerequisite for crypto agility; a
 * yearly cadence is the common baseline in customer key-management policies.
 */
export const SHIELD_ROTATION_MAX_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

function shieldRotationRule(): Rule {
  return {
    id: 'R-SHIELD-KEY-ROTATION',
    description: `Active Shield tenant secret not rotated in more than ${SHIELD_ROTATION_MAX_DAYS} days.`,
    matches(asset, ctx) {
      if (asset.kind !== 'shield-key') return null;
      // No timestamp means we cannot tell; the scanner already records
      // "no rotation timestamp" in the asset location.
      if (!asset.lastRotatedAt) return null;
      const rotated = Date.parse(asset.lastRotatedAt);
      if (Number.isNaN(rotated)) return null;
      const ageDays = Math.floor((ctx.now.getTime() - rotated) / DAY_MS);
      if (ageDays <= SHIELD_ROTATION_MAX_DAYS) return null;
      return {
        title: `Shield tenant secret last rotated ${ageDays} days ago`,
        severity: 'low',
        regulatoryStatus: 'advisory',
        migrationPosture: 'advisory',
        effort: 'low',
        hndlExposure: false,
        currentCrypto: `AES-256 (Shield) · last rotated ${asset.lastRotatedAt.slice(0, 10)}`,
        recommendedReplacement:
          'Rotate the tenant secret in Setup → Platform Encryption → Key Management, and schedule rotation at least yearly. Treat each rotation as a rehearsal: confirm that encrypted fields, files and search indexes still work afterwards.',
        rationale:
          'AES-256 itself is considered quantum-resistant, so this is not a quantum exposure. It is a crypto-agility gap: an organisation that does not rotate keys routinely has no tested process for the larger key and algorithm changes the post-quantum transition will require.',
        citations: cite('SALESFORCE_PQC_2026', 'NIST_SP_800_57_PT1'),
      };
    },
  };
}

export function keyRotationRules(): Rule[] {
  return [shieldRotationRule()];
}
