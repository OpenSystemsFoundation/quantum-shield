import type { Citation, CryptoAsset, Finding, Jurisdiction } from '@lib/pdf';
import { buildRuleCatalog } from './catalog.js';
import { GENERATED_RULE_DEFS } from './rule-catalog.generated.js';
import type { Rule, RuleContext } from './types.js';

export type { Rule, RuleContext, RuleMatchResult } from './types.js';

/**
 * Harvest-now-decrypt-later means: an adversary records ciphertext today and
 * decrypts it once a quantum computer can break the key establishment (or
 * public-key encryption) that protected it. Only assets that establish or
 * transport keys, or encrypt data, can be exposed that way.
 *
 * Signature-only assets (signing certificates, SAML request signing, OIDC
 * token signing, Apex Crypto.sign) are NOT harvestable: forging a signature
 * needs the quantum computer at verification time, so recording traffic now
 * gains nothing. Digests, MACs and symmetric keys at rest are out as well.
 */
export function isHndlRelevant(asset: CryptoAsset): boolean {
  if (asset.usage === 'encryption' || asset.usage === 'key-establishment') return true;
  if (asset.usage) return false;
  return asset.kind === 'tls-endpoint';
}

function idFor(ruleId: string, asset: CryptoAsset): string {
  return `${ruleId}:${asset.kind}:${asset.identifier}`;
}

const BASE_RULES = buildRuleCatalog(GENERATED_RULE_DEFS);

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
      hndlExposure: match.hndlExposure && isHndlRelevant(asset),
      currentCrypto: match.currentCrypto,
      recommendedReplacement: match.recommendedReplacement,
      rationale: match.rationale,
      citations: match.citations,
      deadline: match.deadline,
      ...(rule.overlays && rule.overlays.length > 0 ? { overlayIds: [...rule.overlays] } : {}),
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
    case 'session-settings':
      return 'session-login';
    case 'tls-endpoint':
      return 'named-credentials';
  }
}

/**
 * Overlay ids on a rule are mapping metadata (which regulatory frameworks a
 * finding traces to), not a gate: the full base catalog always runs. Overlay
 * selection controls the regulatory appendix, not which rules fire.
 */
export function ruleCatalogForOverlays(_overlays: string[]): Rule[] {
  return BASE_RULES;
}

/**
 * EU member-state selections imply the EU-wide sources: GDPR, NIS 2, DORA and
 * eIDAS bind Dutch, German and French organisations just as much as their
 * national guidance does.
 */
const REGION_IMPLIES: Record<string, Jurisdiction[]> = {
  NL: ['EU'],
  DE: ['EU'],
  FR: ['EU'],
};

export function expandRegions(regions: string[]): Set<string> {
  const target = new Set(regions.map((r) => r.toUpperCase()));
  for (const region of [...target]) {
    for (const implied of REGION_IMPLIES[region] ?? []) {
      target.add(implied);
    }
  }
  return target;
}

/**
 * Regions never decide which rules run. A weak key is weak in every
 * jurisdiction, so dropping a detection because its citations happen to come
 * from another authority would hide real findings (a UK-scoped scan used to
 * lose almost half of them). `regions` is accepted for call-site
 * compatibility and ignored: region scoping is applied to each finding's
 * citations by {@link scopeCitationsToRegions}.
 */
export function ruleCatalogFor(overlays: string[], regions: string[] = []): Rule[] {
  void overlays; // overlays never gate rule selection — see ruleCatalogForOverlays
  void regions;
  return BASE_RULES;
}

/**
 * Orders a finding's citations for the selected regions: sources from a
 * selected (or implied) jurisdiction first, then international ones. Sources
 * from other jurisdictions are dropped only when at least one in-region or
 * international source remains — a finding always keeps a citation.
 */
export function scopeCitationsToRegions(citations: Citation[], regions: string[]): Citation[] {
  if (regions.length === 0) return citations;
  const target = expandRegions(regions);
  const inRegion = citations.filter((c) => target.has(c.jurisdiction));
  const international = citations.filter((c) => c.jurisdiction === 'INTL' && !target.has('INTL'));
  const scoped = [...inRegion, ...international];
  return scoped.length > 0 ? scoped : citations;
}
