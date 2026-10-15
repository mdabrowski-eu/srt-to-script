/**
 * Browser E2E test (headless Chromium via playwright-core).
 * Covers: page load, form fill, SRT upload, parse summary, live preview,
 * DOCX + PDF downloads (real files verified on disk), overlap/off passthrough
 * via pasted SRT, and Polish glyph rendering in the generated PDF.
 *
 * Run: node test/e2e.test.mjs   (expects `npm run preview` on :4173)
 */
import { strict } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { resolveChromium } from './chromium.mjs';

const CHROMIUM = resolveChromium();
const APP_URL = process.env.E2E_URL || 'http://localhost:4173/';

const outDir = mkdtempSync(join(tmpdir(), 'srt-e2e-'));
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const page = await browser.newPage({ acceptDownloads: true });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(APP_URL);
strict.equal(await page.title(), 'SRT → Voice Actor Script', 'page loads');

// ---- fill header (single multi-line text box) ------------------------------
const headerBox = page.locator('.header-text');
await headerBox.fill('Rozczarowani\nScenka 1\nKuchnia, rano');

// ---- upload the sample SRT --------------------------------------------------
const srtPath = join(outDir, 'sample.srt');
writeFileSync(
  srtPath,
  `1
00:00:00,000 --> 00:00:16,240
[Lucy] Okay watch your posture. No slouch more. More. Little more. Too slouchy. Lucky for you I carry

2
00:00:16,240 --> 00:00:25,120
[Lucy] some weight around here. Everybody knows Lucy.

3
00:00:25,120 --> 00:00:34,900
[Demon] What kind of demon are you? 
[Bean] Me? Oh I'm just like you know

4
00:00:34,900 --> 00:00:40,680
[Bean] Zażółć gęślą jaźń — overlap off ąćęłńóśźż test
`
);
await page.setInputFiles('.dropzone input[type=file]', srtPath);

await page.waitForSelector('.summary');
const summary = await page.textContent('.summary');
strict.match(summary, /4 timed blocks/, 'summary counts blocks');
strict.match(summary, /Lucy, Demon, Bean/, 'summary lists characters');

// ---- live preview mirrors layout --------------------------------------------
const preview = await page.textContent('.script-preview');
strict.match(preview, /\[00:00:00\]/, 'preview has timestamp');
strict.match(preview, /Zażółć gęślą jaźń/, 'preview preserves Polish + overlap/off as-is');
strict.match(preview, /CHARACTERS: Lucy, Demon, Bean/, 'preview has characters footer');

// name centered in preview (20 leading spaces per parser model)
const nameLine = preview
  .split('\n')
  .find((l) => l.trim() === 'Lucy');
strict.ok(/^ {20,40}Lucy$/.test(nameLine), `preview name line centered: "${nameLine}"`);

// ---- downloads (DOCX + PDF) ---------------------------------------------------
// Deterministic: collect download events with a single listener, then wait for
// the app's completion status (set after BOTH downloads have fired).
const downloads = [];
const collector = (d) => downloads.push(d);
page.on('download', collector);
await page.click('button:has-text("Download DOCX + PDF")');
await page.waitForSelector('.status.ok', { timeout: 30000 });
page.off('download', collector);
strict.equal(downloads.length, 2, `both downloads fired (got ${downloads.length})`);
const docxDownload = downloads.find((d) => d.suggestedFilename().endsWith('.docx'));
const pdfDownload = downloads.find((d) => d.suggestedFilename().endsWith('.pdf'));
strict.ok(docxDownload, 'DOCX download present');
strict.ok(pdfDownload, 'PDF download present');

const docxPath = join(outDir, 'rozczarowani.docx');
const pdfPath = join(outDir, 'rozczarowani.pdf');
await docxDownload.saveAs(docxPath);
await pdfDownload.saveAs(pdfPath);

const docxBuf = readFileSync(docxPath);
const pdfBuf = readFileSync(pdfPath);
strict.equal(docxBuf.slice(0, 2).toString('latin1'), 'PK', 'DOCX is a zip');
strict.equal(pdfBuf.slice(0, 5).toString('latin1'), '%PDF-', 'PDF magic header');
strict.ok(pdfBuf.length > 20000, `PDF has embedded fonts (${pdfBuf.length} bytes)`);

// status message shows both downloaded
await page.waitForSelector('.status.ok');
const statusText = await page.textContent('.status.ok');
strict.match(statusText, /Downloaded .*\.docx and .*\.pdf/, 'status confirms downloads');

// PDF filename comes from the FIRST header line ("Rozczarowani" → rozczarowani)
const docxName = docxDownload.suggestedFilename();
const pdfName = pdfDownload.suggestedFilename();
console.log('downloads:', docxName, pdfName);
strict.ok(docxName.endsWith('.docx') && docxName.startsWith('rozczarowani'), 'DOCX slug from first header line');
strict.ok(pdfName.endsWith('.pdf') && pdfName.startsWith('rozczarowani'), 'PDF slug from first header line');

// ---- PDF visual check: polish glyphs render (render page to PNG, check non-blank area) ----
// Convert PDF first page to PNG via pdftoppm (poppler) if available and check it's drawn
let visualNote = 'pdftoppm unavailable; skipped pixel check';
try {
  execSync(`pdftoppm -png -r 50 -f 1 -l 1 ${pdfPath} ${outDir}/page`);
  const png = readFileSync(`${outDir}/page-1.png`); // pdftoppm names page-1.png
  strict.ok(png.length > 5000, `PDF page renders to image (${png.length} bytes)`);
  visualNote = `rendered page-1.png ${png.length} bytes`;
} catch (e) {
  if (!String(e).includes('ENOENT')) throw e;
}
console.log('visual:', visualNote);

// ---- second PDF download in the SAME session --------------------------------
// Regression: fonts must be registered per-document; a second download used to
// silently fall back to WinAnsi standard fonts (Polish glyphs lost).
const secondDlPromise = page.waitForEvent('download', { timeout: 20000 });
await page.click('button:has-text("PDF only")');
const pdf2 = await secondDlPromise;
const pdf2Path = join(outDir, 'second.pdf');
await pdf2.saveAs(pdf2Path);
const pdf2Fonts = execSync(`pdffonts ${pdf2Path} 2>/dev/null`, { encoding: 'utf8', shell: '/bin/bash' });
strict.ok(pdf2Fonts.includes('CourierPrime'), 'second PDF still embeds CourierPrime');
const pdf2Text = execSync(`pdftotext -layout ${pdf2Path} - 2>/dev/null`, { encoding: 'utf8', shell: '/bin/bash' });
strict.ok(pdf2Text.includes('Zażółć gęślą jaźń'), 'second PDF Polish text intact');

// ---- logo upload flow --------------------------------------------------------
const logoPath = join(new URL('.', import.meta.url).pathname, 'fixtures/logo.png');
await page.setInputFiles('.logo-choose input[type=file]', logoPath);
await page.waitForSelector('.preview-logo');
strict.equal(await page.getAttribute('.preview-logo', 'data-pos'), 'left', 'logo defaults to left');
await page.click('.logo-pos .chip:has-text("Center")');
strict.equal(await page.getAttribute('.preview-logo', 'data-pos'), 'center', 'logo position switch to center');
strict.ok(await page.isVisible('.logo-thumb'), 'logo thumbnail shown');

// logoed PDF download → verify an image is actually embedded
const logoPdfPromise = page.waitForEvent('download', { timeout: 20000 });
await page.click('button:has-text("PDF only")');
const logoPdfDl = await logoPdfPromise;
const logoPdfPath = join(outDir, 'logoed.pdf');
await logoPdfDl.saveAs(logoPdfPath);
const imgList = execSync(`pdfimages -list ${logoPdfPath} 2>/dev/null || true`, { encoding: 'utf8', shell: '/bin/bash' });
strict.ok(/image|smask/.test(imgList), 'logoed PDF embeds the image');
console.log('logoed PDF images:', imgList.split('\n').filter((l) => l.includes('image')).length);

// remove logo → preview clears
await page.click('.chip.remove');
await page.waitForSelector('.preview-logo', { state: 'detached' });
strict.ok(!(await page.isVisible('.logo-thumb')), 'logo removed from UI');

// ---- template switch (theatre ⇄ all-left) -----------------------------------
await page.click('.tpl-chip:has-text("All left")');
await page.waitForFunction(
  () => document.querySelector('.script-preview')?.textContent.includes('\nLucy\n')
);
strict.ok(true, 'left template: preview name flush left');
// switch back to theatre — name centered again
await page.click('.tpl-chip:has-text("Theatre")');
await page.waitForFunction(
  () => {
    const l = document
      .querySelector('.script-preview')
      ?.textContent.split('\n')
      .find((x) => x.trim() === 'Lucy');
    return l && l.startsWith('    ') && l.trim() === 'Lucy';
  },
  { timeout: 5000 }
);
strict.ok(true, 'theatre template restored: name centered in preview');
await page.setViewportSize({ width: 1280, height: 900 });
await page.screenshot({ path: join(outDir, 'app.png'), fullPage: true });
console.log('screenshot:', join(outDir, 'app.png'));

// ---- bilingual UI: switch to Polish ---------------------------------------
await page.click('.lang-btn:has-text("PL")');
strict.equal(await page.getAttribute('html', 'lang'), 'pl', '<html lang> switched to pl');
strict.equal(await page.textContent('h1'), 'SRT → Scenariusz dla lektora', 'h1 translated');
const plBtnLabel = await page.textContent('button.primary');
strict.match(plBtnLabel, /Pobierz DOCX \+ PDF/, 'main button translated to Polish');
strict.equal(
  await page.evaluate(() => localStorage.getItem('srt-script-lang')),
  'pl',
  'language persisted'
);

// download still works in Polish UI (3rd doc in session — fonts still embedded)
const plPdfPromise = page.waitForEvent('download', { timeout: 20000 });
await page.click('button:has-text("Tylko PDF")');
const plPdf = await plPdfPromise;
strict.match(plPdf.suggestedFilename(), /rozczarowani\.pdf/, 'PL download works');

// preview explainer in Polish
strict.match(await page.textContent('.preview-note'), /odwzorowuje/, 'PL preview note');

// ---- persistence across reload ---------------------------------------------
await page.reload();
await page.waitForSelector('.lang-btn');
strict.equal(await page.getAttribute('html', 'lang'), 'pl', 'language kept after reload');
strict.equal(await page.textContent('h1'), 'SRT → Scenariusz dla lektora', 'h1 still Polish');
await page.click('.lang-btn:has-text("EN")');
await page.waitForFunction(() => document.documentElement.lang === 'en');
strict.equal(await page.textContent('h1'), 'SRT → Voice Actor Script', 'switching back to EN works');

// ---- no console/page errors ----------------------------------------------------
const ignorable = errors.filter(
  (e) => e.includes('favicon') === false // favicon is data-uri now; anything else must be empty
);
strict.deepEqual(ignorable, [], 'no console errors');

await browser.close();
// keep artifact dir for inspection
console.log('✓ E2E passed — artifacts in', outDir);