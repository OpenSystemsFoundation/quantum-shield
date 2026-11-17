import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const rootDir = process.cwd();
const regulationsDir = path.join(rootDir, 'src', 'content', 'regulations');
const ruleDocsDir = path.join(rootDir, 'src', 'content', 'rules');
const regulationsOutputFile = path.join(rootDir, 'src', 'lib', 'rules', 'regulations.generated.ts');
const rulesOutputFile = path.join(rootDir, 'src', 'lib', 'rules', 'rule-catalog.generated.ts');

const ASSET_KINDS = new Set([
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
]);

const OVERLAY_IDS = new Set(['gdpr', 'dora', 'nis2', 'eidas2', 'pci-dss-4', 'hipaa', 'cmmc', 'swift-csp']);
const RULE_STATUSES = new Set(['active', 'draft', 'disabled']);
const CONDITION_OPS = new Set([
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
]);
const RESULT_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const RESULT_REGULATORY_STATUSES = new Set([
  'already-non-compliant',
  'deprecated-by-date',
  'disallowed-by-date',
  'advisory',
]);
const RESULT_POSTURES = new Set(['replace-now', 'plan-2030', 'prepare-2033', 'advisory']);
const RESULT_EFFORTS = new Set(['low', 'medium', 'high']);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureUnique(entries, field) {
  const seen = new Set();
  for (const entry of entries) {
    const value = entry[field];
    if (!value) continue;
    if (seen.has(value)) {
      throw new Error(`Duplicate ${field} value: ${value}`);
    }
    seen.add(value);
  }
}

function compareEntries(left, right) {
  if (left.order !== right.order) return left.order - right.order;
  return left.title.localeCompare(right.title);
}

async function loadMarkdownDocs(dirPath) {
  const filenames = (await readdir(dirPath))
    .filter((name) => name.endsWith('.md'))
    .sort();

  const docs = [];
  for (const filename of filenames) {
    const filePath = path.join(dirPath, filename);
    const source = await readFile(filePath, 'utf8');
    const { data, content } = matter(source);
    docs.push({
      slug: filename.replace(/\.md$/, ''),
      body: content.trim(),
      ...data,
    });
  }

  docs.sort(compareEntries);
  return docs;
}

function validateRegulationDocs(docs) {
  ensureUnique(docs, 'sourceId');
  ensureUnique(docs, 'citationKey');
  ensureUnique(docs, 'overlayId');
}

function validateCondition(ruleId, condition, index) {
  assert(isObject(condition), `${ruleId} condition ${index + 1} must be an object`);
  assert(typeof condition.field === 'string' && condition.field.length > 0, `${ruleId} condition ${index + 1} must define a field`);
  assert(typeof condition.op === 'string' && CONDITION_OPS.has(condition.op), `${ruleId} condition ${index + 1} uses unsupported op ${String(condition.op)}`);

  switch (condition.op) {
    case 'equals':
      assert(['kind', 'name', 'algorithm'].includes(condition.field), `${ruleId} condition ${index + 1} uses equals on unsupported field ${condition.field}`);
      assert(typeof condition.value === 'string' && condition.value.length > 0, `${ruleId} condition ${index + 1} must provide a string value`);
      break;
    case 'contains-any':
      assert(condition.field === 'algorithm', `${ruleId} condition ${index + 1} uses contains-any on unsupported field ${condition.field}`);
      assert(Array.isArray(condition.values) && condition.values.length > 0, `${ruleId} condition ${index + 1} must provide values`);
      break;
    case 'one-of':
      assert(['signatureHash', 'algorithm'].includes(condition.field), `${ruleId} condition ${index + 1} uses one-of on unsupported field ${condition.field}`);
      assert(Array.isArray(condition.values) && condition.values.length > 0, `${ruleId} condition ${index + 1} must provide values`);
      break;
    case 'missing':
      assert(condition.field === 'keySize', `${ruleId} condition ${index + 1} uses missing on unsupported field ${condition.field}`);
      break;
    case 'lt':
    case 'gte':
      assert(condition.field === 'keySize' || String(condition.field).startsWith('captures.'), `${ruleId} condition ${index + 1} uses numeric comparison on unsupported field ${condition.field}`);
      assert(typeof condition.value === 'number', `${ruleId} condition ${index + 1} must provide a numeric value`);
      break;
    case 'between':
      assert(condition.field === 'keySize' || String(condition.field).startsWith('captures.'), `${ruleId} condition ${index + 1} uses between on unsupported field ${condition.field}`);
      assert(typeof condition.min === 'number' && typeof condition.max === 'number', `${ruleId} condition ${index + 1} must provide min and max numbers`);
      break;
    case 'protocol-equals':
      assert(condition.field === 'endpointUrl', `${ruleId} condition ${index + 1} uses protocol-equals on unsupported field ${condition.field}`);
      assert(typeof condition.value === 'string' && condition.value.length > 0, `${ruleId} condition ${index + 1} must provide a protocol value`);
      break;
    case 'days-until-between':
      assert(condition.field === 'expiresAt', `${ruleId} condition ${index + 1} uses days-until-between on unsupported field ${condition.field}`);
      assert(typeof condition.min === 'number' && typeof condition.max === 'number', `${ruleId} condition ${index + 1} must provide min and max day offsets`);
      break;
    case 'capture-number':
      assert(condition.field === 'location', `${ruleId} condition ${index + 1} uses capture-number on unsupported field ${condition.field}`);
      assert(typeof condition.pattern === 'string' && condition.pattern.length > 0, `${ruleId} condition ${index + 1} must provide a regex pattern`);
      assert(typeof condition.capture === 'string' && condition.capture.length > 0, `${ruleId} condition ${index + 1} must provide a capture name`);
      if (condition.group !== undefined) {
        assert(Number.isInteger(condition.group) && condition.group > 0, `${ruleId} condition ${index + 1} capture group must be a positive integer`);
      }
      break;
    case 'predicate':
      assert(condition.field === 'algorithm', `${ruleId} condition ${index + 1} uses predicate on unsupported field ${condition.field}`);
      assert(condition.predicate === 'quantum-vulnerable-signature', `${ruleId} condition ${index + 1} uses unsupported predicate ${String(condition.predicate)}`);
      break;
  }
}

function validateResult(ruleId, result, index) {
  assert(isObject(result), `${ruleId} case ${index + 1} result must be an object`);
  assert(typeof result.title === 'string' && result.title.length > 0, `${ruleId} case ${index + 1} result must include a title`);
  assert(typeof result.currentCrypto === 'string' && result.currentCrypto.length > 0, `${ruleId} case ${index + 1} result must include currentCrypto`);
  assert(typeof result.recommendedReplacement === 'string' && result.recommendedReplacement.length > 0, `${ruleId} case ${index + 1} result must include recommendedReplacement`);
  assert(typeof result.rationale === 'string' && result.rationale.length > 0, `${ruleId} case ${index + 1} result must include rationale`);
  assert(RESULT_SEVERITIES.has(result.severity), `${ruleId} case ${index + 1} uses unsupported severity ${String(result.severity)}`);
  assert(RESULT_REGULATORY_STATUSES.has(result.regulatoryStatus), `${ruleId} case ${index + 1} uses unsupported regulatory status ${String(result.regulatoryStatus)}`);
  assert(RESULT_POSTURES.has(result.migrationPosture), `${ruleId} case ${index + 1} uses unsupported migration posture ${String(result.migrationPosture)}`);
  assert(RESULT_EFFORTS.has(result.effort), `${ruleId} case ${index + 1} uses unsupported effort ${String(result.effort)}`);
  assert(typeof result.hndlExposure === 'boolean', `${ruleId} case ${index + 1} must set hndlExposure`);
  assert(Array.isArray(result.citations) && result.citations.length > 0, `${ruleId} case ${index + 1} must declare citations`);
}

function validateRuleDocs(docs) {
  ensureUnique(docs, 'id');
  for (const doc of docs) {
    assert(typeof doc.id === 'string' && doc.id.length > 0, `${doc.slug} must define an id`);
    assert(typeof doc.title === 'string' && doc.title.length > 0, `${doc.id} must define a title`);
    assert(typeof doc.summary === 'string' && doc.summary.length > 0, `${doc.id} must define a summary`);
    assert(typeof doc.description === 'string' && doc.description.length > 0, `${doc.id} must define a description`);
    assert(typeof doc.implementationStatus === 'string' && RULE_STATUSES.has(doc.implementationStatus), `${doc.id} must define a supported implementationStatus`);
    assert(Array.isArray(doc.appliesTo) && doc.appliesTo.length > 0, `${doc.id} must define appliesTo`);
    for (const kind of doc.appliesTo) {
      assert(ASSET_KINDS.has(kind), `${doc.id} references unsupported appliesTo kind ${String(kind)}`);
    }
    if (doc.overlays !== undefined) {
      assert(Array.isArray(doc.overlays), `${doc.id} overlays must be an array when provided`);
      for (const overlayId of doc.overlays) {
        assert(OVERLAY_IDS.has(overlayId), `${doc.id} references unsupported overlay ${String(overlayId)}`);
      }
    }
    assert(Array.isArray(doc.cases) && doc.cases.length > 0, `${doc.id} must define at least one case`);
    doc.cases.forEach((ruleCase, caseIndex) => {
      assert(isObject(ruleCase), `${doc.id} case ${caseIndex + 1} must be an object`);
      assert(Array.isArray(ruleCase.when) && ruleCase.when.length > 0, `${doc.id} case ${caseIndex + 1} must define when conditions`);
      ruleCase.when.forEach((condition, conditionIndex) => validateCondition(doc.id, condition, conditionIndex));
      validateResult(doc.id, ruleCase.result, caseIndex);
    });
  }
}

const regulationDocs = await loadMarkdownDocs(regulationsDir);
validateRegulationDocs(regulationDocs);

const citations = Object.fromEntries(
  regulationDocs
    .filter((doc) => doc.citationKey)
    .map((doc) => [
      doc.citationKey,
      {
        sourceId: doc.sourceId,
        title: doc.title,
        jurisdiction: doc.jurisdiction,
        ...(doc.section ? { section: doc.section } : {}),
        documentVersion: doc.documentVersion,
        retrievalUrl: doc.retrievalUrl,
      },
    ]),
);

const overlays = regulationDocs
  .filter((doc) => doc.overlayId)
  .map((doc) => ({
    id: doc.overlayId,
    label: doc.overlayLabel ?? doc.title,
  }));

const sourceVersions = regulationDocs
  .filter((doc) => doc.citationKey)
  .map((doc) => ({
    sourceId: doc.sourceId,
    documentVersion: doc.documentVersion,
    retrievedAt: doc.lastReviewed,
  }));

const generatedRegulations = `/* auto-generated by scripts/sync-regulations.mjs; do not edit by hand. */
import type { Citation, OverlayScope, Report } from '@lib/pdf';

export const GENERATED_CITATIONS = ${JSON.stringify(citations, null, 2)} as const satisfies Record<string, Citation>;

export const GENERATED_OVERLAYS = ${JSON.stringify(overlays, null, 2)} as const satisfies ReadonlyArray<Pick<OverlayScope, 'id' | 'label'>>;

export const GENERATED_SOURCE_VERSIONS = ${JSON.stringify(sourceVersions, null, 2)} as const satisfies Report['sourceVersions'];
`;

const ruleDocs = await loadMarkdownDocs(ruleDocsDir);
validateRuleDocs(ruleDocs);

const generatedRules = ruleDocs.map((doc) => ({
  id: doc.id,
  order: doc.order,
  title: doc.title,
  summary: doc.summary,
  description: doc.description,
  implementationStatus: doc.implementationStatus,
  appliesTo: doc.appliesTo,
  ...(doc.overlays?.length ? { overlays: doc.overlays } : {}),
  cases: doc.cases,
}));

const generatedRuleCatalog = `/* auto-generated by scripts/sync-regulations.mjs; do not edit by hand. */
import type { RuleDefinition } from './types.js';

export const GENERATED_RULE_DEFS = ${JSON.stringify(generatedRules, null, 2)} as const satisfies ReadonlyArray<RuleDefinition>;
`;

await writeFile(regulationsOutputFile, generatedRegulations);
await writeFile(rulesOutputFile, generatedRuleCatalog);

// stderr, so `npm run --silent qshield -- ... --json` keeps stdout pure JSON.
console.error(
  `Synced ${regulationDocs.length} regulation docs -> ${path.relative(rootDir, regulationsOutputFile)}; ${ruleDocs.length} rule docs -> ${path.relative(rootDir, rulesOutputFile)}`,
);