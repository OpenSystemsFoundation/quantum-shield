import type { DataProfile, SensitiveDataEntry, SensitiveDataSource } from '../pdf/types.js';
import { AuthError, CorsBlockedError, NetworkError, type ScanClient } from '../scan/sfClient.js';
import {
  STANDARD_OBJECT_DEFAULTS,
  TIER_LABELS,
  maxTier,
  tierForClassification,
  tierForCompliance,
  type StoredTier,
} from './defaults.js';

/** Objects per FieldDefinition / EntityParticle query (keeps URLs short). */
const OBJECT_BATCH = 40;
/** Upper bound on custom objects inspected, so huge orgs do not stall a scan. */
const MAX_CUSTOM_OBJECTS = 400;

function soqlList(names: string[]): string {
  return names.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(',');
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface EntityRecord {
  QualifiedApiName: string;
}

interface FieldDefinitionRecord {
  QualifiedApiName: string;
  EntityDefinition?: { QualifiedApiName?: string } | null;
  SecurityClassification?: string | null;
  ComplianceGroup?: string | null;
}

interface EntityParticleRecord {
  QualifiedApiName: string;
  EntityDefinition?: { QualifiedApiName?: string } | null;
}

/**
 * Queries the profile pass runs, in order. Exported so fixtures and the
 * capture script can record exactly the same SOQL.
 */
export const DATA_PROFILE_QUERIES = {
  standardObjects: `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName IN (${soqlList(
    Object.keys(STANDARD_OBJECT_DEFAULTS),
  )})`,
  // SOQL LIKE treats `_` as a single-character wildcard; results are
  // filtered to real `__c` names below.
  customObjects: `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c'`,
  // FieldDefinition rejects OR ("Disjunctions not supported"), so the two
  // signals are read separately and merged per field.
  classifiedFields: (objects: string[]) =>
    `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName, SecurityClassification, ComplianceGroup FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName IN (${soqlList(
      objects,
    )}) AND SecurityClassification != null`,
  complianceFields: (objects: string[]) =>
    `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName, SecurityClassification, ComplianceGroup FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName IN (${soqlList(
      objects,
    )}) AND ComplianceGroup != null`,
  encryptedFields: (objects: string[]) =>
    `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName FROM EntityParticle WHERE EntityDefinition.QualifiedApiName IN (${soqlList(
      objects,
    )}) AND IsEncrypted = true`,
};

export interface DataProfileResult {
  profile: DataProfile;
  /** Sub-queries that failed; empty when everything was read. */
  failures: string[];
}

function addEntry(
  map: Map<string, SensitiveDataEntry>,
  object: string,
  field: string | undefined,
  tier: StoredTier,
  source: SensitiveDataSource,
  detail: string,
): void {
  const key = `${object}.${field ?? '*'}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { object, ...(field ? { field } : {}), tier, sources: [source], detail });
    return;
  }
  existing.tier = maxTier(existing.tier, tier);
  if (!existing.sources.includes(source)) existing.sources.push(source);
  if (!existing.detail.includes(detail)) existing.detail = `${existing.detail} · ${detail}`;
}

/**
 * Builds the org's data-sensitivity profile from read-only metadata:
 *
 *  1. Field classification (Data Sensitivity Level, Compliance
 *     Categorization) on standard sensitive objects and every custom object.
 *  2. Shield Platform Encryption: which fields are encrypted.
 *  3. Best-practice defaults for standard objects that exist in the org.
 *
 * Salesforce returns only fields the scanning user can see (field-level
 * security), so the profile is a lower bound; the note says so.
 */
export async function buildDataProfile(client: ScanClient): Promise<DataProfileResult> {
  const failures: string[] = [];
  const entries = new Map<string, SensitiveDataEntry>();

  const tryQuery = async <T>(label: string, soql: string): Promise<T[] | null> => {
    try {
      return (await client.query<T>(soql)).records;
    } catch (err) {
      // Transport and auth problems are the scan's to handle, not ours.
      if (err instanceof CorsBlockedError || err instanceof AuthError || err instanceof NetworkError) throw err;
      failures.push(`${label}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
      return null;
    }
  };

  const standard =
    (await tryQuery<EntityRecord>('standard objects', DATA_PROFILE_QUERIES.standardObjects))?.map(
      (r) => r.QualifiedApiName,
    ) ?? [];
  const customAll =
    (await tryQuery<EntityRecord>('custom objects', DATA_PROFILE_QUERIES.customObjects))
      ?.map((r) => r.QualifiedApiName)
      .filter((n) => n.endsWith('__c'))
      .sort() ?? [];
  const custom = customAll.slice(0, MAX_CUSTOM_OBJECTS);
  const objects = [...new Set([...standard, ...custom])];

  const encrypted: Array<{ object: string; field: string }> = [];
  for (const group of batches(objects, OBJECT_BATCH)) {
    const classified = [
      ...((await tryQuery<FieldDefinitionRecord>('field classification', DATA_PROFILE_QUERIES.classifiedFields(group))) ?? []),
      ...((await tryQuery<FieldDefinitionRecord>('compliance categorization', DATA_PROFILE_QUERIES.complianceFields(group))) ?? []),
    ];
    for (const r of classified) {
      const object = r.EntityDefinition?.QualifiedApiName;
      if (!object) continue;
      const byLevel = tierForClassification(r.SecurityClassification);
      const byCompliance = tierForCompliance(r.ComplianceGroup);
      if (byLevel) addEntry(entries, object, r.QualifiedApiName, byLevel, 'classification', r.SecurityClassification ?? '');
      if (byCompliance) addEntry(entries, object, r.QualifiedApiName, byCompliance, 'compliance', r.ComplianceGroup ?? '');
    }

    const enc = await tryQuery<EntityParticleRecord>('Shield-encrypted fields', DATA_PROFILE_QUERIES.encryptedFields(group));
    for (const r of enc ?? []) {
      const object = r.EntityDefinition?.QualifiedApiName;
      if (object) encrypted.push({ object, field: r.QualifiedApiName });
    }
  }

  for (const name of standard) {
    const def = STANDARD_OBJECT_DEFAULTS[name];
    if (def) addEntry(entries, name, undefined, def.tier, 'default', `best-practice default: ${def.why}`);
  }

  // Someone chose to encrypt these fields, so they are at least confidential;
  // a classification or the object's default can raise that.
  let shieldTier: StoredTier | undefined;
  for (const { object, field } of encrypted) {
    const known = entries.get(`${object}.${field}`)?.tier;
    const objectDefault = STANDARD_OBJECT_DEFAULTS[object]?.tier;
    let tier: StoredTier = 'confidential';
    if (known) tier = maxTier(tier, known);
    if (objectDefault) tier = maxTier(tier, objectDefault);
    addEntry(entries, object, field, tier, 'shield', 'Shield-encrypted');
    shieldTier = shieldTier ? maxTier(shieldTier, tier) : tier;
  }

  const list = [...entries.values()].sort(
    (a, b) => a.object.localeCompare(b.object) || (a.field ?? '').localeCompare(b.field ?? ''),
  );
  // Every org has Contact, so an empty profile only happens when the
  // metadata could not be read; assume personal data rather than nothing.
  const orgTier = list.reduce<StoredTier>((t, e) => maxTier(t, e.tier), list.length ? 'ephemeral' : 'personal');

  const notes = [
    'Only fields visible to the scanning user (field-level security) are included, so this is a lower bound.',
  ];
  if (customAll.length > custom.length) {
    notes.push(`${customAll.length - custom.length} custom objects beyond the first ${MAX_CUSTOM_OBJECTS} were not inspected.`);
  }
  if (list.length === 0) {
    notes.push(`No sensitive-data metadata could be read; integrations are assumed to carry ${TIER_LABELS.personal.toLowerCase()}.`);
  }

  return {
    profile: {
      entries: list,
      orgTier,
      ...(shieldTier ? { shieldTier } : {}),
      objectsInspected: objects.length,
      note: notes.join(' '),
    },
    failures,
  };
}
