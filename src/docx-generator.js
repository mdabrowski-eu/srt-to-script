/**
 * DOCX generator — voice actor script in Courier New (typewriter look,
 * full Polish glyph support via system font). Layout mirrors the PDF:
 * - header block (from form) at top between drawn rules
 * - timestamp left-aligned
 * - character name centered
 * - dialogue left-aligned, indented to the right
 * - NOTES / CHARACTERS footer left-aligned at the margin
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  BorderStyle,
  PageNumber,
  Footer,
} from 'docx';
import { splitHeaderLines } from './parser.js';
import { fitLogoBox, base64FromDataUrl, imageTypeFromDataUrl } from './image.js';

const FONT = 'Courier New';
const PAGE_W_TWIP = 12240; // Letter 8.5"
const MARGIN_TWIP = 1080;  // 0.75"
const TEXT_W_TWIP = PAGE_W_TWIP - 2 * MARGIN_TWIP; // 10080 twips = 7" column
const SIZE = 24;           // 12pt in half-points

/** Monospace char cell at 12pt Courier: 0.6em = 7.2pt = 144 twips. */
const CHAR_TWIP = 144;
const FULL_COLS = Math.floor(TEXT_W_TWIP / CHAR_TWIP); // 70 columns

/** Half-points helper. */
const sizePt = (pt) => pt * 2;

/** Full-column horizontal rule — a bottom border on an empty paragraph. */
function dividerParagraph() {
  return new Paragraph({
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 6, // eighth-points: 6/8 pt
        color: '1C1A17',
        space: 2,
      },
    },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text: '', font: FONT, size: SIZE })],
  });
}

function centeredHeader(value) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: value, font: FONT, size: SIZE })],
  });
}

/** Center a name within the 70-column text area. */
function nameParagraph(name) {
  const pad = Math.max(0, Math.floor((FULL_COLS - name.length) / 2));
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: pad * CHAR_TWIP },
    children: [new TextRun({ text: name, font: FONT, size: SIZE, bold: true })],
  });
}

function timestampParagraph(ts) {
  return new Paragraph({
    spacing: { before: 240 },
    children: [new TextRun({ text: `[${ts}]`, font: FONT, size: SIZE })],
  });
}

/** Dialogue: left-aligned but indented 0.5" (5 monospace cells). */
function dialogueParagraph(text, { bold = false, italic = false } = {}) {
  return new Paragraph({
    indent: { left: 5 * CHAR_TWIP }, // 720 twips = 0.5"
    children: [new TextRun({ text, font: FONT, size: SIZE, bold, italic })],
  });
}

/** Footer lines (NOTES / CHARACTERS): flush with the left margin. */
function footerParagraph(text, { bold = false, italic = false } = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text, font: FONT, size: SIZE, bold, italic })],
  });
}

function blank() {
  return new Paragraph({ children: [new TextRun({ text: '', font: FONT, size: SIZE })] });
}

/**
 * Header image (logo): inline image in an aligned paragraph (left/center/
 * right within the 7" column). Rendering is identical across Word/LibreOffice,
 * and the image sits above the divider line in the header block.
 */
function logoParagraph(dataUrl, naturalW, naturalH, position) {
  void base64FromDataUrl;
  const { w, h } = fitLogoBox(naturalW, naturalH);
  const alignment =
    position === 'right' ? AlignmentType.RIGHT : position === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  return new Paragraph({
    alignment,
    spacing: { after: 120 },
    children: [
      new ImageRun({
        type: imageTypeFromDataUrl(dataUrl) || 'png',
        data: Uint8Array.from(base64FromDataUrl(dataUrl), (c) => c.charCodeAt(0)),
        transformation: {
          width: Math.round(w * 96), // docx ImageRun uses px (96/in)
          height: Math.round(h * 96),
        },
      }),
    ],
  });
}

/**
 * Build the DOCX Document from parsed blocks + form header.
 * Returns a Blob in the browser (Buffer-compatible in Node).
 */
export function buildDocxBlob({ header = {}, parsed }) {
  const { headerText = '', notes = '', logo = null } = header;
  const { blocks, characters } = parsed;

  const children = [];

  // ---- header image (logo), above the header text block ----
  if (logo && logo.dataUrl && logo.naturalW && logo.naturalH) {
    children.push(logoParagraph(logo.dataUrl, logo.naturalW, logo.naturalH, logo.position || 'left'));
  }

  // ---- header (from form) ----
  const headerLines = splitHeaderLines(headerText);
  if (headerLines.length > 0) {
    children.push(dividerParagraph());
    for (const v of headerLines) children.push(centeredHeader(v));
    children.push(dividerParagraph());
    children.push(blank());
  }

  // ---- body ----
  for (const b of blocks) {
    children.push(timestampParagraph(b.timestamp));
    for (const t of b.turns) {
      if (t.name) children.push(nameParagraph(t.name));
      if (t.text) children.push(dialogueParagraph(t.text));
    }
    children.push(blank());
  }

  // ---- footer section: left-aligned at the margin ----
  if (notes) {
    children.push(footerParagraph(`NOTES: ${notes}`, { italic: true }));
    children.push(blank());
  }
  if (characters.length > 0) {
    children.push(footerParagraph(`CHARACTERS: ${characters.join(', ')}`, { bold: true }));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: MARGIN_TWIP, right: MARGIN_TWIP },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: sizePt(10) }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  // Packer returns a Blob in the browser; in Node it can also resolve to a Buffer.
  return Packer.toBlob(doc);
}