import type { DataTier, RiskAssumptions } from '../pdf/types.js';

export type StoredTier = Exclude<DataTier, 'none'>;

/** Tiers from least to most demanding; index = strength. */
export const TIER_ORDER: readonly StoredTier[] = ['ephemeral', 'internal', 'confidential', 'personal', 'regulated'];

export const TIER_LABELS: Record<DataTier, string> = {
  none: 'No stored data',
  ephemeral: 'Short-lived',
  internal: 'Internal',
  confidential: 'Confidential business',
  personal: 'Personal data',
  regulated: 'Long-lived regulated',
};

export const TIER_DESCRIPTIONS: Record<StoredTier, string> = {
  ephemeral: 'Session tokens, one-time codes and data that is worthless within months.',
  internal: 'Operational data with little value to an outsider after a few years.',
  confidential: 'Contracts, pricing, pipeline and financial records kept for audit.',
  personal: 'Names, contact details and other personal data covered by privacy law.',
  regulated: 'Health, national identity and financial-account data that stays sensitive for decades.',
};

/** Preset years for a cryptographically relevant quantum computer. */
export const QUANTUM_YEAR_PRESETS = [
  { year: 2030, label: 'Conservative' },
  { year: 2033, label: 'Moderate' },
  { year: 2035, label: 'Optimistic' },
] as const;

export const DEFAULT_ASSUMPTIONS: RiskAssumptions = {
  quantumYear: 2033,
  shelfLifeYears: {
    ephemeral: 0,
    internal: 3,
    confidential: 7,
    personal: 10,
    regulated: 25,
  },
  migrationYears: {
    low: 1,
    medium: 2,
    high: 4,
  },
};

export function maxTier(a: StoredTier, b: StoredTier): StoredTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

/** Salesforce Data Sensitivity Level (FieldDefinition.SecurityClassification). */
export function tierForClassification(value: string | null | undefined): StoredTier | null {
  switch ((value ?? '').toLowerCase()) {
    case 'internal':
      return 'internal';
    case 'confidential':
      return 'confidential';
    case 'restricted':
    case 'missioncritical':
      return 'regulated';
    default:
      // Public, unset or an org-defined label we do not know.
      return null;
  }
}

const REGULATED_COMPLIANCE = new Set(['HIPAA', 'PCI', 'GLBA']);
const PERSONAL_COMPLIANCE = new Set(['PII', 'GDPR', 'CCPA', 'COPPA', 'PIPEDA']);

/** Salesforce Compliance Categorization (semicolon-separated picklist). */
export function tierForCompliance(value: string | null | undefined): StoredTier | null {
  let tier: StoredTier | null = null;
  for (const raw of (value ?? '').split(';')) {
    const group = raw.trim().toUpperCase();
    if (!group) continue;
    if (REGULATED_COMPLIANCE.has(group)) return 'regulated';
    if (PERSONAL_COMPLIANCE.has(group)) tier = 'personal';
    // Other org-defined groups still signal that someone cared.
    else if (!tier) tier = 'confidential';
  }
  return tier;
}

/**
 * Best-practice defaults for standard and well-known industry objects, used
 * when the org has not classified its fields. An object only counts when it
 * exists in the scanned org. The scan never reads records, so objects that
 * exist in every org whether used or not (PaymentMethod, CardPaymentMethod,
 * DigitalWallet) are left out: their presence says nothing about the data.
 * Industry objects (Health Cloud, Financial Services Cloud) only exist when
 * the product is installed, so their presence is a real signal.
 */
export const STANDARD_OBJECT_DEFAULTS: Record<string, { tier: StoredTier; why: string }> = {
  Contact: { tier: 'personal', why: 'people’s names and contact details' },
  Lead: { tier: 'personal', why: 'prospects’ names and contact details' },
  Individual: { tier: 'personal', why: 'consent and privacy preferences' },
  ContactPointEmail: { tier: 'personal', why: 'email addresses' },
  ContactPointPhone: { tier: 'personal', why: 'phone numbers' },
  ContactPointAddress: { tier: 'personal', why: 'postal addresses' },
  Case: { tier: 'personal', why: 'free-text customer conversations' },
  Account: { tier: 'confidential', why: 'customer relationships (personal data with person accounts)' },
  Opportunity: { tier: 'confidential', why: 'pipeline and pricing' },
  Contract: { tier: 'confidential', why: 'contract terms' },
  Order: { tier: 'confidential', why: 'order history' },
  Quote: { tier: 'confidential', why: 'pricing' },
  IdentityDocument: { tier: 'regulated', why: 'identity documents' },
  FinancialAccount: { tier: 'regulated', why: 'financial accounts' },
  FinServ__FinancialAccount__c: { tier: 'regulated', why: 'financial accounts' },
  FinServ__Card__c: { tier: 'regulated', why: 'card data' },
  HealthCondition: { tier: 'regulated', why: 'health records' },
  ClinicalEncounter: { tier: 'regulated', why: 'health records' },
  PatientMedicalProcedure: { tier: 'regulated', why: 'health records' },
  MedicationStatement: { tier: 'regulated', why: 'health records' },
  CarePlan: { tier: 'regulated', why: 'health records' },
  HealthCloudGA__EhrPatient__c: { tier: 'regulated', why: 'health records' },
};
