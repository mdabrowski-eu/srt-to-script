/**
 * Shared header-image (logo) placement math — used by the DOCX generator
 * (px), the PDF generator (pt) and the live preview (chars).
 *
 * The image is scaled to fit inside a fixed box (preserving aspect ratio,
 * never upscaled) and horizontally positioned per the chosen alignment.
 * All horizontal math is done in inches against the 7" text column.
 */

export const COL_W_IN = 7.0; // text column width (Letter, 0.75" margins)
export const MARGIN_IN = 0.75;

/** Logo box: max 2.5" wide, 1.25" tall — small bitmaps are not upscaled. */
export const LOGO_MAX_W_IN = 2.5;
export const LOGO_MAX_H_IN = 1.25;

/**
 * Fit natural dimensions (px) into the logo box.
 * @returns {{w:number, h:number}} size in inches
 */
export function fitLogoBox(naturalW, naturalH) {
  if (!naturalW || !naturalH) return { w: 0, h: 0 };
  const r = Math.min(LOGO_MAX_W_IN / naturalW, LOGO_MAX_H_IN / naturalH, 1);
  return { w: naturalW * r, h: naturalH * r };
}

/**
 * X offset (inches from page left edge) for the given position.
 * @param {'left'|'center'|'right'} position
 * @param {number} wIn rendered width in inches
 */
export function imageXIn(position, wIn) {
  if (position === 'center') return 0.75 + (COL_W_IN - wIn) / 2;
  if (position === 'right') return 0.75 + COL_W_IN - wIn;
  return 0.75;
}

/** Map a data-URL mime type to a jsPDF/docx image type. */
export function imageTypeFromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif|bmp)/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (t === 'jpeg') return 'jpg';
  return t;
}

/** Extract the base64 payload from a data URL (for docx ImageRun). */
export function base64FromDataUrl(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : '';
}

/**
 * Decode base64 to bytes (browser + Node ≥16 both provide global atob()).
 * Do NOT use Uint8Array.from(b64, charCodeAt) — that encodes the base64
 * TEXT itself, producing a corrupt image (Pages shows a "?" placeholder).
 */
export function base64ToUint8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}