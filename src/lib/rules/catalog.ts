import type { CryptoAsset } from '@lib/pdf';
import { cite } from './citations.js';
import type {
  Rule,
  RuleCaseDefinition,
  RuleCondition,
  RuleContext,
  RuleDefinition,
  RuleMatchResult,
} from './types.js';

interface MatchState {
  captures: Record<string, number>;
  computed: Record<string, string | number>;
}

interface TemplateContext {
  asset: CryptoAsset;
  captures: MatchState['captures'];
  computed: MatchState['computed'];
}

const IF_BLOCK_PATTERN = /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g;
const TOKEN_PATTERN = /{{\s*([^}]+?)\s*}}/g;

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

function compareByOrder(left: RuleDefinition, right: RuleDefinition): number {
  if (left.order !== right.order) return left.order - right.order;
  return left.title.localeCompare(right.title);
}

function normalise(value: string, caseInsensitive = false): string {
  return caseInsensitive ? value.toUpperCase() : value;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function getAssetString(asset: CryptoAsset, field: 'kind' | 'name' | 'algorithm' | 'signatureHash' | 'endpointUrl' | 'location'): string | undefined {
  switch (field) {
    case 'kind':
      return asset.kind;
    case 'name':
      return asset.name;
    case 'algorithm':
      return asset.algorithm;
    case 'signatureHash':
      return asset.signatureHash;
    case 'endpointUrl':
      return asset.endpointUrl;
    case 'location':
      return asset.location;
  }
}

function getNumericValue(asset: CryptoAsset, state: MatchState, field: 'keySize' | `captures.${string}`): number | undefined {
  if (field === 'keySize') return asset.keySize;
  return state.captures[field.slice('captures.'.length)];
}

function resolvePath(path: string, context: TemplateContext): string | number | undefined {
  if (path.startsWith('asset.')) {
    const key = path.slice('asset.'.length) as keyof CryptoAsset;
    const value = context.asset[key];
    if (typeof value === 'string' || typeof value === 'number') return value;
    return undefined;
  }
  if (path.startsWith('captures.')) {
    return context.captures[path.slice('captures.'.length)];
  }
  if (path.startsWith('computed.')) {
    return context.computed[path.slice('computed.'.length)];
  }
  return undefined;
}

function renderTemplate(template: string, context: TemplateContext): string {
  const withConditionals = template.replace(IF_BLOCK_PATTERN, (_, rawPath: string, inner: string) => {
    const value = resolvePath(rawPath.trim(), context);
    return hasValue(value) ? renderTemplate(inner, context) : '';
  });

  return withConditionals.replace(TOKEN_PATTERN, (_, rawExpr: string) => {
    const [rawPath, rawFallback] = rawExpr.split('??').map((part) => part.trim());
    const value = resolvePath(rawPath, context);
    if (!hasValue(value)) {
      return rawFallback ?? '';
    }
    return String(value);
  });
}

function evaluateCondition(condition: RuleCondition, asset: CryptoAsset, ctx: RuleContext, state: MatchState): boolean {
  switch (condition.op) {
    case 'equals': {
      const actual = getAssetString(asset, condition.field);
      if (!actual) return false;
      const caseInsensitive = condition.caseInsensitive ?? condition.field === 'algorithm';
      return normalise(actual, caseInsensitive) === normalise(condition.value, caseInsensitive);
    }
    case 'contains-any': {
      const actual = getAssetString(asset, 'algorithm');
      if (!actual) return false;
      const caseInsensitive = condition.caseInsensitive ?? true;
      const value = normalise(actual, caseInsensitive);
      return condition.values.some((item) => value.includes(normalise(item, caseInsensitive)));
    }
    case 'one-of': {
      const actual = getAssetString(asset, 'signatureHash');
      if (!actual) return false;
      const caseInsensitive = condition.caseInsensitive ?? true;
      const value = normalise(actual, caseInsensitive);
      return condition.values.some((item) => value === normalise(item, caseInsensitive));
    }
    case 'lt': {
      const value = getNumericValue(asset, state, condition.field);
      return value !== undefined && value < condition.value;
    }
    case 'gte': {
      const value = getNumericValue(asset, state, condition.field);
      return value !== undefined && value >= condition.value;
    }
    case 'between': {
      const value = getNumericValue(asset, state, condition.field);
      return value !== undefined && value >= condition.min && value <= condition.max;
    }
    case 'protocol-equals': {
      const actual = getAssetString(asset, 'endpointUrl');
      if (!actual) return false;
      try {
        return new URL(actual).protocol === condition.value;
      } catch {
        return false;
      }
    }
    case 'days-until-between': {
      if (!asset.expiresAt) return false;
      const expiresAt = Date.parse(asset.expiresAt);
      if (Number.isNaN(expiresAt)) return false;
      const daysUntilExpiry = (expiresAt - ctx.now.getTime()) / 86_400_000;
      state.computed.daysUntilExpiry = daysUntilExpiry;
      state.computed.daysUntilExpiryCeil = Math.ceil(daysUntilExpiry);
      state.computed.expiresAtDate = asset.expiresAt.slice(0, 10);
      return daysUntilExpiry >= condition.min && daysUntilExpiry <= condition.max;
    }
    case 'capture-number': {
      const actual = getAssetString(asset, 'location');
      if (!actual) return false;
      const match = new RegExp(condition.pattern).exec(actual);
      if (!match) return false;
      const raw = match[condition.group ?? 1];
      const value = Number(raw);
      if (Number.isNaN(value)) return false;
      state.captures[condition.capture] = value;
      return true;
    }
    case 'predicate':
      if (condition.predicate === 'quantum-vulnerable-signature') {
        return isQuantumVulnerableSignature(asset.algorithm);
      }
      return false;
  }
}

function evaluateCase(ruleCase: RuleCaseDefinition, asset: CryptoAsset, ctx: RuleContext): MatchState | null {
  const state: MatchState = { captures: {}, computed: {} };
  for (const condition of ruleCase.when) {
    if (!evaluateCondition(condition, asset, ctx, state)) {
      return null;
    }
  }
  return state;
}

function materialiseResult(asset: CryptoAsset, state: MatchState, result: RuleCaseDefinition['result']): RuleMatchResult {
  const context: TemplateContext = {
    asset,
    captures: state.captures,
    computed: state.computed,
  };

  return {
    title: renderTemplate(result.title, context),
    severity: result.severity,
    regulatoryStatus: result.regulatoryStatus,
    migrationPosture: result.migrationPosture,
    effort: result.effort,
    hndlExposure: result.hndlExposure,
    currentCrypto: renderTemplate(result.currentCrypto, context),
    recommendedReplacement: renderTemplate(result.recommendedReplacement, context),
    rationale: renderTemplate(result.rationale, context),
    citations: cite(...result.citations),
    ...(result.deadline ? { deadline: renderTemplate(result.deadline, context) } : {}),
  };
}

function buildRule(definition: RuleDefinition): Rule {
  return {
    id: definition.id,
    description: definition.description,
    ...(definition.overlays?.length ? { overlays: definition.overlays } : {}),
    matches(asset, ctx) {
      const appliesUniversally = definition.appliesTo.includes('*');
      if (!appliesUniversally && !definition.appliesTo.includes(asset.kind)) {
        return null;
      }

      for (const ruleCase of definition.cases) {
        const state = evaluateCase(ruleCase, asset, ctx);
        if (state) {
          return materialiseResult(asset, state, ruleCase.result);
        }
      }

      return null;
    },
  };
}

/**
 * Overlay ids declared on a rule are mapping metadata — they say which
 * regulatory frameworks (PCI DSS, NIS 2, DORA, …) a finding traces to. They
 * never gate whether a rule runs: the base catalog always applies, and the
 * regulatory appendix filters findings to the overlays the user enabled.
 */
export function filterRuleDefinitionsForOverlays(
  definitions: ReadonlyArray<RuleDefinition>,
  _selectedOverlays: string[],
): RuleDefinition[] {
  return [...definitions];
}

export function buildRuleCatalog(definitions: ReadonlyArray<RuleDefinition>): Rule[] {
  return [...definitions]
    .filter((definition) => definition.implementationStatus === 'active')
    .sort(compareByOrder)
    .map(buildRule);
}