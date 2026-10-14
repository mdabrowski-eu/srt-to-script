/**
 * Node smoke test for generators.
 *
 * DOCX: content verified via `textutil` (macOS) when available; structural
 * XML checks (indent, borders) always run.
 * PDF: validity + embedded-font checks always run; content verified via
 * `pdftotext` when available (with margin-bleed bbox checks).
 */
import { strict } from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parseSrt } from '../src/parser.js';
import { buildDocxBlob } from '../src/docx-generator.js';
import { buildPdfDoc } from '../src/pdf-generator.js';

const sample = readFileSync(new URL('./fixtures/sample.srt', import.meta.url), 'utf8');
const parsed = parseSrt(sample);
const header = {
  headerText: 'Rozczarowani\nScenka 1\nS01E01\nKuchnia, rano',
  notes: 'Przykładowe notatki — łą, ć, ż',
};

const outDir = mkdtempSync(join(tmpdir(), 'srt-script-gen-'));
console.log('out dir:', outDir);

/** Resolve an external tool path, or null when unavailable (CI-safe). */
function which(tool) {
  try {
    return execSync(`command -v ${tool}`, { encoding: 'utf8', shell: '/bin/bash' }).trim() || null;
  } catch {
    return null;
  }
}

const hasTextutil = which('textutil');
const hasPdftotext = which('pdftotext');

// ---- DOCX ------------------------------------------------------------------
const docxBlob = await buildDocxBlob({ header, parsed });
const docxPath = join(outDir, 'test.docx');
writeFileSync(docxPath, Buffer.from(await docxBlob.arrayBuffer()));

if (hasTextutil) {
  const docxText = execSync(`textutil -convert txt -stdout ${docxPath}`, { encoding: 'utf8' });
  console.log('--- DOCX text (textutil) ---');
  console.log(docxText);

  strict.ok(docxText.includes('[00:00:00]'), 'timestamp present');
  strict.ok(docxText.includes('Rozczarowani'), 'header project present');
  strict.ok(
    docxText.includes('Przykładowe notatki — łą, ć, ż'),
    'polish text (notes) preserved in DOCX'
  );
  strict.ok(docxText.includes('CHARACTERS: Lucy, Demon, Bean'), 'characters footer');
} else {
  console.log('(textutil unavailable — XML-based DOCX checks only)');
}

// Structural XML checks (platform-independent): unzip document.xml and verify
// centering indent, dialogue indent, divider borders, footer alignment.
execSync(`cd ${outDir} && unzip -o -q test.docx word/document.xml`);
const docXml = readFileSync(join(outDir, 'word/document.xml'), 'utf8');
const hasDocxText = hasTextutil ? true : docXml.includes('[00:00:00]') && /Rozczarowani/.test(docXml);
strict.ok(hasDocxText, 'document.xml contains script content');

// name centering: verify w:ind left value in document.xml (~20-40 chars * 144 twips)
const nameRun = docXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*?Lucy(?:(?!<\/w:p>).)*?<\/w:p>/s);
strict.ok(nameRun, 'Lucy paragraph found in XML');
const indLeft = nameRun[0].match(/w:left="(\d+)"/);
strict.ok(indLeft, 'Lucy paragraph has left indent');
const charTwips = Number(indLeft[1]);
strict.ok(
  charTwips >= 20 * 144 && charTwips <= 40 * 144,
  `Lucy indent ~centered (${charTwips} twips)`
);

// dialogue indent: verify w:ind left = 720 twips (0.5") on the dialogue paragraph
const dialPara = docXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*?Okay watch(?:(?!<\/w:p>).)*?<\/w:p>/s);
strict.ok(dialPara, 'dialogue paragraph found in XML');
const dialIndent = dialPara[0].match(/w:left="(\d+)"/);
strict.ok(
  dialIndent && Number(dialIndent[1]) === 720,
  `dialogue indent is 720 twips (${dialIndent && dialIndent[1]})`
);

// footer (NOTES/CHARACTERS) left-aligned: no w:ind on those paragraphs
for (const marker of ['NOTES:', 'CHARACTERS:']) {
  const p = docXml.match(
    new RegExp(`<w:p\\b[^>]*>(?:(?!</w:p>).)*?${marker}(?:(?!</w:p>).)*?</w:p>`, 's')
  );
  strict.ok(p, `${marker} paragraph exists`);
  strict.ok(!/w:ind\b/.test(p[0]), `${marker} paragraph is not indented (left-aligned)`);
}

// divider lines: bordered paragraphs (w:pBdr), no literal '=' runs
const pBdrCount = (docXml.match(/<w:pBdr>/g) || []).length;
strict.equal(pBdrCount, 2, 'two divider paragraphs');
strict.equal((docXml.match(/>={3,}</g) || []).length, 0, 'no literal ==== strings');

console.log('✓ DOCX OK');

// ---- PDF -------------------------------------------------------------------
const pdfDoc = buildPdfDoc({ header, parsed });
const pdfBytes = pdfDoc.output('arraybuffer');
const pdfPath = join(outDir, 'test.pdf');
writeFileSync(pdfPath, Buffer.from(pdfBytes));
const pdfBuf = readFileSync(pdfPath);

strict.equal(pdfBuf.slice(0, 5).toString('latin1'), '%PDF-', 'PDF magic header');
const pdfStr = pdfBuf.toString('latin1');
strict.ok(pdfStr.includes('CourierPrime-Regular'), 'embedded CourierPrime-Regular');
strict.ok(pdfStr.includes('CourierPrime-Bold'), 'embedded CourierPrime-Bold');

let pdftotext = '';
if (hasPdftotext) {
  try {
    pdftotext = execSync(`pdftotext -layout ${pdfPath} -`, {
      encoding: 'utf8',
      shell: '/bin/bash',
    });
  } catch {}
}

if (pdftotext.trim()) {
  console.log('--- pdftotext ---');
  console.log(pdftotext.split('\n').slice(0, 30).join('\n'));
  strict.ok(pdftotext.includes('Okay watch'), 'PDF text: dialogue present');
  strict.ok(pdftotext.includes('00:00:00'), 'PDF text: timestamp present');
  const lucy = pdftotext.split('\n').find((l) => l.includes('Lucy'));
  const leading = lucy ? lucy.length - lucy.trimStart().length : -1;
  if (lucy) strict.ok(leading >= 20, `Lucy centered in PDF (leading=${leading})`);

  // footer left-aligned: NOTES/CHARACTERS lines start flush at column 0
  const notesLine = pdftotext.split('\n').find((l) => l.includes('NOTES:'));
  const charsLine = pdftotext.split('\n').find((l) => l.includes('CHARACTERS:'));
  strict.ok(notesLine === undefined || notesLine.startsWith('NOTES:'), 'NOTES flush left');
  strict.ok(
    charsLine === undefined || charsLine.startsWith('CHARACTERS:'),
    'CHARACTERS flush left'
  );

  // margin bleed check: no word extends past the right margin (558pt = 612-54)
  execSync(`pdftotext -bbox ${pdfPath} ${join(outDir, 'bbox.html')}`);
  const bbox = readFileSync(join(outDir, 'bbox.html'), 'utf8');
  const xMaxes = [...bbox.matchAll(/xMax="([\d.]+)"/g)].map((m) => Number(m[1]));
  const rightmost = Math.max(...xMaxes);
  strict.ok(rightmost <= 558.5, `no margin bleed (rightmost=${rightmost}, limit=558)`);

  // divider lines are drawn (vector), so '=' should not appear as text
  strict.equal((bbox.match(/={3,}/g) || []).length, 0, 'no literal ==== glyphs in PDF');

  console.log('✓ PDF text checks OK');
} else {
  console.log('(pdftotext not available — structural checks only)');
}
console.log('✓ PDF OK (bytes:', pdfBuf.length, ')');

// ---- dedicated wrap/bleed regression: long wrapped footer content ----------
const longNotes =
  'Bardzo długa linia notatek produkcyjnych dla ekipy nagraniowej. ' +
  'DługieSłowo' +
  'x'.repeat(120);
const bleedParsed = parseSrt(
  [
    '1',
    '00:00:10,000 --> 00:00:20,000',
    '[Łucja] Długa kwestia: ' + 'słowo'.repeat(20) + ' oraz ' + 'Ż'.repeat(150) + ' koniec.',
  ].join('\n')
);
const bleedDoc = buildPdfDoc({
  header: { headerText: 'Test zawijania — ąćęłńóśźż', notes: longNotes },
  parsed: bleedParsed,
});
const bleedPath = join(outDir, 'bleed.pdf');
writeFileSync(bleedPath, Buffer.from(bleedDoc.output('arraybuffer')));

if (hasPdftotext) {
  const bleedTxt = execSync(`pdftotext -layout ${bleedPath} - 2>/dev/null`, {
    encoding: 'utf8',
    shell: '/bin/bash',
  });
  const flat = bleedTxt.replace(/\s+/g, ' ');
  // every character must survive wrapping (no truncation):
  strict.ok(flat.includes(longNotes.slice(0, 60)), 'long notes text present in PDF');
  strict.ok(flat.replace(/\s/g, '').includes('x'.repeat(50)), 'long word chars preserved');
  // wrapped line widths stay inside the column
  strict.ok(
    bleedTxt.split('\n').some((l) => l.trimStart() !== l && l.trim()),
    'notes wrapped across lines'
  );
  execSync(`pdftotext -bbox ${bleedPath} ${join(outDir, 'bleed-bbox.html')}`);
  const bleedBbox = readFileSync(join(outDir, 'bleed-bbox.html'), 'utf8');
  const bleedMax = Math.max(
    ...[...bleedBbox.matchAll(/xMax="([\d.]+)"/g)].map((m) => Number(m[1]))
  );
  strict.ok(bleedMax <= 558.5, `bleed regression: rightmost=${bleedMax} <= 558`);
  console.log('✓ wrap/bleed regression OK (rightmost', bleedMax.toFixed(1) + ')');
} else {
  // Without pdftotext, at least ensure the bleed PDF built and embedded fonts.
  const bleedBuf = readFileSync(bleedPath);
  strict.equal(bleedBuf.slice(0, 5).toString('latin1'), '%PDF-', 'bleed PDF magic header');
  strict.ok(
    bleedBuf.toString('latin1').includes('CourierPrime-Regular'),
    'bleed PDF embeds CourierPrime'
  );
  console.log('✓ wrap/bleed regression OK (structural only)');
}

console.log('files:', outDir, '/test.docx, /test.pdf');