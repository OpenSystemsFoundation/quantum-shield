import type {
  Citation,
  CryptoAsset,
  EffortLevel,
  MigrationPosture,
  OverlayScope,
  RegulatoryStatus,
  Severity,
} from '@lib/pdf';
import type { CitationKey } from './citations.js';

export interface RuleContext {
  scanId: string;
  now: Date;
}

export interface RuleMatchResult {
  title: string;
  severity: Severity;
  regulatoryStatus: RegulatoryStatus;
  migrationPosture: MigrationPosture;
  effort: EffortLevel;
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
  /** Regulatory overlay frameworks findings from this rule map to. */
  overlays?: ReadonlyArray<OverlayScope['id']>;
  matches(asset: CryptoAsset, ctx: RuleContext): RuleMatchResult | null;
}

export type RuleImplementationStatus = 'active' | 'draft' | 'disabled';
export type RulePredicateName = 'quantum-vulnerable-signature';

export type RuleCondition =
  | {
      field: 'kind' | 'name' | 'algorithm';
      op: 'equals';
      value: string;
      caseInsensitive?: boolean;
    }
  | {
      field: 'algorithm';
      op: 'contains-any';
      values: string[];
      caseInsensitive?: boolean;
    }
  | {
      field: 'signatureHash';
      op: 'one-of';
      values: string[];
      caseInsensitive?: boolean;
    }
  | {
      field: 'keySize' | `captures.${string}`;
      op: 'lt' | 'gte';
      value: number;
    }
  | {
      field: 'keySize' | `captures.${string}`;
      op: 'between';
      min: number;
      max: number;
    }
  | {
      field: 'endpointUrl';
      op: 'protocol-equals';
      value: string;
    }
  | {
      field: 'expiresAt';
      op: 'days-until-between';
      min: number;
      max: number;
    }
  | {
      field: 'location';
      op: 'capture-number';
      pattern: string;
      capture: string;
      group?: number;
    }
  | {
      field: 'algorithm';
      op: 'predicate';
      predicate: RulePredicateName;
    };

export interface RuleResultDefinition {
  title: string;
  severity: Severity;
  regulatoryStatus: RegulatoryStatus;
  migrationPosture: MigrationPosture;
  effort: EffortLevel;
  hndlExposure: boolean;
  currentCrypto: string;
  recommendedReplacement: string;
  rationale: string;
  citations: CitationKey[];
  deadline?: string;
}

export interface RuleCaseDefinition {
  when: RuleCondition[];
  result: RuleResultDefinition;
}

export interface RuleDefinition {
  id: string;
  order: number;
  title: string;
  summary: string;
  description: string;
  implementationStatus: RuleImplementationStatus;
  appliesTo: Array<CryptoAsset['kind'] | '*'>;
  overlays?: Array<OverlayScope['id']>;
  cases: RuleCaseDefinition[];
}