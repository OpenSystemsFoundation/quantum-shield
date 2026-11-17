import type { RiskAssumptions } from '../pdf/types.js';
import { DEFAULT_ASSUMPTIONS, TIER_ORDER, type StoredTier } from './defaults.js';
import type { AssetTierOverrides } from './score.js';

/**
 * The reader's prioritisation assumptions, kept per org in this browser only
 * (localStorage). Nothing here leaves the device.
 */
export interface RiskSettings {
  assumptions: RiskAssumptions;
  overrides: AssetTierOverrides;
}

const KEY_PREFIX = 'qs.risk.v1.';

function clampYears(n: unknown, fallback: number, max = 100): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.round(v * 10) / 10, 0), max);
}

/** Coerces untrusted stored JSON back into valid settings. */
export function sanitizeSettings(raw: unknown): RiskSettings {
  const d = DEFAULT_ASSUMPTIONS;
  const r = (raw ?? {}) as Partial<{ assumptions: Partial<RiskAssumptions>; overrides: Record<string, unknown> }>;
  const a = r.assumptions ?? {};
  const year = Math.round(Number(a.quantumYear));
  const assumptions: RiskAssumptions = {
    quantumYear: Number.isFinite(year) && year >= 2024 && year <= 2100 ? year : d.quantumYear,
    shelfLifeYears: {
      ephemeral: clampYears(a.shelfLifeYears?.ephemeral, d.shelfLifeYears.ephemeral),
      internal: clampYears(a.shelfLifeYears?.internal, d.shelfLifeYears.internal),
      confidential: clampYears(a.shelfLifeYears?.confidential, d.shelfLifeYears.confidential),
      personal: clampYears(a.shelfLifeYears?.personal, d.shelfLifeYears.personal),
      regulated: clampYears(a.shelfLifeYears?.regulated, d.shelfLifeYears.regulated),
    },
    migrationYears: {
      low: clampYears(a.migrationYears?.low, d.migrationYears.low, 30),
      medium: clampYears(a.migrationYears?.medium, d.migrationYears.medium, 30),
      high: clampYears(a.migrationYears?.high, d.migrationYears.high, 30),
    },
  };
  const overrides: AssetTierOverrides = {};
  for (const [k, v] of Object.entries(r.overrides ?? {})) {
    if (typeof k === 'string' && k.length < 300 && TIER_ORDER.includes(v as StoredTier)) {
      overrides[k] = v as StoredTier;
    }
  }
  return { assumptions, overrides };
}

export function loadRiskSettings(orgId: string): RiskSettings {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + orgId);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveRiskSettings(orgId: string, settings: RiskSettings): void {
  try {
    localStorage.setItem(KEY_PREFIX + orgId, JSON.stringify(settings));
  } catch {
    /* private mode / storage blocked: settings last for this page only */
  }
}

export function clearRiskSettings(orgId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + orgId);
  } catch {
    /* noop */
  }
}
