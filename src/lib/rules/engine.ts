import type { CryptoAsset, Finding } from '@lib/pdf';
import { buildRuleCatalog, filterRuleDefinitionsForOverlays } from './catalog.js';
import { GENERATED_RULE_DEFS } from './rule-catalog.generated.js';
import type { Rule, RuleContext } from './types.js';

export type { Rule, RuleContext, RuleMatchResult } from './types.js';

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

const BASE_RULES = buildRuleCatalog(filterRuleDefinitionsForOverlays(GENERATED_RULE_DEFS, []));

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

export function ruleCatalogForOverlays(overlays: string[]): Rule[] {
  if (overlays.length === 0) {
    return BASE_RULES;
  }

  return buildRuleCatalog(filterRuleDefinitionsForOverlays(GENERATED_RULE_DEFS, overlays));
}
