import type { Finding, Report } from './types.js';

const HEADERS = [
  'priorityRank',
  'priorityBand',
  'dataTier',
  'marginYears',
  'id',
  'category',
  'severity',
  'regulatoryStatus',
  'migrationPosture',
  'effort',
  'hndlExposure',
  'title',
  'assetName',
  'assetIdentifier',
  'currentCrypto',
  'recommendedReplacement',
  'deadline',
  'sources',
];

export function buildFindingsCsv(report: Report): string {
  const rows = report.findings.map((f) => row(f));
  return [HEADERS.join(','), ...rows].join('\r\n');
}

function row(f: Finding): string {
  const sources = f.citations.map((c) => `${c.sourceId} ${c.section ?? ''}`.trim()).join(' | ');
  const fields = [
    f.priority ? String(f.priority.rank) : '',
    f.priority?.band ?? '',
    f.priority?.dataTier ?? '',
    f.priority ? String(f.priority.marginYears) : '',
    f.id,
    f.category,
    f.severity,
    f.regulatoryStatus,
    f.migrationPosture,
    f.effort,
    f.hndlExposure ? 'yes' : 'no',
    f.title,
    f.asset.name,
    f.asset.identifier,
    f.currentCrypto,
    f.recommendedReplacement,
    f.deadline ?? '',
    sources,
  ];
  return fields.map(csvEscape).join(',');
}

/**
 * Characters that make spreadsheet applications interpret a cell as a formula
 * (OWASP CSV-injection guidance): = + - @ plus tab and carriage-return
 * variants that some parsers strip before evaluating.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function csvEscape(v: string): string {
  // Neutralise formula injection by prefixing a single quote inside the
  // quoted field, per OWASP. The quote is visible in the cell but the payload
  // is inert.
  const guarded = FORMULA_TRIGGER.test(v) ? `'${v}` : v;
  if (guarded !== v || /[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}
