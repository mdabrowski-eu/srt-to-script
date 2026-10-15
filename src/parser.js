/**
 * Parse raw SRT text into a shared script-block model (used by all generators).
 *
 * Rules (from design.md):
 * - Use start timestamp; drop end timestamp and milliseconds.
 * - Character names come from [Name] tags at the start of a line; spoken text
 *   follows the tag without it. Leading spaces removed.
 * - A timestamped block may contain multiple characters (each [Tag] starts a
 *   new turn; lines without a tag continue the previous turn).
 * - "overlap" / "off" words are NOT interpreted; if present in text they are
 *   pasted as-is. HTML tags (<i>, <b>, <font ...>) and entities are stripped.
 */

// [00:04:12] style timestamp: [hh:mm:ss]
const TS_BRACKET = /^\[?(\d{1,2}):([0-5]\d):([0-5]\d)\]?$/;
// SRT timestamp line: 00:04:12,000 --> 00:04:17,000
const TS_ARROW = /^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}$/;
// Bare cue index line (a number on its own)
const CUE_INDEX = /^\d{1,6}$/;

export const CHARACTERS_LABEL = 'CHARACTERS';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatTimestamp(h, m, s) {
  const H = parseInt(h, 10);
  const M = parseInt(m, 10);
  const S = parseInt(s, 10);
  if (Number.isNaN(H) || Number.isNaN(M) || Number.isNaN(S)) return null;
  return `${pad(H)}:${pad(M)}:${pad(S)}`;
}

/**
 * Strip HTML-ish markup such as <i>..</i>, <b>..</b>, <font ...>.
 * Square brackets are never touched — "overlap"/"off" text passes through as-is.
 */
export function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function normalizeTextLine(rawLine) {
  return stripHtml(String(rawLine).replace(/\s+/g, ' ').trim());
}

/**
 * Split/collapse lines into speaker turns, appending into `turns`.
 * Returns the same array for chaining.
 *
 * - "[Lucy] Okay watch..."        -> new turn (Lucy, "Okay watch...")
 * - "multiple [A] x [B] y" tags    -> two turns
 * - "[A] one\n  two" (next line    -> "two" continues turn A (joined with space))
 *   without a tag)
 * - text before any tag, with an   -> continues that previous turn
 *   existing previous turn
 * - text with no tags at all and   -> unattributed turn (empty name), so
 *   no previous turn                nothing is silently lost
 */
export function extractTurns(line, turns = []) {
  const clean = normalizeTextLine(line);
  if (!clean) return turns;

  const re = /\[([^\[\]]+)\]/g;
  const tags = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    tags.push({ name: m[1].trim(), index: m.index, end: m.index + m[0].length });
  }

  if (tags.length === 0) {
    if (turns.length > 0) {
      const prev = turns[turns.length - 1];
      prev.text = (prev.text + ' ' + clean).trim();
    } else {
      turns.push({ name: '', text: clean });
    }
    return turns;
  }

  // Any text before the first tag continues the previous turn (or, if there is
  // none, becomes an unattributed turn).
  const pre = clean.slice(0, tags[0].index).trim();
  if (pre) {
    if (turns.length > 0) {
      const prev = turns[turns.length - 1];
      prev.text = (prev.text + ' ' + pre).trim();
    } else {
      turns.push({ name: '', text: pre });
    }
  }

  for (let i = 0; i < tags.length; i++) {
    const from = tags[i].end;
    const to = i + 1 < tags.length ? tags[i + 1].index : clean.length;
    const text = clean.slice(from, to).trim();
    if (text) turns.push({ name: tags[i].name, text });
  }
  return turns;
}

/**
 * Parse an SRT document into script blocks.
 *
 * Returns:
 *   { blocks: [{ timestamp: "00:00:16", turns: [{ name, text }] }],
 *     characters: ["Lucy", ...] }   // in order of first appearance
 *
 * Handles: cue index lines, blank-line separators (including blank lines
 * inside a cue's text), [hh:mm:ss] bracket timestamps, and arrow timestamps.
 */
export function parseSrt(raw) {
  const text = String(raw).replace(/^\uFEFF/, ''); // strip BOM
  const lines = text.split(/\r\n|\r|\n/);

  const blocks = [];
  let current = null; // { timestamp, textLines: [] }

  const flush = () => {
    if (!current) return;
    const turns = [];
    for (const line of current.textLines) extractTurns(line, turns);
    if (turns.length > 0) blocks.push({ timestamp: current.timestamp, turns });
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (TS_ARROW.test(line)) {
      if (current) flush(); // arrow line always starts a new cue
      const start = line.split('-->')[0].trim();
      const m = start.match(/^(\d{1,2}):(\d{2}):(\d{2})/);
      current = { timestamp: formatTimestamp(m[1], m[2], m[3]), textLines: [] };
      continue;
    }
    if (TS_BRACKET.test(line)) {
      if (current) flush();
      const m = line.match(TS_BRACKET);
      current = { timestamp: formatTimestamp(m[1], m[2], m[3]), textLines: [] };
      continue;
    }
    if (CUE_INDEX.test(line)) continue; // cue index — drop
    if (line.length === 0) continue;   // blank separator or inside-cue blank

    if (current) {
      current.textLines.push(rawLine);
    }
    // Text before any timestamp is ignored (not part of a timed block).
  }
  flush();

  const characters = [];
  for (const b of blocks) {
    for (const t of b.turns) {
      if (t.name && !characters.includes(t.name)) characters.push(t.name);
    }
  }
  return { blocks, characters };
}

/**
 * Plain-text rendering of the parsed script (used for the preview and for
 * testing; layout matches the deliverables: timestamp left, name centered,
 * dialogue indented, NOTES/CHARACTERS footer left-aligned).
 */
export const DIALOGUE_INDENT = ' '.repeat(5); // 5 cells = 0.5", same as DOCX/PDF indent
export const HEADER_COLS = 70;                // full text column (~7" at 12pt Courier)

/** Center a string of `len` chars within HEADER_COLS. */
export function centerPad(len) {
  return ' '.repeat(Math.max(0, Math.floor((HEADER_COLS - len) / 2)));
}

/** Word-wrap to maxChars (monospace), hard-breaking overlong words. Shared
 *  with the PDF generator so preview and output stay in sync. */
export function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
    while (cur.length > maxChars) {
      lines.push(cur.slice(0, maxChars));
      cur = cur.slice(maxChars);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const PREVIEW_RULE = '\u2500'.repeat(HEADER_COLS); // thin drawn-style rule

/** Split the single header field into trimmed, non-empty lines. */
export function splitHeaderLines(headerText) {
  return String(headerText || '')
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Layout resolution shared by all renderers (preview, DOCX, PDF):
 * - template decides alignment: 'theatre' (default) | 'left'
 * - `compact` is a modifier: strip timestamps + blank lines between blocks
 * Legacy call sites passing template:'compact' normalize to theatre+compact.
 */
export function resolveLayout({ template = 'theatre', compact = false } = {}) {
  if (template === 'compact') return { allLeft: false, compact: true };
  return { allLeft: template === 'left', compact: Boolean(compact) };
}

export function buildScriptText({ header = {}, parsed, template = 'theatre', compact: compactOpt = false }) {
  const { headerText = '', notes = '' } = header;
  const { blocks, characters } = parsed;
  const { allLeft, compact } = resolveLayout({ template, compact: compactOpt });

  const lines = [];
  const headerLines = splitHeaderLines(headerText);
  if (headerLines.length > 0) {
    lines.push(PREVIEW_RULE);
    for (const v of headerLines) {
      for (const seg of wrapText(v, HEADER_COLS)) {
        lines.push(centerPad(seg.length) + seg);
      }
    }
    lines.push(PREVIEW_RULE);
    lines.push('');
  }

  for (const b of blocks) {
    if (!compact) lines.push(`[${b.timestamp}]`);
    for (const t of b.turns) {
      const nameSegs = wrapText(t.name, HEADER_COLS);
      for (const seg of nameSegs) {
        lines.push(allLeft ? seg : centerPad(seg.length) + seg);
      }
      if (t.text) {
        for (const seg of wrapText(t.text, HEADER_COLS - DIALOGUE_INDENT.length)) {
          lines.push(allLeft ? seg : DIALOGUE_INDENT + seg);
        }
      }
    }
    if (!compact) lines.push('');
  }

  if (notes) {
    // left-aligned at the margin — matches DOCX/PDF footer
    for (const seg of wrapText(`NOTES: ${notes}`, HEADER_COLS)) {
      lines.push(seg);
    }
    lines.push('');
  }
  if (characters.length > 0) {
    for (const seg of wrapText(`CHARACTERS: ${characters.join(', ')}`, HEADER_COLS)) {
      lines.push(seg);
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}