# srt-to-script

Convert SRT subtitle files into clean **voice actor scripts** — in the browser, no server
needed. Produces **DOCX and PDF** with a typewriter layout and full **Polish character
support** (ąćęłńóśźż). UI available in **English and Polish**.

## Usage

```bash
npm install
npm run dev      # open the printed local URL
```

Or a production build:

```bash
npm run build    # outputs to dist/
npm run preview  # serve dist/ locally
```

In the app:

1. Fill in the **header text** — one line per row (project, title, episode, scene… whatever you
   need). Lines are centered at the top of the generated script between drawn divider lines,
   and the *first line* is also used for the output filename. An optional **notes** field goes
   at the bottom of the script.
2. Drop / choose an `.srt` file, or paste raw SRT text.
3. Optionally add a **logo image** (PNG/JPG/WebP/GIF/BMP) shown above the header block —
   choose its position: left, center or right. The image is scaled to fit
   (max 2.5″ × 1.25″, never upscaled) and the live preview mirrors the placement.
4. Choose the **script template**:
   - **Theatre** (default) — character names centered, dialogue indented 0.5″
   - **All left** — everything below the header (timestamps, names, dialogue) flush left
5. Click **Download DOCX + PDF** (or either format alone). Filenames are derived from the first
   header line (or the uploaded file name), slugified safely.

## Input structure

Standard SRT cues:

```
1
00:00:00,000 --> 00:00:16,240
[Lucy] Okay watch your posture. No slouch more. More.

2
00:00:16,240 --> 00:00:25,120
[Demon] What kind of demon are you?
[Bean] Me? Oh I'm just like you know
```

Processing rules:

- **Timestamps.** Only the *start* time is kept, printed as `[hh:mm:ss]`. The end time and
  milliseconds are dropped.
- **Characters.** A `[Name]` tag at the start of a line marks the speaker; the tag is removed
  and the remaining text (leading spaces stripped) is the spoken line. Lines without a tag
  continue the previous speaker's line.
- **Multiple characters per cue** are supported — each `[Name]` starts a new turn.
- **`overlap` / `off` words are not interpreted.** They are pasted through exactly as written
  whenever they appear in the dialogue text.
- **HTML markup** (`<i>`, `<b>`, `<font …>`) and HTML entities in dialogue are stripped.

## Output layout

- Optional logo image above the header block, positioned left/center/right
  (scaled to max 2.5″ × 1.25″, aspect ratio preserved, small images never upscaled).
- Header block from the form (one centered line per text box row, between drawn divider lines).
- `[hh:mm:ss]` start timestamp, left-aligned.
- Character name — **centered, bold** in the Theatre template, **flush left** in the All-left
  template.
- Dialogue — left-aligned; indented ~0.5″ in the Theatre template, flush left in All-left.
- Blank line between blocks; production notes (**NOTES:**, italic) and a **CHARACTERS:** list
  at the bottom — both left-aligned at the margin.
- Drawn horizontal divider lines around the header (full text-column width, not `===` glyphs).
- Page numbers in the footer.

Fonts: **Courier New** in the DOCX; **Courier Prime** (SIL Open Font License, embedded in
`public/fonts/`) in the PDF — typewriter look on both, full Polish glyph coverage.

## Design choices

- Plain **React + Vite**; the design doc made a UI framework optional, so no shadcn — a small
  hand-rolled stylesheet keeps the page dependency-light and easy to theme.
- **Two languages (EN/PL)** via a tiny hand-rolled i18n layer (`src/i18n.js`): EN/PL toggle in
  the masthead, browser-language auto-detection (Polish browsers start in Polish), choice kept
  in `localStorage`, `<html lang>` kept in sync. All interface strings — including status
  messages and the input-structure explainer — are translated; the generated script document
  itself stays unchanged regardless of UI language.
- The SRT parser (`src/parser.js`) and the two generators (`src/docx-generator.js`,
  `src/pdf-generator.js`, with `pdf-generator.js` embedding Courier Prime via `src/fonts.js`)
  are framework-independent ES modules, so they are exercised directly by the Node tests.

## Tests

```bash
npm test                      # parser tests + generator smoke tests (Node)
node test/e2e.test.mjs        # browser E2E (needs `npm run preview` on :4173)
node test/screenshot.mjs      # EN/PL screenshots to /tmp/i18n-shots
```

Generator tests verify content through `textutil` (DOCX) and `pdftotext` (PDF) when available
on the machine; structural checks always run. The E2E also covers the language switcher
(translation, persistence across reload, `<html lang>` sync) and a second-download font
regression.