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
import type { Finding, Report, Severity } from './types.js';

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

  drawHeading(cursor, 'Earliest regulatory deadline', { size: FONT.h3, spaceAfter: 6 });
  const deadline = report.summary.earliestDeadline
    ? report.summary.earliestDeadline
    : 'No binding deadlines from enabled frameworks';
  drawParagraph(cursor, deadline, { size: FONT.body, color: COLORS.inkSoft });
  spacer(cursor, 10);

  if (report.summary.hndlFindings > 0) {
    const msg = `${report.summary.hndlFindings} asset${report.summary.hndlFindings === 1 ? '' : 's'} carry long-confidentiality data and are exposed to Harvest-Now-Decrypt-Later attacks today.`;
    drawPill(cursor, 'HNDL exposure', COLORS.critical, COLORS.white);
    const pillHeight = FONT.small + 6;
    cursor.y -= pillHeight + 8;
    drawParagraph(cursor, msg, { color: COLORS.inkSoft, size: FONT.body });
  }
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

  drawHeading(cursor, 'What we scanned', { size: FONT.h3, spaceAfter: 6 });
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

export function drawFindingsRegister(cursor: Cursor, report: Report): void {
  newPage(cursor);
  drawHeading(cursor, 'Findings register', { size: FONT.h2, spaceAfter: 4 });
  drawParagraph(
    cursor,
    'Sorted by regulatory deadline — earliest first. Each finding traces to at least one primary source document.',
    { size: FONT.small, color: COLORS.muted, spaceAfter: 12 },
  );

  const sorted = [...report.findings].sort((a, b) => {
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

  drawText(cursor, f.title, {
    font: cursor.fonts.bold,
    size: FONT.h3,
    color: COLORS.ink,
    x: innerX,
  });
  cursor.y -= FONT.h3 * 1.3;

  drawText(cursor, `${f.asset.name} — ${f.asset.identifier}`, {
    font: cursor.fonts.regular,
    size: FONT.small,
    color: COLORS.muted,
    x: innerX,
  });
  cursor.y -= FONT.small * 1.5;

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
  h += FONT.h3 * 1.3;
  h += FONT.small * 1.5;
  const kvValues = [f.currentCrypto, f.recommendedReplacement, `${REG_STATUS_LABELS[f.regulatoryStatus]}`, capitalize(f.effort)];
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
    const matched = report.findings.filter((f) =>
      f.citations.some((c) => c.sourceId.toLowerCase().includes(overlay.id)),
    );
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
      });
    }
    spacer(cursor, 10);
  }
}

export function drawMethodology(cursor: Cursor, report: Report): void {
  newPage(cursor);
  drawHeading(cursor, 'Methodology', { size: FONT.h2, spaceAfter: 8 });

  drawHeading(cursor, 'Scan approach', { size: FONT.h3, spaceAfter: 4 });
  drawParagraph(
    cursor,
    'QuantumShield executes entirely in the browser. The customer authenticates to their Salesforce organization via OAuth 2.0 with PKCE; all subsequent API calls travel directly from the browser to the customer instance. No organizational data is transmitted to QuantumShield servers or any third party.',
    { color: COLORS.inkSoft, spaceAfter: 10 },
  );

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
    'Severity is computed deterministically from (regulatory status × data sensitivity × exposure). The rule is open and reproducible; the same inputs always produce the same severity.',
    { color: COLORS.inkSoft, spaceAfter: 10 },
  );

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
      [c.name, c.type, c.algorithm, c.keySize ? String(c.keySize) : '—', c.quantumSafe ? 'Yes' : 'No'],
      false,
      i % 2 === 0,
    );
    i += 1;
  }
}
