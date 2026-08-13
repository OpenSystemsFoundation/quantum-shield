import type { CryptoAsset, Finding, Jurisdiction } from '@lib/pdf';
import { GENERATED_CITATIONS } from './regulations.generated.js';
import { buildRuleCatalog } from './catalog.js';
import { GENERATED_RULE_DEFS } from './rule-catalog.generated.js';
import type { Rule, RuleContext, RuleDefinition } from './types.js';

export type { Rule, RuleContext, RuleMatchResult } from './types.js';

const HNDL_KINDS = new Set<CryptoAsset['kind']>([
  'certificate',
  'connected-app',
  'saml-sso',
  'oidc-provider',
  'shield-key',
  'tls-endpoint',
]);

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
      hndlExposure: match.hndlExposure && HNDL_KINDS.has(asset.kind),
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

const CITATION_JURISDICTIONS: Record<string, Jurisdiction> = Object.fromEntries(
  Object.entries(GENERATED_CITATIONS).map(([key, value]) => [key, value.jurisdiction as Jurisdiction]),
);

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
 * A rule is relevant for a region if any of its citations are tagged with that
 * jurisdiction (or an implied one), or with INTL (always on). When `regions`
 * is empty the filter is a no-op.
 */
function ruleDefinitionMatchesRegions(def: RuleDefinition, regions: string[]): boolean {
  if (regions.length === 0) return true;
  const target = expandRegions(regions);
  for (const ruleCase of def.cases) {
    for (const key of ruleCase.result.citations) {
      const jurisdiction = CITATION_JURISDICTIONS[key];
      if (!jurisdiction) continue;
      if (target.has(jurisdiction) || jurisdiction === 'INTL') return true;
    }
  }
  return false;
}

export function ruleCatalogFor(overlays: string[], regions: string[] = []): Rule[] {
  void overlays; // overlays never gate rule selection — see ruleCatalogForOverlays
  if (regions.length === 0) {
    return BASE_RULES;
  }
  const regionFiltered = GENERATED_RULE_DEFS.filter((def) =>
    ruleDefinitionMatchesRegions(def, regions),
  );
  return buildRuleCatalog(regionFiltered);
}
