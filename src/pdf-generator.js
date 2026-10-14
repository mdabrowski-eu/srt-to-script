/**
 * PDF generator — voice actor script via jsPDF with embedded Courier Prime
 * (typewriter look, full Polish glyph support through TTF embedding).
 * Layout mirrors the DOCX: header from form between drawn rules, timestamp
 * left, name centered, dialogue indented; NOTES/CHARACTERS footer left-aligned.
 *
 * Font metrics are measured at runtime (doc.getTextWidth) and the requested
 * size is compensated by the measured render factor, so wrap widths and
 * centering always match the actual glyph advance — no margin bleed.
 */
import { jsPDF } from 'jspdf';
import {
  CourierPrime_Regular,
  CourierPrime_Bold,
  CourierPrime_Italic,
  CourierPrime_BoldItalic,
} from './fonts.js';
import { splitHeaderLines, wrapText } from './parser.js';

const PT_PER_IN = 72;
const PAGE_W = 8.5 * PT_PER_IN;   // 612pt US Letter
const PAGE_H = 11 * PT_PER_IN;    // 792pt
const MARGIN = 0.75 * PT_PER_IN;  // 54pt
const TEXT_W = PAGE_W - 2 * MARGIN;
const FONT_SIZE = 12;             // intended physical glyph size
const MONO_EM = 0.6;              // Courier advance width factor (0.6em)
const LINE_LEAD = 1.45;

/** One physical Courier char at FONT_SIZE: 0.6 * 12pt = 7.2pt. */
const CHAR_W = FONT_SIZE * MONO_EM;
const DIALOGUE_INDENT_CHARS = 5;  // 0.5" — same as DOCX 720 twips
const FULL_COLS = Math.floor(TEXT_W / CHAR_W); // ≈70 chars per line

/**
 * Register the embedded Courier Prime faces on every document instance.
 * (No module-level "done once" flag: each jsPDF document has its own VFS, and
 * skipping registration on later docs silently falls back to WinAnsi
 * standard-14 fonts, which cannot render Polish glyphs.)
 */
function registerFonts(doc) {
  doc.addFileToVFS('CourierPrime-Regular.ttf', CourierPrime_Regular);
  doc.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal');
  doc.addFileToVFS('CourierPrime-Bold.ttf', CourierPrime_Bold);
  doc.addFont('CourierPrime-Bold.ttf', 'CourierPrime', 'bold');
  doc.addFileToVFS('CourierPrime-Italic.ttf', CourierPrime_Italic);
  doc.addFont('CourierPrime-Italic.ttf', 'CourierPrime', 'italic');
  doc.addFileToVFS('CourierPrime-BoldItalic.ttf', CourierPrime_BoldItalic);
  doc.addFont('CourierPrime-BoldItalic.ttf', 'CourierPrime', 'bolditalic');
}

/**
 * Measure jsPDF's actual glyph advance for the registered monospace font at
 * the requested size, then compensate: if jsPDF renders glyphs scaled by a
 * factor r (e.g. 4/3 in some v4 configurations), we ask for size/r so the
 * PHYSICAL glyph size and advance match our 7.2pt/char layout math.
 */
function calibrateMonospace(doc) {
  doc.setFont('CourierPrime', 'normal');
  doc.setFontSize(FONT_SIZE);
  const measured = doc.getTextWidth('M') || FONT_SIZE * MONO_EM;
  const factor = measured / (FONT_SIZE * MONO_EM);
  if (Math.abs(factor - 1) > 0.01) {
    doc.setFontSize(FONT_SIZE / factor);
    // re-verify the advance now matches the physical target
    const verify = doc.getTextWidth('M');
    if (Math.abs(verify - CHAR_W) > CHAR_W * 0.02) {
      // fall back to trusting the measured advance as-is
      return verify;
    }
  }
  return CHAR_W;
}

/**
 * Build the PDF (US Letter). Returns the jsPDF instance (.output('blob') etc.).
 */
export function buildPdfDoc({ header = {}, parsed }) {
  const { headerText = '', notes = '' } = header;
  const { blocks, characters } = parsed;

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  registerFonts(doc);

  const charW = calibrateMonospace(doc);       // physical pt per char
  const lineH = FONT_SIZE * LINE_LEAD;         // physical leading (17.4pt)
  const fullCols = Math.max(10, Math.floor(TEXT_W / charW)); // ≈70
  const bodyCols = fullCols - DIALOGUE_INDENT_CHARS;          // wrapped depth

  let y = MARGIN + FONT_SIZE; // baseline of the first line

  const setFont = (style) => doc.setFont('CourierPrime', style);

  /** Write one text line at x; page-breaks when below the bottom margin. */
  const line = (text, x, style = 'normal') => {
    if (!text) text = '';
    setFont(style);
    if (y > PAGE_H - MARGIN - FONT_SIZE) {
      doc.addPage();
      y = MARGIN + FONT_SIZE;
    }
    doc.text(text, x, y);
    y += lineH;
  };

  const blankLine = () => {
    y += lineH;
  };

  /** Center-x for a chunk of `len` chars within the full text column. */
  const centerX = (len, style = 'normal') => {
    void style;
    const pad = Math.max(0, Math.floor((fullCols - len) / 2));
    return MARGIN + pad * charW;
  };

  /** Draw a horizontal rule across the text column (vector line). */
  const divider = () => {
    if (y > PAGE_H - MARGIN - FONT_SIZE) {
      doc.addPage();
      y = MARGIN + FONT_SIZE;
    }
    doc.setDrawColor(28, 26, 23);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y - (lineH - FONT_SIZE) / 2, PAGE_W - MARGIN, y - (lineH - FONT_SIZE) / 2);
    y += lineH;
  };

  /** Word-wrap comes from parser.js (shared with the live preview). */

  // ---- header (from form) — centered, between drawn rules ----
  const headerLines = splitHeaderLines(headerText);
  if (headerLines.length > 0) {
    divider();
    for (const v of headerLines) {
      for (const seg of wrapText(v, fullCols)) {
        line(seg, centerX(seg.length));
      }
    }
    divider();
    blankLine();
  }

  // ---- body ----
  for (const b of blocks) {
    line(`[${b.timestamp}]`, MARGIN);
    for (const t of b.turns) {
      if (t.name) {
        // names are short; still guard against overflow via wrap
        for (const seg of wrapText(t.name, fullCols)) {
          line(seg, centerX(seg.length), 'bold');
        }
      }
      if (t.text) {
        const indentX = MARGIN + DIALOGUE_INDENT_CHARS * charW;
        for (const wrapped of wrapText(t.text, bodyCols)) {
          line(wrapped, indentX);
        }
      }
    }
    blankLine();
  }

  // ---- footer section: left-aligned at the margin, full-width wrap ----
  if (notes) {
    for (const wrapped of wrapText(`NOTES: ${notes}`, fullCols)) {
      line(wrapped, MARGIN, 'italic');
    }
    blankLine();
  }
  if (characters.length > 0) {
    for (const wrapped of wrapText(`CHARACTERS: ${characters.join(', ')}`, fullCols)) {
      line(wrapped, MARGIN, 'bold');
    }
  }

  // ---- page numbers ----
  const pageCount = doc.getNumberOfPages();
  const scaleRatio = charW / CHAR_W; // rendered vs intended size (1 if calibrated)
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setFont('normal');
    doc.setFontSize(10 / scaleRatio); // physical ~10pt footer text
    const label = `- ${i} -`;
    const w = doc.getTextWidth(label);
    doc.text(label, (PAGE_W - w) / 2, PAGE_H - MARGIN / 2);
  }
  doc.setFontSize(FONT_SIZE / scaleRatio);
  setFont('normal');

  return doc;
}

/** Convenience: Blob for browser download. */
export function buildPdfBlob(options) {
  return new Promise((resolve, reject) => {
    try {
      const doc = buildPdfDoc(options);
      resolve(doc.output('blob'));
    } catch (e) {
      reject(e);
    }
  });
}