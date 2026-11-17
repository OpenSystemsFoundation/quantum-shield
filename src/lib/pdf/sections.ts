import { COLORS, FONT, PAGE, severityColor, severityLabel } from './theme.js';
import {
  type Cursor,
  contentWidth,
  drawHairline,
  drawHeading,
  drawParagraph,
  drawPill,
  drawRect,
  drawText,
  ensureSpace,
  measureText,
  newPage,
  spacer,
  wrapText,
} from './layout.js';
import type { CoverageStatus, DataTier, Finding, PriorityBand, Report, Severity } from './types.js';

const BAND_LABELS: Record<PriorityBand, string> = { 'act-now': 'Act now', plan: 'Plan', monitor: 'Monitor' };
const TIER_TEXT: Record<DataTier, string> = {
  none: 'no stored data (authenticity only)',
  ephemeral: 'short-lived data',
  internal: 'internal data',
  confidential: 'confidential business data',
  personal: 'personal data',
  regulated: 'long-lived regulated data',
};

function bandColor(band: PriorityBand) {
  return band === 'act-now' ? COLORS.critical : band === 'plan' ? COLORS.medium : COLORS.low;
}

function priorityLine(f: Finding): string {
  const p = f.priority;
  if (!p) return '';
  const margin = p.marginYears > 0 ? `${p.marginYears} yrs exposed` : `${Math.abs(p.marginYears)} yrs slack`;
  return `${p.shelfLifeYears} yrs secrecy + ${p.migrationYears} yrs to fix vs ${p.yearsToQuantum} yrs to quantum = ${margin}. ${p.reason} Data at stake: ${TIER_TEXT[p.dataTier]}. ${p.dataBasis}.`;
}

/** Plain-words statement of the assumptions behind the priorities. */
export function assumptionsSentence(report: Report): string | null {
  const a = report.riskAssumptions;
  if (!a) return null;
  const s = a.shelfLifeYears;
  const m = a.migrationYears;
  return `Assumes a quantum computer able to break today's public-key cryptography by ${a.quantumYear}. Data must stay secret for ${s.regulated} years (long-lived regulated), ${s.personal} (personal), ${s.confidential} (confidential business), ${s.internal} (internal), ${s.ephemeral} (short-lived). Fixes take ${m.low} / ${m.medium} / ${m.high} years for low / medium / high effort.`;
}

const CATEGORY_LABELS: Record<string, string> = {
  certificates: 'Certificates & keys',
  'connected-apps': 'Connected Apps',
  'named-credentials': 'Named & External Credentials',
  'remote-sites': 'Remote Sites & External Data',
  sso: 'Single Sign-On',
  'shield-encryption': 'Shield Platform Encryption',
  'apex-crypto': 'Apex cryptographic calls',
  'session-login': 'Session & login settings',
  packages: 'Managed packages',
};

const POSTURE_LABELS: Record<string, string> = {
  'replace-now': 'Replace now',
  'plan-2030': 'Plan for 2030',
  'prepare-2033': 'Prepare for 2033',
  advisory: 'Advisory',
};

const REG_STATUS_LABELS: Record<string, string> = {
  'already-non-compliant': 'Already non-compliant',
  'deprecated-by-date': 'Deprecated by date',
  'disallowed-by-date': 'Disallowed by date',
  advisory: 'Advisory',
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function drawCoverSection(cursor: Cursor, report: Report): void {
  cursor.y = PAGE.height - PAGE.marginTop - 40;

  drawText(cursor, 'QuantumShield', {
    font: cursor.fonts.bold,
    size: 14,
    color: COLORS.accent,
  });
  cursor.y -= 26;

  drawText(cursor, 'Post-Quantum Readiness Report', {
    font: cursor.fonts.bold,
    size: FONT.h1,
    color: COLORS.ink,
  });
  cursor.y -= 36;

  drawParagraph(
    cursor,
    report.summary.postureSentence,
    { size: FONT.lead, color: COLORS.inkSoft, spaceAfter: 20, leading: 1.45 },
  );

  const w = contentWidth();
  const boxTop = cursor.y;
  const columns = 3;
  const gap = 12;
  const paddingX = 18;
  const paddingTop = 24;
  const paddingBottom = 18;
  const labelGap = 16;
  const valueLineHeight = FONT.h3 * 1.2;
  const rowGap = 10;
  const cellWidth = (w - paddingX * 2 - gap * (columns - 1)) / columns;

  const pairs: Array<[string, string]> = [
    ['Organization', report.org.orgName],
    ['Instance', report.org.instanceUrl.replace(/^https?:\/\//, '')],
    ['Org type', report.org.orgType],
    ['API version', report.org.apiVersion],
    ['Scan finished', report.scanFinishedAt.slice(0, 10)],
    ['Findings', String(report.summary.totalFindings)],
  ];

  const cells = pairs.map(([label, value]) => ({
    label,
    lines: wrapText(value, cursor.fonts.bold, FONT.h3, cellWidth),
  }));
  const rows = chunk(cells, columns);
  const rowHeights = rows.map((row) => {
    const lineCount = Math.max(...row.map((cell) => Math.max(cell.lines.length, 1)));
    return labelGap + lineCount * valueLineHeight + 6;
  });
  const boxHeight = paddingTop + paddingBottom + rowHeights.reduce((sum, height) => sum + height, 0) + rowGap * Math.max(rows.length - 1, 0);

  drawRect(cursor, w, boxHeight, {
    color: COLORS.panel,
    borderColor: COLORS.hairline,
    borderWidth: 0.5,
  });

  let rowTop = boxTop - paddingTop;
  rows.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      const x = PAGE.marginX + paddingX + colIdx * (cellWidth + gap);
      cursor.page.drawText(cell.label.toUpperCase(), {
        x,
        y: rowTop,
        size: FONT.micro,
        font: cursor.fonts.bold,
        color: COLORS.muted,
      });

      cell.lines.forEach((line, lineIdx) => {
        cursor.page.drawText(line, {
          x,
          y: rowTop - labelGap - lineIdx * valueLineHeight,
          size: FONT.h3,
          font: cursor.fonts.bold,
          color: COLORS.ink,
        });
      });
    });
    rowTop -= rowHeights[rowIdx] + rowGap;
  });

  cursor.y = boxTop - boxHeight - 24;

  drawHeading(cursor, 'Findings by severity', { size: FONT.h3, spaceAfter: 8 });
  drawSeverityBar(cursor, report);
  spacer(cursor, 16);

  drawHeading(cursor, 'Deadlines', { size: FONT.h3, spaceAfter: 6 });
  for (const line of deadlineSummaryLines(report)) {
    drawParagraph(cursor, line, { size: FONT.body, color: COLORS.inkSoft });
  }
  spacer(cursor, 10);

  const pc = report.summary.priorityCounts;
  if (pc) {
    drawHeading(cursor, 'Priority', { size: FONT.h3, spaceAfter: 6 });
    drawParagraph(
      cursor,
      `Act now: ${pc['act-now']}   ·   Plan: ${pc.plan}   ·   Monitor: ${pc.monitor}. Ranked by how long the data at stake must stay secret plus how long the fix takes, against the year a quantum computer could break it.`,
      { size: FONT.body, color: COLORS.inkSoft, spaceAfter: 10 },
    );
  }

  if (report.summary.hndlFindings > 0) {
    const n = report.summary.hndlFindings;
    const msg = `${n} finding${n === 1 ? '' : 's'} ${n === 1 ? 'concerns' : 'concern'} key establishment or encryption that a quantum computer could break. Traffic recorded today could be decrypted later (harvest now, decrypt later); how much that matters depends on how long the data must stay confidential.`;
    drawPill(cursor, 'HNDL exposure', COLORS.critical, COLORS.white);
    const pillHeight = FONT.small + 6;
    cursor.y -= pillHeight + 8;
    drawParagraph(cursor, msg, { color: COLORS.inkSoft, size: FONT.body });
  }
}

/**
 * Plain statements about finding deadlines. A date in the past is not an
 * upcoming deadline — "SHA-1 signatures disallowed since 2013" or an expired
 * certificate is overdue — so the two are reported separately instead of
 * printing the oldest date under an "earliest deadline" heading.
 */
export function deadlineSummaryLines(report: Report): string[] {
  const today = (report.scanStartedAt || report.generatedAt).slice(0, 10);
  const dated = report.findings
    .map((f) => f.deadline?.slice(0, 10))
    .filter((d): d is string => Boolean(d) && /^\d{4}-\d{2}-\d{2}$/.test(d as string));
  const overdue = dated.filter((d) => d < today).sort();
  const upcoming = dated.filter((d) => d >= today).sort();
  const lines: string[] = [];
  if (overdue.length > 0) {
    lines.push(
      `Already past: ${overdue.length} finding${overdue.length === 1 ? '' : 's'} with a date that has passed (oldest ${overdue[0]}). These need action now.`,
    );
  }
  if (upcoming.length > 0) {
    const first = upcoming[0];
    const atFirst = upcoming.filter((d) => d === first).length;
    lines.push(
      `Next upcoming: ${first} (${atFirst} finding${atFirst === 1 ? '' : 's'}). Dates come from the cited sources or, for certificates, from the certificate's own expiry.`,
    );
  }
  if (lines.length === 0) lines.push('No finding in this report carries a dated deadline.');
  return lines;
}

function drawSeverityBar(cursor: Cursor, report: Report): void {
  const total = Math.max(report.summary.totalFindings, 1);
  const order: Severity[] = ['critical', 'high', 'medium', 'low'];
  const w = contentWidth();
  const barHeight = 14;
  const barY = cursor.y;
  let xOffset = PAGE.marginX;

  for (const sev of order) {
    const count = report.summary.bySeverity[sev] ?? 0;
    if (count === 0) continue;
    const segW = Math.max((count / total) * w, 8);
    cursor.page.drawRectangle({
      x: xOffset,
      y: barY - barHeight,
      width: segW,
      height: barHeight,
      color: severityColor(sev),
    });
    xOffset += segW;
  }
  cursor.y -= barHeight + 8;

  let legendX = PAGE.marginX;
  for (const sev of order) {
    const count = report.summary.bySeverity[sev] ?? 0;
    if (count === 0) continue;
    cursor.page.drawRectangle({
      x: legendX,
      y: cursor.y - 8,
      width: 8,
      height: 8,
      color: severityColor(sev),
    });
    const label = `${severityLabel(sev)}  ${count}`;
    cursor.page.drawText(label, {
      x: legendX + 12,
      y: cursor.y - 7,
      size: FONT.small,
      font: cursor.fonts.regular,
      color: COLORS.inkSoft,
    });
    legendX += measureText(label, cursor.fonts.regular, FONT.small) + 28;
  }
  cursor.y -= 10;
}

export function drawExecutiveSummary(cursor: Cursor, report: Report): void {
  newPage(cursor);
  drawHeading(cursor, 'Executive summary', { size: FONT.h2, spaceAfter: 10 });

  drawParagraph(
    cursor,
    `This report inventories cryptographic assets discovered in the Salesforce organization "${report.org.orgName}" and evaluates each against the post-quantum transition timelines published by ENISA, BSI, NCSC-NL, and the NIST PQC standards (FIPS 203/204/205).`,
    { spaceAfter: 10, color: COLORS.inkSoft },
  );

  drawParagraph(cursor, report.summary.postureSentence, {
    size: FONT.lead,
    color: COLORS.ink,
    spaceAfter: 14,
    leading: 1.45,
  });

  if (report.summary.priorityCounts) {
    drawHeading(cursor, 'Where to start', { size: FONT.h3, spaceAfter: 6 });
    const top = [...report.findings]
      .filter((f) => f.priority)
      .sort((a, b) => (a.priority?.rank ?? 0) - (b.priority?.rank ?? 0))
      .slice(0, 5);
    for (const f of top) {
      const p = f.priority!;
      drawParagraph(cursor, `${p.rank}. [${BAND_LABELS[p.band]}] ${f.title} — ${f.asset.name}. ${p.reason}`, {
        x: PAGE.marginX + 6,
        color: COLORS.inkSoft,
        size: FONT.small,
        leading: 1.4,
      });
    }
    const assumptions = assumptionsSentence(report);
    if (assumptions) {
      drawParagraph(cursor, assumptions, { size: FONT.small, color: COLORS.muted, spaceAfter: 4, leading: 1.4 });
    }
    const dp = report.dataProfile;
    if (dp) {
      const bySource = (src: string) => dp.entries.filter((e) => e.sources.includes(src as never)).length;
      drawParagraph(
        cursor,
        `Data sensitivity: ${dp.entries.filter((e) => e.sources.includes('classification') || e.sources.includes('compliance')).length} classified fields, ${bySource('shield')} Shield-encrypted fields and ${bySource('default')} standard objects with best-practice defaults. The most sensitive data found is ${TIER_TEXT[dp.orgTier]}; integrations are assumed to carry it unless the reader said otherwise. ${dp.note ?? ''}`,
        { size: FONT.small, color: COLORS.muted, spaceAfter: 12, leading: 1.4 },
      );
    }
  }

  drawHeading(cursor, 'What we scanned', { size: FONT.h3, spaceAfter: 6 });
  drawCoverageList(cursor, report);
  spacer(cursor, 12);

  drawHeading(cursor, 'Posture overview', { size: FONT.h3, spaceAfter: 6 });
  const postureCounts: Record<string, number> = {};
  for (const f of report.findings) {
    postureCounts[f.migrationPosture] = (postureCounts[f.migrationPosture] ?? 0) + 1;
  }
  for (const [key, label] of Object.entries(POSTURE_LABELS)) {
    const count = postureCounts[key] ?? 0;
    if (count === 0) continue;
    drawParagraph(cursor, `• ${label} — ${count}`, {
      x: PAGE.marginX + 6,
      color: COLORS.inkSoft,
    });
  }
  spacer(cursor, 8);

  drawHeading(cursor, 'Enabled regulatory overlays', { size: FONT.h3, spaceAfter: 6 });
  const enabled = report.overlays.filter((o) => o.enabled);
  if (enabled.length === 0) {
    drawParagraph(cursor, 'No vertical overlays enabled.', {
      x: PAGE.marginX + 6,
      color: COLORS.muted,
    });
  } else {
    for (const o of enabled) {
      drawParagraph(cursor, `• ${o.label}`, {
        x: PAGE.marginX + 6,
        color: COLORS.inkSoft,
      });
    }
  }
}

const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  scanned: 'Scanned',
  partial: 'PARTIAL',
  failed: 'FAILED',
  skipped: 'SKIPPED',
};

function coverageStatusColor(status: CoverageStatus) {
  switch (status) {
    case 'failed':
      return COLORS.critical;
    case 'partial':
      return COLORS.high;
    case 'skipped':
      return COLORS.medium;
    default:
      return COLORS.inkSoft;
  }
}

function drawCoverageList(cursor: Cursor, report: Report): void {
  const coverage = report.coverage ?? [];
  if (coverage.length === 0) {
    // Legacy reports without coverage data: fall back to finding counts.
    const cats = (Object.keys(report.summary.byCategory) as Array<keyof typeof report.summary.byCategory>).filter(
      (c) => (report.summary.byCategory[c] ?? 0) > 0,
    );
    for (const c of cats) {
      const count = report.summary.byCategory[c];
      drawParagraph(cursor, `• ${CATEGORY_LABELS[c] ?? c} — ${count} finding${count === 1 ? '' : 's'}`, {
        x: PAGE.marginX + 6,
        color: COLORS.inkSoft,
      });
    }
    return;
  }

  const indent = 6;
  const detailIndent = 18;
  for (const cov of coverage) {
    const counts = `${cov.assetCount} asset${cov.assetCount === 1 ? '' : 's'}, ${cov.findingCount} finding${cov.findingCount === 1 ? '' : 's'}`;
    if (cov.status === 'scanned') {
      drawParagraph(cursor, `• ${cov.label} — ${counts}`, {
        x: PAGE.marginX + indent,
        maxWidth: contentWidth() - indent,
        color: COLORS.inkSoft,
      });
      continue;
    }
    drawParagraph(
      cursor,
      `• ${cov.label} — ${COVERAGE_STATUS_LABELS[cov.status]} — ${counts}`,
      {
        x: PAGE.marginX + indent,
        maxWidth: contentWidth() - indent,
        color: coverageStatusColor(cov.status),
        font: cursor.fonts.bold,
      },
    );
    if (cov.detail) {
      drawParagraph(cursor, cov.detail, {
        x: PAGE.marginX + detailIndent,
        maxWidth: contentWidth() - detailIndent,
        size: FONT.small,
        color: COLORS.muted,
      });
    }
  }

  const unverified = coverage.filter((c) => c.status !== 'scanned' && c.id !== 'data-profile');
  if (unverified.length > 0) {
    spacer(cursor, 8);
    drawCoverageWarning(
      cursor,
      `${unverified.length} categor${unverified.length === 1 ? 'y was' : 'ies were'} not fully verified. Zero findings in a category marked FAILED, PARTIAL, or SKIPPED does not mean it is clean — it means the category was not (fully) scanned.`,
    );
  }
}

function drawCoverageWarning(cursor: Cursor, note: string): void {
  const noteFont = cursor.fonts.bold;
  const noteSize = FONT.small;
  const pad = 10;
  const lineHeight = noteSize * 1.4;
  const lines = wrapText(note, noteFont, noteSize, contentWidth() - pad * 2);
  const boxHeight = pad * 2 + lines.length * lineHeight;
  ensureSpace(cursor, boxHeight + 8);
  drawRect(cursor, contentWidth(), boxHeight, {
    x: PAGE.marginX,
    color: COLORS.accentSoft,
    borderColor: COLORS.accent,
    borderWidth: 0.75,
  });
  let lineY = cursor.y - pad - noteSize;
  for (const line of lines) {
    cursor.page.drawText(line, {
      x: PAGE.marginX + pad,
      y: lineY,
      size: noteSize,
      font: noteFont,
      color: COLORS.critical,
    });
    lineY -= lineHeight;
  }
  cursor.y -= boxHeight + 8;
}

export function drawFindingsRegister(cursor: Cursor, report: Report): void {
  newPage(cursor);
  drawHeading(cursor, 'Findings register', { size: FONT.h2, spaceAfter: 4 });
  const ranked = report.findings.every((f) => f.priority);
  drawParagraph(
    cursor,
    ranked
      ? 'Sorted by priority — most urgent first. Each finding traces to at least one primary source document.'
      : 'Sorted by regulatory deadline — earliest first. Each finding traces to at least one primary source document.',
    { size: FONT.small, color: COLORS.muted, spaceAfter: 12 },
  );

  const sorted = [...report.findings].sort((a, b) => {
    if (ranked) return (a.priority?.rank ?? 0) - (b.priority?.rank ?? 0);
    const da = a.deadline ?? '9999';
    const db = b.deadline ?? '9999';
    if (da !== db) return da.localeCompare(db);
    const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return sevRank[a.severity] - sevRank[b.severity];
  });

  for (const finding of sorted) {
    drawFindingCard(cursor, finding);
  }
}

function drawFindingCard(cursor: Cursor, f: Finding): void {
  const cardWidth = contentWidth();

  const measured = measureFindingHeight(cursor, f, cardWidth);
  ensureSpace(cursor, measured + 8);

  const cardTop = cursor.y;
  const accentWidth = 3;
  cursor.page.drawRectangle({
    x: PAGE.marginX,
    y: cardTop - measured,
    width: accentWidth,
    height: measured,
    color: severityColor(f.severity),
  });

  const innerX = PAGE.marginX + accentWidth + 10;
  const innerWidth = cardWidth - accentWidth - 10;

  cursor.x = innerX;
  cursor.y = cardTop - 4;

  const pillY = cursor.y;
  let pillX = innerX;
  if (f.priority) {
    pillX += drawPill(cursor, `#${f.priority.rank} ${BAND_LABELS[f.priority.band]}`, bandColor(f.priority.band), COLORS.white, pillX, pillY) + 6;
  }
  pillX += drawPill(cursor, severityLabel(f.severity), severityColor(f.severity), COLORS.white, pillX, pillY) + 6;
  pillX +=
    drawPill(
      cursor,
      POSTURE_LABELS[f.migrationPosture],
      COLORS.ink,
      COLORS.white,
      pillX,
      pillY,
    ) + 6;
  if (f.hndlExposure) {
    drawPill(cursor, 'HNDL', COLORS.accent, COLORS.white, pillX, pillY);
  }
  cursor.y -= 30;

  for (const line of wrapText(f.title, cursor.fonts.bold, FONT.h3, innerWidth)) {
    drawText(cursor, line, {
      font: cursor.fonts.bold,
      size: FONT.h3,
      color: COLORS.ink,
      x: innerX,
    });
    cursor.y -= FONT.h3 * 1.3;
  }

  for (const line of wrapText(`${f.asset.name} — ${f.asset.identifier}`, cursor.fonts.regular, FONT.small, innerWidth)) {
    drawText(cursor, line, {
      font: cursor.fonts.regular,
      size: FONT.small,
      color: COLORS.muted,
      x: innerX,
    });
    cursor.y -= FONT.small * 1.5;
  }

  drawKeyValue(cursor, innerX, innerWidth, 'Current', f.currentCrypto);
  drawKeyValue(cursor, innerX, innerWidth, 'Replace with', f.recommendedReplacement);
  drawKeyValue(
    cursor,
    innerX,
    innerWidth,
    'Status',
    `${REG_STATUS_LABELS[f.regulatoryStatus]}${f.deadline ? ` • ${f.deadline}` : ''}`,
  );
  drawKeyValue(cursor, innerX, innerWidth, 'Effort', capitalize(f.effort));
  if (f.priority) drawKeyValue(cursor, innerX, innerWidth, 'Priority', priorityLine(f));

  cursor.x = innerX;
  drawParagraph(cursor, f.rationale, {
    size: FONT.small,
    color: COLORS.inkSoft,
    maxWidth: innerWidth,
    leading: 1.4,
    x: innerX,
    spaceAfter: 4,
  });

  drawText(cursor, 'Sources', {
    font: cursor.fonts.bold,
    size: FONT.micro,
    color: COLORS.muted,
    x: innerX,
  });
  cursor.y -= FONT.micro * 1.6;
  for (const c of f.citations) {
    const txt = `• ${c.sourceId} — ${c.title}${c.section ? `, ${c.section}` : ''} (${c.jurisdiction}, v${c.documentVersion})`;
    drawParagraph(cursor, txt, {
      size: FONT.micro,
      color: COLORS.inkSoft,
      x: innerX + 4,
      maxWidth: innerWidth - 4,
      leading: 1.4,
    });
  }

  cursor.y -= 6;
  cursor.x = PAGE.marginX;
  drawHairline(cursor, COLORS.hairline);
}

function drawKeyValue(cursor: Cursor, x: number, totalWidth: number, key: string, value: string): void {
  const labelWidth = 72;
  cursor.page.drawText(key.toUpperCase(), {
    x,
    y: cursor.y,
    size: FONT.micro,
    font: cursor.fonts.bold,
    color: COLORS.muted,
  });
  const lines = wrapText(value, cursor.fonts.regular, FONT.small, totalWidth - labelWidth);
  let lineY = cursor.y;
  for (const line of lines) {
    cursor.page.drawText(line, {
      x: x + labelWidth,
      y: lineY,
      size: FONT.small,
      font: cursor.fonts.regular,
      color: COLORS.ink,
    });
    lineY -= FONT.small * 1.35;
  }
  cursor.y = Math.min(cursor.y, lineY) - 2;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function measureFindingHeight(cursor: Cursor, f: Finding, cardWidth: number): number {
  const innerWidth = cardWidth - 13;
  const labelWidth = 72;
  let h = 4 + 30; // top padding + pills (with bottom spacing)
  h += wrapText(f.title, cursor.fonts.bold, FONT.h3, innerWidth).length * FONT.h3 * 1.3;
  h += wrapText(`${f.asset.name} — ${f.asset.identifier}`, cursor.fonts.regular, FONT.small, innerWidth).length * FONT.small * 1.5;
  const kvValues = [f.currentCrypto, f.recommendedReplacement, `${REG_STATUS_LABELS[f.regulatoryStatus]}`, capitalize(f.effort)];
  if (f.priority) kvValues.push(priorityLine(f));
  for (const v of kvValues) {
    const lines = wrapText(v, cursor.fonts.regular, FONT.small, innerWidth - labelWidth);
    h += Math.max(lines.length, 1) * FONT.small * 1.35 + 2;
  }
  const rLines = wrapText(f.rationale, cursor.fonts.regular, FONT.small, innerWidth);
  h += rLines.length * FONT.small * 1.4 + 4;
  h += FONT.micro * 1.6;
  for (const c of f.citations) {
    const txt = `• ${c.sourceId} — ${c.title}${c.section ? `, ${c.section}` : ''} (${c.jurisdiction}, v${c.documentVersion})`;
    const lines = wrapText(txt, cursor.fonts.regular, FONT.micro, innerWidth - 4);
    h += lines.length * FONT.micro * 1.4;
  }
  h += 12;
  return h;
}

export function drawRegulatoryAppendix(cursor: Cursor, report: Report): void {
  const enabled = report.overlays.filter((o) => o.enabled);
  if (enabled.length === 0) return;

  newPage(cursor);
  drawHeading(cursor, 'Regulatory appendix', { size: FONT.h2, spaceAfter: 6 });
  drawParagraph(
    cursor,
    'Findings mapped to each enabled regulatory overlay. A finding may map to multiple requirements.',
    { size: FONT.small, color: COLORS.muted, spaceAfter: 14 },
  );

  for (const overlay of enabled) {
    drawHeading(cursor, overlay.label, { size: FONT.h3, spaceAfter: 6 });
    const matched = report.findings.filter((f) => f.overlayIds?.includes(overlay.id));
    if (matched.length === 0) {
      drawParagraph(cursor, 'No findings mapped to this overlay.', {
        color: COLORS.muted,
        size: FONT.small,
        spaceAfter: 10,
      });
      continue;
    }
    for (const f of matched) {
      drawParagraph(cursor, `• ${f.title} — ${f.asset.name}`, {
        color: COLORS.inkSoft,
        size: FONT.small,
        x: PAGE.marginX + 6,
        maxWidth: contentWidth() - 6,
      });
    }
    spacer(cursor, 10);
  }
}

export function drawMethodology(cursor: Cursor, report: Report): void {
  newPage(cursor);
  drawHeading(cursor, 'Methodology', { size: FONT.h2, spaceAfter: 8 });

  drawHeading(cursor, 'Scan approach', { size: FONT.h3, spaceAfter: 4 });
  const gen = report.generator;
  const approach =
    gen.mode === 'cli'
      ? `This report was generated by ${gen.name} v${gen.version} running as the qshield command-line tool on the operator's machine, reusing the operator's locally authenticated Salesforce CLI (sf) session. All API calls travel directly from that machine to the customer's Salesforce instance. No organizational data is transmitted to ${gen.name} servers or any third party.`
      : `This report was generated by ${gen.name} v${gen.version} executing entirely in the browser. The customer authenticates to their Salesforce organization via the OAuth 2.0 authorization-code flow with PKCE; all subsequent API calls travel directly from the browser to the customer's Salesforce instance. No organizational data is transmitted to ${gen.name} servers or any third party.`;
  drawParagraph(cursor, approach, { color: COLORS.inkSoft, spaceAfter: 10 });

  drawHeading(cursor, 'Scope', { size: FONT.h3, spaceAfter: 4 });
  drawParagraph(
    cursor,
    'Read-only scans of metadata and configuration only: certificates, Connected Apps, Named & External Credentials, Remote Site Settings, SSO configurations, Shield Platform Encryption policy, Apex cryptographic call sites, session and login settings, and installed managed packages.',
    { color: COLORS.inkSoft, spaceAfter: 8 },
  );
  drawParagraph(
    cursor,
    'Out of scope: record data, field values, attachment bodies, Salesforce-managed TLS termination, third-party infrastructure, and any cryptography the customer cannot directly control.',
    { color: COLORS.inkSoft, spaceAfter: 10 },
  );

  drawHeading(cursor, 'Severity derivation', { size: FONT.h3, spaceAfter: 4 });
  drawParagraph(
    cursor,
    'Severity is fixed by the rule case that matched, as written in the open rule catalog; it is not computed from the org\'s data. The same asset always gets the same severity. Priority (below) adds the org\'s data context.',
    { color: COLORS.inkSoft, spaceAfter: 10 },
  );

  drawHeading(cursor, 'Priority', { size: FONT.h3, spaceAfter: 4 });
  drawParagraph(
    cursor,
    'An adversary can record encrypted traffic today and decrypt it once a quantum computer breaks the key exchange that protected it (harvest now, decrypt later). Data is therefore already at risk when the years it must stay secret, plus the years the migration takes, add up to more than the years left until such a computer exists. Each finding is scored that way: its shelf life comes from the most sensitive data the asset touches (field classification, compliance categories and Shield-encrypted fields read from the org, or best-practice defaults for standard objects); its migration time comes from the finding\'s effort. A positive margin is Act now, a margin within three years is Plan, the rest is Monitor. Signatures and digests cannot be harvested, so only migration time counts for them. Anything weak or non-compliant today is Act now regardless. Field classification is read from metadata only, never from record data, and only for fields visible to the scanning user.',
    { color: COLORS.inkSoft, spaceAfter: 6 },
  );
  const assumptions = assumptionsSentence(report);
  if (assumptions) drawParagraph(cursor, assumptions, { color: COLORS.inkSoft, spaceAfter: 10 });

  drawHeading(cursor, 'Source document versions', { size: FONT.h3, spaceAfter: 4 });
  for (const sv of report.sourceVersions) {
    drawParagraph(cursor, `• ${sv.sourceId} — v${sv.documentVersion} (retrieved ${sv.retrievedAt})`, {
      color: COLORS.inkSoft,
      size: FONT.small,
      x: PAGE.marginX + 6,
    });
  }
}

export function drawCbomAppendix(cursor: Cursor, report: Report): void {
  if (report.cbom.length === 0) return;
  newPage(cursor);
  drawHeading(cursor, 'Cryptographic Bill of Materials', { size: FONT.h2, spaceAfter: 4 });
  drawParagraph(
    cursor,
    'Machine-readable inventory of every cryptographic asset discovered. The JSON export follows CycloneDX CBOM conventions and can be ingested by GRC tooling.',
    { size: FONT.small, color: COLORS.muted, spaceAfter: 12 },
  );

  const headers = ['Asset', 'Type', 'Algorithm', 'Key', 'PQ-safe'];
  const colWidths = [150, 70, 170, 42, 55];
  const lineHeight = FONT.small * 1.25;
  const minRowHeight = 18;
  const startX = PAGE.marginX;

  const drawRow = (values: string[], bold: boolean, zebra: boolean) => {
    const font = bold ? cursor.fonts.bold : cursor.fonts.regular;
    const cellLines = values.map((value, idx) =>
      wrapText(value, font, FONT.small, colWidths[idx] - 6),
    );
    const maxLines = Math.max(...cellLines.map((lines) => Math.max(lines.length, 1)));
    const rowHeight = Math.max(minRowHeight, maxLines * lineHeight + 8);

    ensureSpace(cursor, rowHeight + 2);
    if (zebra) {
      cursor.page.drawRectangle({
        x: startX,
        y: cursor.y - rowHeight + 4,
        width: contentWidth(),
        height: rowHeight,
        color: COLORS.panel,
      });
    }
    let x = startX + 4;
    for (let i = 0; i < values.length; i += 1) {
      const lines = cellLines[i];
      lines.forEach((line, lineIdx) => {
        cursor.page.drawText(line, {
          x,
          y: cursor.y - 8 - lineIdx * lineHeight,
          size: FONT.small,
          font,
          color: bold ? COLORS.muted : COLORS.ink,
        });
      });
      x += colWidths[i];
    }
    cursor.y -= rowHeight;
  };

  drawRow(headers, true, false);
  let i = 0;
  for (const c of report.cbom) {
    drawRow(
      [c.name, c.type, c.algorithm, c.keySize ? String(c.keySize) : '—', c.quantumSafe === null || c.quantumSafe === undefined ? 'Unknown' : c.quantumSafe ? 'Yes' : 'No'],
      false,
      i % 2 === 0,
    );
    i += 1;
  }
}
