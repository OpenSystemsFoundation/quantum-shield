import type { Finding, Report } from './types.js';

/**
 * Emits an OpenVEX (https://openvex.dev) document describing the exploitability
 * status of each finding. OpenVEX is ingested by Dependency-Track, Grype,
 * Trivy and ServiceNow VR out of the box, so generating it gives the security
 * team a machine-readable view they can diff across scans without having to
 * parse the PDF.
 *
 * One VEX statement per finding. `status` is derived from regulatoryStatus:
 *   already-non-compliant      → affected
 *   deprecated-by-date         → affected
 *   disallowed-by-date         → affected
 *   advisory                   → under_investigation
 */

type VexStatus =
  | 'affected'
  | 'not_affected'
  | 'fixed'
  | 'under_investigation';

interface VexStatement {
  '@id': string;
  vulnerability: {
    name: string;
    description?: string;
  };
  timestamp: string;
  products: Array<{
    '@id': string;
    identifiers?: { purl?: string };
  }>;
  status: VexStatus;
  justification?: string;
  impact_statement?: string;
  action_statement?: string;
}

interface VexDocument {
  '@context': 'https://openvex.dev/ns/v0.2.0';
  '@id': string;
  author: string;
  timestamp: string;
  version: number;
  tooling: string;
  statements: VexStatement[];
}

function statusFromFinding(f: Finding): VexStatus {
  switch (f.regulatoryStatus) {
    case 'already-non-compliant':
    case 'disallowed-by-date':
    case 'deprecated-by-date':
      return 'affected';
    case 'advisory':
      return 'under_investigation';
    default:
      return 'under_investigation';
  }
}

function productIdFor(report: Report, f: Finding): string {
  return `pkg:salesforce/${encodeURIComponent(report.org.orgId)}/${f.asset.kind}/${encodeURIComponent(
    f.asset.identifier,
  )}`;
}

export function buildVexJson(report: Report): string {
  const now = report.generatedAt;
  const statements: VexStatement[] = report.findings.map((f) => ({
    '@id': `https://quantum-shield/vex/${report.org.orgId}/${f.id}`,
    vulnerability: {
      name: f.id,
      description: `${f.title} — ${f.currentCrypto}`,
    },
    timestamp: now,
    products: [
      {
        '@id': productIdFor(report, f),
        identifiers: {
          purl: `pkg:salesforce/${encodeURIComponent(report.org.orgId)}/${f.asset.kind}@${encodeURIComponent(
            f.asset.identifier,
          )}`,
        },
      },
    ],
    status: statusFromFinding(f),
    justification:
      statusFromFinding(f) === 'affected'
        ? f.rationale
        : 'Tracked pending migration decision.',
    action_statement: f.recommendedReplacement,
    impact_statement: f.hndlExposure
      ? 'Harvest-now-decrypt-later exposure: adversaries may already be storing traffic protected by this asset.'
      : undefined,
  }));

  const document: VexDocument = {
    '@context': 'https://openvex.dev/ns/v0.2.0',
    '@id': `https://quantum-shield/vex/${report.org.orgId}/${report.generatedAt}`,
    author: 'QuantumShield Scanner',
    timestamp: now,
    version: 1,
    tooling: 'quantum-shield-scanner@0.0.1',
    statements,
  };

  return JSON.stringify(document, null, 2);
}
