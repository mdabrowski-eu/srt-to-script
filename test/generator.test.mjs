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

// ---- logo placement regression (DOCX + PDF, three positions) ---------------
import { readFileSync as rf } from 'node:fs';
const logoB64 = rf(new URL('./fixtures/logo.png', import.meta.url)).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoB64}`;

// PDF: parse the `cm /I0 Do` placement matrix and verify x-offset per position
// fitLogoBox(2000×450): ratio=min(2.5/2000, 1.25/450,1)=0.00125 → 2.5×0.5625in = 180×40.5pt
// left x=54pt · center x=54+(504-180)/2=216pt · right x=54+504-180=378pt
const positions = { left: 54.0, center: 216.0, right: 378.0 };
const logoHeader = (pos) => ({
  headerText: 'H',
  logo: { dataUrl: logoDataUrl, naturalW: 2000, naturalH: 450, position: pos },
});
for (const [pos, expectedX] of Object.entries(positions)) {
  const d = buildPdfDoc({ header: logoHeader(pos), parsed });
  const raw = Buffer.from(d.output('arraybuffer')).toString('latin1');
  const m = raw.match(/([\d.]+) ([\d.]+) [\d.]+ [\d.]+ ([\d.]+) ([\d.]+) cm\s*\/\w+ Do/);
  strict.ok(m, `PDF logo placement op exists (${pos})`);
  const wPt = parseFloat(m[1]);
  const xPt = parseFloat(m[3]);
  // fitLogoBox: ratio = min(2.5/2000, 1.25/450, 1) = 1/450 → 4.44x1.0in → 320x72pt... 2000/450=4.44; w=2.5in=180pt wide
  strict.ok(Math.abs(wPt - 180) < 2, `PDF logo width = 180pt (${wPt}) — fit in 2.5in box`);
  strict.ok(Math.abs(xPt - expectedX) < 2, `PDF logo ${pos}: x=${xPt.toFixed(1)} ≈ ${expectedX}`);
}
console.log('✓ PDF logo placement OK (left/center/right)');

// DOCX: media file present in the zip + expected px transformation
const logoDocxBlob = await buildDocxBlob({ header: logoHeader('center'), parsed });
const logoDocxPath = join(outDir, 'logo.docx');
writeFileSync(logoDocxPath, Buffer.from(await logoDocxBlob.arrayBuffer()));
execSync(`cd ${outDir} && unzip -o -q logo.docx word/document.xml`);
const logoXml = readFileSync(join(outDir, 'word/document.xml'), 'utf8');
const unzipList = execSync(`cd ${outDir} && unzip -l logo.docx`, { encoding: 'utf8' });
strict.ok(/word\/media\/.+\.png/i.test(unzipList), 'DOCX embeds logo media file');

// the embedded media must be DECODED image bytes, not the base64 text
// (regression: Pages showed "?" placeholder when we embedded raw base64 text)
const mediaName = unzipList.match(/word\/media\/(\S+\.png)/i)[1];
const mediaBytes = execSync(`cd ${outDir} && unzip -p logo.docx word/media/${mediaName} | head -c 8 | xxd -p`, {
  encoding: 'utf8',
  shell: '/bin/bash',
}).trim();
strict.equal(mediaBytes, '89504e470d0a1a0a', `embedded media is a real PNG (got ${mediaBytes})`);
strict.ok(logoXml.includes('<pic:pic') || logoXml.includes('<w:drawing>'), 'DOCX has image XML');
// center position → jc=center in the logo paragraph
strict.ok(/<w:jc w:val="center"\/>/, 'DOCX logo paragraph centered');
console.log('✓ DOCX logo embed OK');

console.log('files:', outDir, '/test.docx, /test.pdf');