import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const assetKinds = [
  '*',
  'certificate',
  'connected-app',
  'named-credential',
  'external-credential',
  'remote-site',
  'external-data-source',
  'saml-sso',
  'oidc-provider',
  'shield-key',
  'apex-call',
  'installed-package',
  'session-settings',
  'tls-endpoint',
] as const;

const overlayIds = ['gdpr', 'dora', 'nis2', 'eidas2', 'pci-dss-4', 'hipaa', 'cmmc', 'swift-csp'] as const;

const ruleCondition = z.object({
  field: z.string(),
  op: z.enum([
    'equals',
    'contains-any',
    'one-of',
    'missing',
    'lt',
    'gte',
    'between',
    'protocol-equals',
    'days-until-between',
    'capture-number',
    'predicate',
  ]),
  value: z.union([z.string(), z.number()]).optional(),
  values: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  capture: z.string().optional(),
  group: z.number().int().positive().optional(),
  predicate: z.enum(['quantum-vulnerable-signature']).optional(),
  caseInsensitive: z.boolean().optional(),
});

const ruleResult = z.object({
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  regulatoryStatus: z.enum(['already-non-compliant', 'deprecated-by-date', 'disallowed-by-date', 'advisory']),
  migrationPosture: z.enum(['replace-now', 'plan-2030', 'prepare-2033', 'advisory']),
  effort: z.enum(['low', 'medium', 'high']),
  hndlExposure: z.boolean(),
  currentCrypto: z.string(),
  recommendedReplacement: z.string(),
  rationale: z.string(),
  citations: z.array(z.string()).min(1),
  deadline: z.string().optional(),
});

const regulations = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/regulations' }),
  schema: z.object({
    order: z.number().int().nonnegative(),
    title: z.string(),
    kind: z.enum(['overlay', 'reference']),
    implementationStatus: z.enum(['active', 'reference-only', 'planned']),
    citationKey: z.string().optional(),
    overlayId: z
      .enum(['gdpr', 'dora', 'nis2', 'eidas2', 'pci-dss-4', 'hipaa', 'cmmc', 'swift-csp'])
      .optional(),
    overlayLabel: z.string().optional(),
    sourceId: z.string(),
    jurisdiction: z.enum(['EU', 'NL', 'DE', 'FR', 'UK', 'US', 'INTL']),
    documentVersion: z.string(),
    section: z.string().optional(),
    retrievalUrl: z.url(),
    lastReviewed: z.string(),
    updateCadence: z.string(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    requirements: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        mapping: z.string(),
      }),
    ).default([]),
  }),
});

const rules = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/rules' }),
  schema: z.object({
    order: z.number().int().nonnegative(),
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    description: z.string(),
    implementationStatus: z.enum(['active', 'draft', 'disabled']),
    appliesTo: z.array(z.enum(assetKinds)).min(1),
    overlays: z.array(z.enum(overlayIds)).default([]),
    tags: z.array(z.string()).default([]),
    cases: z.array(
      z.object({
        when: z.array(ruleCondition).min(1),
        result: ruleResult,
      }),
    ).min(1),
  }),
});

export const collections = { regulations, rules };
