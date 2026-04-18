import type { Finding, Report } from './types.js';

const HEADERS = [
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

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
