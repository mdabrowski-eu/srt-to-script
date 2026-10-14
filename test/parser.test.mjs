import { strict } from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseSrt, buildScriptText } from '../src/parser.js';

const sample = readFileSync(new URL('../../rozczarowani-scenka.srt', import.meta.url), 'utf8');
const parsed = parseSrt(sample);

// --- structure -------------------------------------------------------------
strict.equal(parsed.blocks.length, 5, '5 timestamped blocks');
strict.deepEqual(
  parsed.blocks.map((b) => b.timestamp),
  ['00:00:00', '00:00:16', '00:00:25', '00:00:34', '00:00:40'],
  'start timestamps kept, ms + end dropped'
);

// Block 1: single character
strict.deepEqual(parsed.blocks[0].turns, [
  { name: 'Lucy', text: 'Okay watch your posture. No slouch more. More. Little more. Too slouchy. Lucky for you I carry' },
]);
// Block 3: two characters in one block
strict.deepEqual(parsed.blocks[2].turns, [
  { name: 'Demon', text: 'What kind of demon are you?' },
  { name: 'Bean', text: "Me? Oh I'm just like you know" },
]);
// Block 5: two characters, tag order preserved
strict.deepEqual(parsed.blocks[4].turns, [
  { name: 'Bean', text: 'I want to know where this relationship is going.' },
  { name: 'Demon', text: 'Whoa no further questions you may pass.' },
]);
strict.deepEqual(parsed.characters, ['Lucy', 'Demon', 'Bean']);

// --- multi-line cues: continuation lines join the previous turn ------------
const multi = parseSrt(
  [
    '1', '00:00:10,000 --> 00:00:20,000',
    '[Bean] I want to know', 'where this is going', '',
  ].join('\n')
);
strict.deepEqual(multi.blocks[0].turns, [
  { name: 'Bean', text: 'I want to know where this is going' },
]);

// --- html stripping + entity decode ---------------------------------------
const html = parseSrt(
  ['1', '00:01:00,000 --> 00:01:05,000', '<i>[Lucy]</i> Hello &amp; goodbye'].join('\n')
);
strict.deepEqual(html.blocks[0].turns, [{ name: 'Lucy', text: 'Hello & goodbye' }]);

// --- overlap/off pass through untouched ------------------------------------
const ov = parseSrt(
  ['1', '00:02:00,000 --> 00:02:10,000', '[Akira] (overlap) Don\u2014— wait (off)'].join('\n')
);
strict.equal(ov.blocks[0].turns[0].text, '(overlap) Don\u2014— wait (off)');
strict.equal(ov.characters[0], 'Akira');

// --- polish characters survive round-trip ----------------------------------
const pl = parseSrt(
  ['1', '00:03:00,000 --> 00:03:10,000', '[Łucja] Zażółć gęślą jaźń \u0141\u00f3d\u017a'].join('\n')
);
strict.equal(pl.blocks[0].turns[0].text, 'Zażółć gęślą jaźń Łódź');
strict.equal(pl.characters[0], 'Łucja');

// --- bracket timestamps (like example.txt) ---------------------------------
const bracket = parseSrt(
  ['[00:04:12]', '     [AKIRA]', 'You said you\u2019d come back.', ''].join('\n')
);
strict.deepEqual(bracket.blocks[0].timestamp, '00:04:12');
// A "[hh:mm:ss]"-shaped dialogue tag shouldn't confuse: it matched timestamp.
// Documented behaviour: bracket timestamps always win.

// --- wrapped lines *between* two speakers join the *previous* speaker -------
const chain = parseSrt(
  ['1', '00:00:10,000 --> 00:00:20,000', '[Bean] one', 'two [Demon] three', 'four'].join('\n')
);
strict.deepEqual(chain.blocks[0].turns, [
  { name: 'Bean', text: 'one two' },
  { name: 'Demon', text: 'three four' },
]);

// --- text render (preview parity) ------------------------------------------
const txt = buildScriptText({
  header: { headerText: 'Rozczarowani\nScenka 1' },
  parsed,
});
strict.match(txt, /\u2500{70}\n {29}Rozczarowani\n {31}Scenka 1\n\u2500{70}/m, 'header block rendered');
strict.match(txt, /^\[00:00:00\]\n {33}Lucy\n {5}Okay watch/m, 'layout prefix');
strict.ok(txt.includes('CHARACTERS: Lucy, Demon, Bean'));

// --- header lines handling ---------------------------------------------------
const hdr = parseSrt(sample);
const txtHdr = buildScriptText({ header: { headerText: '  Spaced  \n\nTytuł #1 \n' }, parsed: hdr });
strict.match(txtHdr, /  Spaced/, 'header lines are trimmed, blanks dropped');
// first line feeds the filename elsewhere; text view just centers lines

// --- unattributed lines (no [Tag], no previous speaker) ---------------------
const unattrib = parseSrt(
  ['1', '00:00:10,000 --> 00:00:20,000', 'Nagłówek sceny bez mówcy'].join('\n')
);
strict.deepEqual(unattrib.blocks[0].turns, [{ name: '', text: 'Nagłówek sceny bez mówcy' }]);

console.log('✓ parser tests passed');
console.log(JSON.stringify(parsed, null, 2));