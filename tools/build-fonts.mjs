#!/usr/bin/env node
/* Build the booth's fonts: Noto, cut down to exactly the characters the
   question bank actually contains.

   The booth asks people to read sentences in 114 languages across 23 scripts.
   A system font stack does not have Tifinagh, Thaana, Ethiopic or Odia on an
   iPad, and a missing script does not degrade — it renders as a row of boxes,
   which is not a hard question, it is a broken one. Noto exists for exactly
   this and covers every script in the table.

   Shipping all of Noto would be ~40MB, most of it CJK. But the bank is fixed
   at build time, so the exact set of characters is known: subsetting to those
   turns 40MB into a few hundred kilobytes, and the booth keeps its promise of
   fetching nothing at the festival.

   Run after build-bank.mjs — it reads the bank the fonts have to cover:

       npm install            # the @expo-google-fonts/* devDependencies
       node tools/build-bank.mjs --sentences ...
       node tools/build-fonts.mjs

   Needs pyftsubset (fonttools) with Brotli, on the path:

       pip install 'fonttools[woff]' brotli
*/

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'fonts');
const MODULES = path.join(ROOT, 'node_modules', '@expo-google-fonts');

/* One entry per family the booth can need. `weights` is deliberately thin
   outside Latin: a sentence and an autonym are both set at a normal weight,
   and nothing in a non-Latin script is ever a heading, so one weight per
   script keeps the whole font folder small. */
const FAMILIES = {
  latin:      { family: 'Noto Sans',            pkg: 'noto-sans',            weights: [400, 600, 700, 800] },
  arabic:     { family: 'Noto Sans Arabic',     pkg: 'noto-sans-arabic',     weights: [400] },
  hebrew:     { family: 'Noto Sans Hebrew',     pkg: 'noto-sans-hebrew',     weights: [400] },
  devanagari: { family: 'Noto Sans Devanagari', pkg: 'noto-sans-devanagari', weights: [400] },
  bengali:    { family: 'Noto Sans Bengali',    pkg: 'noto-sans-bengali',    weights: [400] },
  gurmukhi:   { family: 'Noto Sans Gurmukhi',   pkg: 'noto-sans-gurmukhi',   weights: [400] },
  odia:       { family: 'Noto Sans Oriya',      pkg: 'noto-sans-oriya',      weights: [400] },
  tamil:      { family: 'Noto Sans Tamil',      pkg: 'noto-sans-tamil',      weights: [400] },
  malayalam:  { family: 'Noto Sans Malayalam',  pkg: 'noto-sans-malayalam',  weights: [400] },
  thaana:     { family: 'Noto Sans Thaana',     pkg: 'noto-sans-thaana',     weights: [400] },
  ethiopic:   { family: 'Noto Sans Ethiopic',   pkg: 'noto-sans-ethiopic',   weights: [400] },
  tifinagh:   { family: 'Noto Sans Tifinagh',   pkg: 'noto-sans-tifinagh',   weights: [400] },
  georgian:   { family: 'Noto Sans Georgian',   pkg: 'noto-sans-georgian',   weights: [400] },
  armenian:   { family: 'Noto Sans Armenian',   pkg: 'noto-sans-armenian',   weights: [400] },
  thai:       { family: 'Noto Sans Thai',       pkg: 'noto-sans-thai',       weights: [400] },
  lao:        { family: 'Noto Sans Lao',        pkg: 'noto-sans-lao',        weights: [400] },
  khmer:      { family: 'Noto Sans Khmer',      pkg: 'noto-sans-khmer',      weights: [400] },
  myanmar:    { family: 'Noto Sans Myanmar',    pkg: 'noto-sans-myanmar',    weights: [400] },
  hangul:     { family: 'Noto Sans KR',         pkg: 'noto-sans-kr',         weights: [400] },
  japanese:   { family: 'Noto Sans JP',         pkg: 'noto-sans-jp',         weights: [400] },
  // Simplified and traditional are different glyph sets for overlapping
  // codepoints, so Mandarin and the two traditional-script languages get
  // their own cut rather than one shared one.
  'han-sc':   { family: 'Noto Sans SC',         pkg: 'noto-sans-sc',         weights: [400] },
  'han-tc':   { family: 'Noto Sans TC',         pkg: 'noto-sans-tc',         weights: [400] }
};

/* Which bucket a language's own text goes into. Cyrillic and Greek are in
   Noto Sans itself, so they are not separate cuts — they fold into latin
   along with the interface and the language names. */
const bucketFor = (locale, script) => {
  if (script === 'cyrillic' || script === 'greek') return 'latin';
  if (script !== 'han') return script;
  return locale === 'zh-CN' ? 'han-sc' : 'han-tc';
};

const WEIGHT_DIR = {
  400: ['400Regular', 'NotoSans*_400Regular.ttf'],
  600: ['600SemiBold', '*_600SemiBold.ttf'],
  700: ['700Bold', '*_700Bold.ttf'],
  800: ['800ExtraBold', '*_800ExtraBold.ttf']
};

// ---- what the booth has to be able to draw --------------------------------

/* Latin carries everything that is not a language's own script: the English
   interface, the language names, digits, and the punctuation that turns up
   inside sentences in every script. */
const latin = new Set();
for (let c = 0x20; c <= 0x7e; c++) latin.add(c);
for (const ch of '£€…–—‘’“”„«»‹›•·°±×÷≈≤≥→←↔™©®§¶†‡′″¡¿ºª₹₽¥₩₺₦₱₴₫؋') latin.add(ch.codePointAt(0));
// Latin-1 Supplement and Latin Extended-A/B in full: language names and
// autonyms reach well into them (Tshivenḓa, Ɓàsàa, oʻzbekcha), and the whole
// of all three is a few hundred glyphs.
for (let c = 0x00a0; c <= 0x024f; c++) latin.add(c);
// Combining marks, modifier letters, and the Latin Extended Additional block
// that autonyms and transliterations use.
for (let c = 0x0300; c <= 0x036f; c++) latin.add(c);
for (let c = 0x02b0; c <= 0x02ff; c++) latin.add(c);
for (let c = 0x1e00; c <= 0x1eff; c++) latin.add(c);
// Greek and Cyrillic live in the same Noto Sans file and cost little.
for (let c = 0x0370; c <= 0x03ff; c++) latin.add(c);
for (let c = 0x0400; c <= 0x04ff; c++) latin.add(c);
for (let c = 0x0500; c <= 0x052f; c++) latin.add(c);

const buckets = { latin };
const add = (bucket, text) => {
  if (!text) return;
  const set = buckets[bucket] || (buckets[bucket] = new Set());
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    // Anything Latin, Greek, Cyrillic or general punctuation goes to the base
    // font wherever it appears, so a Catalan quotation mark inside a Georgian
    // sentence does not have to exist in the Georgian cut.
    if (cp < 0x0530 || (cp >= 0x2000 && cp <= 0x206f) || (cp >= 0x1e00 && cp <= 0x1eff)) latin.add(cp);
    else set.add(cp);
  }
};

// The bank and the language table, loaded the way the pages load them.
const sandbox = { window: {} };
for (const f of ['quiz-data.js', 'bank.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  new Function('window', src)(sandbox.window);
}
const DATA = sandbox.window.CV_DATA;
const BANK = sandbox.window.CV_BANK;
if (!DATA || !BANK) throw new Error('run tools/build-bank.mjs first');

for (const [locale, l] of Object.entries(DATA.languages)) {
  const bucket = bucketFor(locale, l.script);
  add('latin', l.name);
  add(bucket, l.autonym);
  for (const list of [l.accents, l.variants]) {
    for (const x of list || []) {
      add(bucket, x.label);
      // The display name is the one that reaches the screen, and it is in the
      // language's own script — Tachelhit's variant names are Tifinagh.
      add(bucket, x.name);
    }
  }
}
for (const q of [...(BANK.read || []), ...(BANK.listen || [])]) {
  const l = DATA.languages[q.answer];
  if (!l) continue;
  const bucket = bucketFor(q.answer, l.script);
  add(bucket, q.text);
  add(bucket, q.transcript);
}

// CJK punctuation and full-width forms turn up in Han, kana and Hangul text.
for (const b of ['han-sc', 'han-tc', 'japanese', 'hangul']) {
  if (!buckets[b]) continue;
  for (let c = 0x3000; c <= 0x303f; c++) buckets[b].add(c);
  for (let c = 0xff00; c <= 0xff65; c++) buckets[b].add(c);
}

// ---- subset ---------------------------------------------------------------

function findTtf(pkg, weight) {
  const dir = path.join(MODULES, pkg);
  if (!fs.existsSync(dir)) throw new Error(`missing ${dir} — run npm install`);
  const [sub] = WEIGHT_DIR[weight];
  const wdir = path.join(dir, sub);
  if (!fs.existsSync(wdir)) return null;
  const ttf = fs.readdirSync(wdir).find(f => f.endsWith('.ttf') && !/Italic/.test(f));
  return ttf ? path.join(wdir, ttf) : null;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const faces = [];
let total = 0;

for (const [bucket, cps] of Object.entries(buckets)) {
  const spec = FAMILIES[bucket];
  if (!spec) { console.warn(`no font mapped for script "${bucket}" — skipped`); continue; }
  if (!cps.size) continue;

  const unicodes = [...cps].sort((a, b) => a - b).map(c => 'U+' + c.toString(16).toUpperCase()).join(',');

  for (const weight of spec.weights) {
    const src = findTtf(spec.pkg, weight);
    if (!src) { console.warn(`${spec.pkg} has no weight ${weight} — skipped`); continue; }
    const name = `${bucket}-${weight}.woff2`;
    const dest = path.join(OUT, name);
    execFileSync('pyftsubset', [
      src,
      '--output-file=' + dest,
      '--flavor=woff2',
      '--unicodes=' + unicodes,
      // Keep the shaping tables: without them Arabic does not join, Devanagari
      // does not reorder and Khmer does not stack. A subset that drops these
      // renders the right characters in the wrong shapes, which is worse than
      // boxes because it looks fine to someone who cannot read it.
      '--layout-features=*',
      '--no-hinting',
      '--desubroutinize'
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    const bytes = fs.statSync(dest).size;
    total += bytes;
    faces.push({ family: spec.family, weight, file: name, bytes, glyphs: cps.size });
  }
}

// ---- the stylesheet -------------------------------------------------------

/* One family per script, listed in one stack. The browser walks the stack per
   character, so a Welsh sentence takes Noto Sans and a Georgian one falls
   through to Noto Sans Georgian without the page having to know which
   language it is drawing. */
const stack = [...new Set(faces.map(f => f.family))];
// Latin first: it has the widest coverage, and the others only answer for the
// characters their own cut contains.
stack.sort((a, b) => (a === 'Noto Sans' ? -1 : b === 'Noto Sans' ? 1 : a.localeCompare(b)));

const css = `/* Generated by tools/build-fonts.mjs on ${new Date().toISOString().slice(0, 10)}.
   Noto, subset to the characters in this build's question bank. Rebuild after
   any change to the bank — a new language with no cut here renders as boxes.
   Do not edit by hand. */

${faces.map(f => `@font-face {
  font-family: '${f.family}';
  src: url('fonts/${f.file}') format('woff2');
  font-weight: ${f.weight};
  font-style: normal;
  font-display: block;
}`).join('\n\n')}

:root {
  /* Every page sets font-family to this. */
  --font: ${stack.map(f => `'${f}'`).join(', ')}, sans-serif;
}
`;

fs.writeFileSync(path.join(ROOT, 'fonts.css'), css);

const kb = n => (n / 1024).toFixed(1) + 'kB';
for (const f of faces.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`  ${f.file.padEnd(22)} ${String(f.glyphs).padStart(6)} chars  ${kb(f.bytes).padStart(9)}`);
}
console.log(`\n${faces.length} files, ${kb(total)} total`);
console.log('wrote    fonts/, fonts.css');
