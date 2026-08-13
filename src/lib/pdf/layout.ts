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

/**
 * pdf-lib's StandardFonts use WinAnsi (CP1252) encoding and throw on any
 * character outside it (e.g. Turkish "Ş", CJK). Characters beyond Latin-1
 * that WinAnsi does encode (€ Š š Œ œ Ž ž Ÿ ƒ, curly quotes, dashes, …).
 */
const WINANSI_EXTRAS = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ',
);

/**
 * Latin Extended-A characters that do not NFD-decompose to a WinAnsi base
 * letter, mapped to a pragmatic ASCII equivalent.
 */
const WINANSI_SUBSTITUTES: Record<string, string> = {
  'Đ': 'D', // Đ
  'đ': 'd', // đ
  'Ħ': 'H', // Ħ
  'ħ': 'h', // ħ
  'ı': 'i', // ı (dotless i)
  'ĸ': 'k', // ĸ
  'Ł': 'L', // Ł
  'ł': 'l', // ł
  'ŉ': "'n", // ŉ
  'Ŋ': 'N', // Ŋ
  'ŋ': 'n', // ŋ
  'Ŧ': 'T', // Ŧ
  'ŧ': 't', // ŧ
  '\t': ' ',
};

function isWinAnsiChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x0a) return true; // newline — handled by wrapText, never drawn
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_EXTRAS.has(ch);
}

/**
 * Makes text safe for pdf-lib StandardFonts: keeps WinAnsi-encodable
 * characters, maps Latin-extended letters to their closest WinAnsi equivalent
 * (Ş→S, ğ→g, ł→l, …), and replaces anything still unencodable with "?" so
 * rendering never throws on org- or asset-supplied text.
 */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    if (isWinAnsiChar(ch)) {
      out += ch;
      continue;
    }
    const mapped = WINANSI_SUBSTITUTES[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // stray combining mark
    const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (
      decomposed.length > 0 &&
      decomposed !== ch &&
      Array.from(decomposed).every((c) => isWinAnsiChar(c) || WINANSI_SUBSTITUTES[c] !== undefined)
    ) {
      out += Array.from(decomposed, (c) => (isWinAnsiChar(c) ? c : WINANSI_SUBSTITUTES[c])).join('');
      continue;
    }
    out += '?';
  }
  return out;
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
  cursor.page.drawText(toWinAnsi(text), { x, y: cursor.y, size, font, color });
}

export function measureText(
  text: string,
  font: PDFFont,
  size: number,
): number {
  return font.widthOfTextAtSize(toWinAnsi(text), size);
}

export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of toWinAnsi(text).split('\n')) {
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
  cursor.page.drawText(toWinAnsi(text), {
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
  const safeText = toWinAnsi(text);
  const textWidth = measureText(safeText, font, size);
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
  cursor.page.drawText(safeText, {
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
