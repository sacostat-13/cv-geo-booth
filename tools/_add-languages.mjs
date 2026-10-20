#!/usr/bin/env node
/* One-off: fold the languages Simon's clip download covers into
   tools/languages.json. Kept in the repo as the record of where each
   grouping came from. Run once; re-running is a no-op for locales already
   in the table.

   Names are Common Voice's own english_name, from data/cv-languages-live.json.
   Scripts were detected from the clips' own transcripts rather than guessed.
   Families and regions are curated here — they drive the near-miss distractor
   and the sentence that explains a wrong answer, so they are grouped at a
   level that is defensible rather than at the finest level a linguist would
   use: Chadic and Cushitic sit under afroasiatic, Grassfields and Gur and
   Kwa under niger-congo, and anything clearly Bantu keeps bantu, which the
   table already used.

   Autonyms are left empty wherever I could not source one I was confident
   about. An empty autonym renders as nothing rather than as a guess — a
   booth about these languages should not put an invented name for one on a
   two-metre screen. They are worth filling in from the Common Voice
   community. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = path.join(ROOT, 'tools', 'languages.json');

// locale, family, region, script, prominence, autonym ('' = not sourced)
const ADD = [
  // --- Europe -------------------------------------------------------------
  ['en', 'germanic', 'europe-west', 'latin', 3, 'English'],
  ['nn-NO', 'germanic', 'europe-north', 'latin', 2, 'nynorsk'],
  ['gsw', 'germanic', 'europe-west', 'latin', 1, 'Elsässisch'],
  ['yi', 'germanic', 'europe-east', 'hebrew', 1, 'ייִדיש'],
  ['an', 'romance', 'europe-west', 'latin', 1, 'aragonés'],
  ['lij', 'romance', 'europe-west', 'latin', 1, 'ligure'],
  ['rm-vallader', 'romance', 'europe-west', 'latin', 1, 'rumantsch vallader'],
  ['kw', 'celtic', 'europe-west', 'latin', 1, 'Kernewek'],
  ['ltg', 'baltic', 'europe-north', 'latin', 1, 'latgalīšu volūda'],
  ['mdf', 'uralic', 'europe-east', 'cyrillic', 1, 'мокшень кяль'],
  ['mrj', 'uralic', 'europe-east', 'cyrillic', 1, 'кырык мары'],

  // --- Caucasus -----------------------------------------------------------
  ['ady', 'northwest-caucasian', 'asia-west', 'cyrillic', 1, 'адыгабзэ'],
  ['kbd', 'northwest-caucasian', 'asia-west', 'cyrillic', 1, 'адыгэбзэ'],
  ['abq', 'northwest-caucasian', 'asia-west', 'cyrillic', 1, 'абаза бызшва'],
  ['dar', 'northeast-caucasian', 'asia-west', 'cyrillic', 1, 'дарган мез'],
  ['bbl', 'northeast-caucasian', 'asia-west', 'georgian', 1, ''],
  ['xmf', 'kartvelian', 'asia-west', 'georgian', 1, 'მარგალური'],
  ['sva', 'kartvelian', 'asia-west', 'georgian', 1, ''],
  ['lzz', 'kartvelian', 'asia-west', 'latin', 1, 'Lazuri'],
  ['os', 'iranian', 'asia-west', 'cyrillic', 1, 'ирон æвзаг'],
  ['kjh', 'turkic', 'asia-north', 'cyrillic', 1, 'хакас тілі'],

  // --- South and Central Asia ---------------------------------------------
  ['te', 'dravidian', 'asia-south', 'telugu', 2, 'తెలుగు'],
  ['tk', 'turkic', 'asia-central', 'latin', 1, 'Türkmençe'],
  ['brh', 'dravidian', 'asia-south', 'arabic', 1, ''],
  ['bft', 'sino-tibetan', 'asia-south', 'arabic', 1, ''],
  ['bsk', 'isolate', 'asia-south', 'latin', 1, ''],
  ['bsh', 'nuristani', 'asia-south', 'arabic', 1, ''],
  ['bgp', 'iranian', 'asia-south', 'arabic', 1, ''],
  ['oru', 'iranian', 'asia-south', 'arabic', 1, ''],
  ['khw', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['kls', 'indo-aryan', 'asia-south', 'latin', 1, ''],
  ['scl', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['phl', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['trw', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['gwc', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['btv', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['mvy', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['ush', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['odk', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['kvx', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['sbn', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['mve', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['gjk', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['ggg', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['hno', 'indo-aryan', 'asia-south', 'arabic', 1, ''],
  ['phr', 'indo-aryan', 'asia-south', 'arabic', 1, ''],

  // --- East and Southeast Asia --------------------------------------------
  ['zh-HK', 'sinitic', 'asia-east', 'han', 2, '中文（香港）'],
  ['zh-TW', 'sinitic', 'asia-east', 'han', 2, '中文（台灣）'],
  ['ms', 'austronesian', 'asia-southeast', 'latin', 2, 'Bahasa Melayu'],
  // Formosan languages: Austronesian, and the family's homeland.
  ['tay', 'austronesian', 'asia-east', 'latin', 1, ''],
  ['trv', 'austronesian', 'asia-east', 'latin', 1, 'Seediq'],
  ['bnn', 'austronesian', 'asia-east', 'latin', 1, 'Bunun'],
  ['pwn', 'austronesian', 'asia-east', 'latin', 1, ''],
  ['dru', 'austronesian', 'asia-east', 'latin', 1, ''],
  ['szy', 'austronesian', 'asia-east', 'latin', 1, 'Sakizaya'],

  // --- Africa: Cameroon and neighbours ------------------------------------
  ['abb', 'bantu', 'africa-central', 'latin', 1, ''],
  ['beb', 'bantu', 'africa-central', 'latin', 1, ''],
  ['bkh', 'bantu', 'africa-central', 'latin', 1, ''],
  ['bnm', 'bantu', 'africa-central', 'latin', 1, ''],
  ['bri', 'bantu', 'africa-central', 'latin', 1, ''],
  ['bum', 'bantu', 'africa-central', 'latin', 1, ''],
  ['dua', 'bantu', 'africa-central', 'latin', 1, 'Duálá'],
  ['eto', 'bantu', 'africa-central', 'latin', 1, ''],
  ['ewo', 'bantu', 'africa-central', 'latin', 1, ''],
  ['fan', 'bantu', 'africa-central', 'latin', 1, ''],
  ['ksf', 'bantu', 'africa-central', 'latin', 1, ''],
  ['nmg', 'bantu', 'africa-central', 'latin', 1, ''],
  ['yav', 'bantu', 'africa-central', 'latin', 1, ''],
  ['mbo', 'bantu', 'africa-central', 'latin', 1, ''],
  ['lua', 'bantu', 'africa-central', 'latin', 1, 'Tshiluba'],
  ['cjk', 'bantu', 'africa-central', 'latin', 1, 'Chokwe'],
  // Grassfields and other Niger-Congo of the same area.
  ['bax', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['bbj', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['bce', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['bfd', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['bkm', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['byv', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['fmp', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['jgo', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['nla', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['nnh', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['bag', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['gya', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['mua', 'niger-congo', 'africa-central', 'latin', 1, ''],
  ['tui', 'niger-congo', 'africa-central', 'latin', 1, ''],
  // Chadic, which is Afroasiatic rather than Niger-Congo despite the map.
  ['gid', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['giz', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['mcn', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['mse', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['mug', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['mxu', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['udl', 'afroasiatic', 'africa-central', 'latin', 1, ''],
  ['wes', 'creole', 'africa-central', 'latin', 1, 'Kamtok'],

  // --- Africa: west, east ---------------------------------------------------
  ['bba', 'niger-congo', 'africa-west', 'latin', 1, ''],
  ['bci', 'niger-congo', 'africa-west', 'latin', 1, ''],
  ['dag', 'niger-congo', 'africa-west', 'latin', 1, 'Dagbanli'],
  ['fub', 'niger-congo', 'africa-west', 'latin', 1, 'Fulfulde'],
  ['gej', 'niger-congo', 'africa-west', 'latin', 1, ''],
  ['ibb', 'niger-congo', 'africa-west', 'latin', 1, ''],
  ['kdh', 'niger-congo', 'africa-west', 'latin', 1, ''],
  ['nmz', 'niger-congo', 'africa-west', 'latin', 1, ''],
  ['pcm', 'creole', 'africa-west', 'latin', 1, 'Naijá'],
  ['dav', 'bantu', 'africa-east', 'latin', 1, ''],
  ['hem', 'bantu', 'africa-east', 'latin', 1, ''],
  ['rof', 'bantu', 'africa-east', 'latin', 1, ''],
  ['kln', 'nilotic', 'africa-east', 'latin', 1, ''],
  ['luo', 'nilotic', 'africa-east', 'latin', 1, 'Dholuo'],
  ['om', 'afroasiatic', 'africa-east', 'latin', 1, 'Afaan Oromoo'],
  ['tig', 'semitic', 'africa-east', 'ethiopic', 1, 'ትግረ'],

  // --- The Americas ---------------------------------------------------------
  // Quechuan varieties, which Common Voice lists separately and which are
  // each other's most interesting confusions.
  ['qup', 'quechuan', 'americas', 'latin', 1, ''],
  ['qus', 'quechuan', 'americas', 'latin', 1, ''],
  ['qva', 'quechuan', 'americas', 'latin', 1, ''],
  ['qvi', 'quechuan', 'americas', 'latin', 1, 'Kichwa'],
  ['qvj', 'quechuan', 'americas', 'latin', 1, ''],
  ['qvl', 'quechuan', 'americas', 'latin', 1, ''],
  ['qwa', 'quechuan', 'americas', 'latin', 1, ''],
  ['qws', 'quechuan', 'americas', 'latin', 1, ''],
  ['qxa', 'quechuan', 'americas', 'latin', 1, ''],
  ['qxp', 'quechuan', 'americas', 'latin', 1, ''],
  ['qxt', 'quechuan', 'americas', 'latin', 1, ''],
  ['qxu', 'quechuan', 'americas', 'latin', 1, ''],
  ['qxw', 'quechuan', 'americas', 'latin', 1, ''],
  ['jqr', 'aymaran', 'americas', 'latin', 1, ''],
  ['cpy', 'arawakan', 'americas', 'latin', 1, ''],
  ['prq', 'arawakan', 'americas', 'latin', 1, ''],
  ['hux', 'witotoan', 'americas', 'latin', 1, ''],
  ['ncx', 'uto-aztecan', 'americas', 'latin', 1, ''],
  ['nlv', 'uto-aztecan', 'americas', 'latin', 1, ''],
  ['tar', 'uto-aztecan', 'americas', 'latin', 1, ''],
  ['var', 'uto-aztecan', 'americas', 'latin', 1, ''],
  ['cut', 'oto-manguean', 'americas', 'latin', 1, ''],
  ['zoc', 'mixe-zoque', 'americas', 'latin', 1, ''],
  ['sei', 'isolate', 'americas', 'latin', 1, '']
];

const doc = JSON.parse(fs.readFileSync(P, 'utf8'));
const have = new Set(doc.languages.map(l => l.locale));

// English names come from Common Voice itself, never from here.
const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cv-languages-live.json'), 'utf8'));
const names = Object.fromEntries(live.locales.map(r => [r.locale, r.name]));

let added = 0, skipped = 0, unnamed = [];
for (const [locale, family, region, script, prominence, autonym] of ADD) {
  if (have.has(locale)) { skipped++; continue; }
  if (!names[locale]) { unnamed.push(locale); continue; }
  doc.languages.push({ locale, name: names[locale], autonym, family, region, script, prominence });
  added++;
}

doc.languages.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(P, JSON.stringify(doc, null, 2) + '\n');

console.log(`added ${added}, already present ${skipped}, no Common Voice name ${unnamed.length}${unnamed.length ? ': ' + unnamed.join(', ') : ''}`);
console.log(`table is now ${doc.languages.length} languages`);
const noAutonym = doc.languages.filter(l => !l.autonym).length;
console.log(`${noAutonym} have no autonym yet — the screen shows nothing rather than a guess`);
