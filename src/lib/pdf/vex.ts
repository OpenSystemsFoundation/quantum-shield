import { QSHIELD_HOMEPAGE, QSHIELD_NAME, QSHIELD_VERSION } from '../version.js';
import type { Finding, Report } from './types.js';

/**
 * Emits an OpenVEX (https://openvex.dev) document describing the exploitability
 * status of each finding. OpenVEX is ingested by Dependency-Track, Grype,
 * Trivy and ServiceNow VR out of the box, so generating it gives the security
 * team a machine-readable view they can diff across scans without having to
 * parse the PDF.
 *
 * One VEX statement per finding, all with status `affected`: a finding means
 * the scanner observed the condition, whatever its regulatory status. An
 * advisory finding is still an observed fact, not an open question, so it is
 * NOT `under_investigation` — that status would tell consumers the scanner
 * had not yet decided, and tools hide such statements from "affected" views.
 * The regulatory status and severity travel in `status_notes`.
 *
 * Scan coverage: an OpenVEX document has no place for "this part was not
 * checked", and adding a custom top-level field would break strict 0.2.0
 * consumers. So every category that was not fully scanned (`partial`,
 * `failed`, `skipped`) becomes one `under_investigation` statement about that
 * category — which is exactly what that status means. A scan that failed
 * therefore never yields an empty, clean-looking VEX.
 *
 * Per the OpenVEX spec, `justification` and `impact_statement` are only valid
 * on status=not_affected statements — we never emit that status, so neither
 * field appears. Rationale and HNDL exposure prose travel in `status_notes`
 * (legal on any status); the remediation lives in `action_statement`
 * (required for `affected`).
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
  status_notes?: string;
  /** Only valid when status === 'not_affected' (machine-readable enum). */
  justification?: string;
  /** Only valid when status === 'not_affected'. */
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

const REGULATORY_STATUS_NOTE: Record<Finding['regulatoryStatus'], string> = {
  'already-non-compliant': 'Regulatory status: already non-compliant.',
  'disallowed-by-date': 'Regulatory status: disallowed from the stated date.',
  'deprecated-by-date': 'Regulatory status: deprecated from the stated date.',
  advisory: 'Regulatory status: advisory (no binding requirement cited).',
};

function statusNotesFor(f: Finding): string {
  const notes = [
    `Severity: ${f.severity}. ${REGULATORY_STATUS_NOTE[f.regulatoryStatus] ?? ''}${f.deadline ? ` Date: ${f.deadline}.` : ''}`.trim(),
    f.rationale,
  ];
  if (f.hndlExposure) {
    notes.push(
      'Harvest-now-decrypt-later exposure: traffic protected by this asset that is recorded today could be decrypted once the key establishment is broken.',
    );
  }
  return notes.join(' ');
}

function coverageStatements(report: Report, now: string): VexStatement[] {
  return (report.coverage ?? [])
    .filter((c) => c.status !== 'scanned')
    .map((c) => {
      const what =
        c.status === 'skipped'
          ? 'was not scanned'
          : c.status === 'failed'
            ? 'could not be scanned'
            : 'was only partly scanned';
      return {
        '@id': `${QSHIELD_HOMEPAGE}/vex/${report.org.orgId}/coverage/${c.id}`,
        vulnerability: {
          name: `QSHIELD-COVERAGE:${c.id}`,
          description: `Scan coverage: ${c.label} ${what}`,
        },
        timestamp: now,
        products: [
          {
            '@id': `pkg:salesforce/${encodeURIComponent(report.org.orgId)}/scan-category/${encodeURIComponent(c.id)}`,
          },
        ],
        status: 'under_investigation' as const,
        status_notes:
          `${c.label} ${what} (coverage: ${c.status}), so the absence of statements for it does not mean it is unaffected.` +
          (c.detail ? ` Detail: ${c.detail}` : ''),
      };
    });
}

function productIdFor(report: Report, f: Finding): string {
  return `pkg:salesforce/${encodeURIComponent(report.org.orgId)}/${f.asset.kind}/${encodeURIComponent(
    f.asset.identifier,
  )}`;
}

export function buildVexJson(report: Report): string {
  const now = report.generatedAt;
  const statements: VexStatement[] = report.findings.map((f) => ({
    '@id': `${QSHIELD_HOMEPAGE}/vex/${report.org.orgId}/${f.id}`,
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
    status: 'affected',
    status_notes: statusNotesFor(f),
    action_statement: f.recommendedReplacement,
  }));
  statements.push(...coverageStatements(report, now));

  const document: VexDocument = {
    '@context': 'https://openvex.dev/ns/v0.2.0',
    '@id': `${QSHIELD_HOMEPAGE}/vex/${report.org.orgId}/${report.generatedAt}`,
    author: QSHIELD_NAME,
    timestamp: now,
    version: 1,
    tooling: `${QSHIELD_NAME}@${QSHIELD_VERSION}`,
    statements,
  };

  return JSON.stringify(document, null, 2);
}
