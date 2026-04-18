import { PDFDocument, StandardFonts } from 'pdf-lib';
import { COLORS, FONT, PAGE } from './theme.js';
import type { Cursor } from './layout.js';
import {
  drawCbomAppendix,
  drawCoverSection,
  drawExecutiveSummary,
  drawFindingsRegister,
  drawMethodology,
  drawRegulatoryAppendix,
} from './sections.js';
import type { Report } from './types.js';

export async function renderReportPdf(report: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`QuantumShield Report — ${report.org.orgName}`);
  doc.setAuthor('QuantumShield');
  doc.setSubject('Post-Quantum Readiness Report');
  doc.setCreator('QuantumShield (quantumshield.example)');
  doc.setProducer('QuantumShield pdf-lib renderer');
  doc.setCreationDate(new Date(report.generatedAt));
  doc.setModificationDate(new Date(report.generatedAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const firstPage = doc.addPage([PAGE.width, PAGE.height]);
  const pageRefs: Array<ReturnType<typeof doc.addPage>> = [firstPage];

  const cursor: Cursor = {
    doc,
    page: firstPage,
    fonts: { regular, bold, mono },
    x: PAGE.marginX,
    y: PAGE.height - PAGE.marginTop,
    pageIndex: 0,
    totalPages: { value: 1 },
    onNewPage: (page) => {
      pageRefs.push(page);
    },
  };

  drawCoverSection(cursor, report);
  drawExecutiveSummary(cursor, report);
  drawFindingsRegister(cursor, report);
  drawRegulatoryAppendix(cursor, report);
  drawMethodology(cursor, report);
  drawCbomAppendix(cursor, report);

  // Footer pass — now that we know total pages.
  const total = pageRefs.length;
  pageRefs.forEach((page, idx) => {
    const pageNum = idx + 1;
    const footer = `QuantumShield  ·  ${report.org.orgName}  ·  ${report.scanFinishedAt.slice(0, 10)}`;
    page.drawLine({
      start: { x: PAGE.marginX, y: PAGE.marginBottom - 8 },
      end: { x: PAGE.width - PAGE.marginX, y: PAGE.marginBottom - 8 },
      thickness: 0.5,
      color: COLORS.hairline,
    });
    page.drawText(footer, {
      x: PAGE.marginX,
      y: PAGE.marginBottom - 22,
      size: FONT.micro,
      font: regular,
      color: COLORS.muted,
    });
    const pageLabel = `${pageNum} / ${total}`;
    const labelWidth = regular.widthOfTextAtSize(pageLabel, FONT.micro);
    page.drawText(pageLabel, {
      x: PAGE.width - PAGE.marginX - labelWidth,
      y: PAGE.marginBottom - 22,
      size: FONT.micro,
      font: regular,
      color: COLORS.muted,
    });
  });

  return doc.save();
}

export async function renderReportPdfToBlob(report: Report): Promise<Blob> {
  const bytes = await renderReportPdf(report);
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
