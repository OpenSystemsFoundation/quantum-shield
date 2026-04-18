import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import { COLORS, FONT, PAGE } from './theme.js';

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  fonts: Fonts;
  x: number;
  y: number;
  pageIndex: number;
  totalPages: { value: number };
  onNewPage: (page: PDFPage, index: number) => void;
}

export function newPage(cursor: Cursor): PDFPage {
  const page = cursor.doc.addPage([PAGE.width, PAGE.height]);
  cursor.page = page;
  cursor.pageIndex += 1;
  cursor.totalPages.value = cursor.pageIndex + 1;
  cursor.x = PAGE.marginX;
  cursor.y = PAGE.height - PAGE.marginTop;
  cursor.onNewPage(page, cursor.pageIndex);
  return page;
}

export function ensureSpace(cursor: Cursor, needed: number): void {
  if (cursor.y - needed < PAGE.marginBottom) {
    newPage(cursor);
  }
}

export function contentWidth(): number {
  return PAGE.width - PAGE.marginX * 2;
}

export function drawText(
  cursor: Cursor,
  text: string,
  opts: {
    font?: PDFFont;
    size?: number;
    color?: RGB;
    x?: number;
  } = {},
): void {
  const font = opts.font ?? cursor.fonts.regular;
  const size = opts.size ?? FONT.body;
  const color = opts.color ?? COLORS.ink;
  const x = opts.x ?? cursor.x;
  cursor.page.drawText(text, { x, y: cursor.y, size, font, color });
}

export function measureText(
  text: string,
  font: PDFFont,
  size: number,
): number {
  return font.widthOfTextAtSize(text, size);
}

export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      out.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (measureText(candidate, font, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line.length > 0) out.push(line);
        if (measureText(word, font, size) > maxWidth) {
          let buffer = '';
          for (const ch of word) {
            if (measureText(buffer + ch, font, size) > maxWidth) {
              out.push(buffer);
              buffer = ch;
            } else {
              buffer += ch;
            }
          }
          line = buffer;
        } else {
          line = word;
        }
      }
    }
    if (line.length > 0) out.push(line);
  }
  return out;
}

export function drawParagraph(
  cursor: Cursor,
  text: string,
  opts: {
    font?: PDFFont;
    size?: number;
    color?: RGB;
    maxWidth?: number;
    leading?: number;
    x?: number;
    spaceAfter?: number;
  } = {},
): void {
  const font = opts.font ?? cursor.fonts.regular;
  const size = opts.size ?? FONT.body;
  const color = opts.color ?? COLORS.ink;
  const maxWidth = opts.maxWidth ?? contentWidth();
  const leading = opts.leading ?? FONT.leading;
  const x = opts.x ?? cursor.x;
  const lineHeight = size * leading;
  const lines = wrapText(text, font, size, maxWidth);
  for (const line of lines) {
    ensureSpace(cursor, lineHeight);
    cursor.page.drawText(line, { x, y: cursor.y, size, font, color });
    cursor.y -= lineHeight;
  }
  if (opts.spaceAfter) cursor.y -= opts.spaceAfter;
}

export function drawHeading(
  cursor: Cursor,
  text: string,
  opts: { size?: number; color?: RGB; spaceAfter?: number } = {},
): void {
  const size = opts.size ?? FONT.h2;
  const color = opts.color ?? COLORS.ink;
  ensureSpace(cursor, size * 1.4 + (opts.spaceAfter ?? 0));
  cursor.page.drawText(text, {
    x: cursor.x,
    y: cursor.y,
    size,
    font: cursor.fonts.bold,
    color,
  });
  cursor.y -= size * 1.1;
  if (opts.spaceAfter) cursor.y -= opts.spaceAfter;
}

export function drawHairline(cursor: Cursor, color: RGB = COLORS.hairline): void {
  ensureSpace(cursor, 6);
  cursor.page.drawLine({
    start: { x: PAGE.marginX, y: cursor.y },
    end: { x: PAGE.width - PAGE.marginX, y: cursor.y },
    thickness: 0.5,
    color,
  });
  cursor.y -= 6;
}

export function drawRect(
  cursor: Cursor,
  width: number,
  height: number,
  opts: { color?: RGB; borderColor?: RGB; borderWidth?: number; x?: number; y?: number } = {},
): void {
  cursor.page.drawRectangle({
    x: opts.x ?? cursor.x,
    y: (opts.y ?? cursor.y) - height,
    width,
    height,
    color: opts.color,
    borderColor: opts.borderColor,
    borderWidth: opts.borderWidth,
  });
}

export function drawPill(
  cursor: Cursor,
  text: string,
  fill: RGB,
  textColor: RGB = COLORS.white,
  x: number = cursor.x,
  y: number = cursor.y,
): number {
  const size = FONT.small;
  const padX = 6;
  const padY = 3;
  const font = cursor.fonts.bold;
  const textWidth = measureText(text, font, size);
  const width = textWidth + padX * 2;
  const height = size + padY * 2;
  cursor.page.drawRectangle({
    x,
    y: y - height + 2,
    width,
    height,
    color: fill,
    borderColor: fill,
    borderWidth: 0,
  });
  cursor.page.drawText(text, {
    x: x + padX,
    y: y - size + 2,
    size,
    font,
    color: textColor,
  });
  return width;
}

export function spacer(cursor: Cursor, h: number): void {
  cursor.y -= h;
}
