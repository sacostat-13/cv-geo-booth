#!/usr/bin/env node
/* Build the booth's baked-in question bank and language data.

   Everything the booth shows at the festival is generated here, once, and
   committed. The booth itself fetches nothing: venue wifi is not a dependency.

   Inputs
     data/cv-corpus-<n>.json      a Common Voice scripted-speech release, from
                                  github.com/common-voice/cv-dataset
     data/sps-corpus-<n>.json     the matching spontaneous-speech release
     tools/languages.json         the curated language table (families, scripts)
     --sentences <dir>            server/data from github.com/common-voice/common-voice
                                  (CC0 sentence files, one folder per locale)
     --clips <dir>                optional. <dir>/<locale>/*.mp3 plus an
                                  optional <dir>/<locale>/index.json giving
                                  { file, sentence } per clip. See tools/fetch-clips.md.

   Outputs
     quiz-data.js                 per-language Common Voice figures for the reveal panel
     bank.js                      the questions
     media/clips/<locale>/*.mp3   copied in when --clips is given

   Usage
     node tools/build-bank.mjs --sentences ../common-voice/server/data
     node tools/build-bank.mjs --sentences ../common-voice/server/data --clips ../cv-clips
*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- arguments ------------------------------------------------------------

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const SENTENCE_DIR = arg('sentences');
const CLIP_DIR = arg('clips');
const PER_LANG_READ = Number(arg('read-per-language', 12));
const PER_LANG_LISTEN = Number(arg('listen-per-language', 12));

// A fixed seed means two builds of the same inputs produce the same bank, so a
// diff shows what actually changed rather than a reshuffle.
let seedState = Number(arg('seed', 20261019)) >>> 0;
function rand() {
  // mulberry32
  seedState = (seedState + 0x6D2B79F5) >>> 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(a) {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const pick = a => a[Math.floor(rand() * a.length)];

// ---- inputs ---------------------------------------------------------------

function newestRelease(prefix) {
  const dir = path.join(ROOT, 'data');
  const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
  if (!files.length) throw new Error(`No ${prefix}*.json in data/ — download one from github.com/common-voice/cv-dataset`);
  files.sort();
  return { name: files[files.length - 1], json: JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8')) };
}

const corpus = newestRelease('cv-corpus-');
const sps = newestRelease('sps-corpus-');
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'languages.json'), 'utf8')).languages;

console.log(`release   ${corpus.name}`);
console.log(`spontaneous ${sps.name}`);

// ---- per-language Common Voice figures ------------------------------------

/* The release carries age and gender as fractions of validated clips, and
   accent and variant as raw counts. Both become { label, share } lists so the
   reveal panel draws them the same way. A blank label means the contributor
   did not say, which is itself worth showing — the gaps in the dataset are
   half of what the booth is about. */
function shareList(obj, { asFraction }) {
  if (!obj) return [];
  const entries = Object.entries(obj).filter(([, v]) => v > 0);
  const total = asFraction ? 1 : entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return [];
  return entries
    .map(([label, v]) => ({ label: label || '', share: +(v / total).toFixed(4) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 8);
}

const LANGS = {};
const missing = [];
for (const L of TABLE) {
  const c = corpus.json.locales[L.locale];
  if (!c) { missing.push(L.locale); continue; }
  LANGS[L.locale] = {
    name: L.name,
    autonym: L.autonym,
    family: L.family,
    region: L.region,
    script: L.script,
    prominence: L.prominence,
    hours: +(c.totalHrs || 0).toFixed(1),
    validHours: +(c.validHrs || 0).toFixed(1),
    clips: c.clips || 0,
    validated: (c.buckets && c.buckets.validated) || 0,
    users: c.users || 0,
    avgDurationSecs: c.avgDurationSecs || null,
    sps: !!sps.json.locales[L.locale],
    gender: shareList(c.splits && c.splits.gender, { asFraction: true }),
    age: shareList(c.splits && c.splits.age, { asFraction: true }),
    accents: shareList(c.splits && c.splits.accent, { asFraction: false }),
    variants: shareList(c.splits && c.splits.variant, { asFraction: false })
  };
}
if (missing.length) console.warn(`not in this release, skipped: ${missing.join(', ')}`);

const LOCALES = Object.keys(LANGS);
console.log(`languages ${LOCALES.length}`);

// ---- distractors ----------------------------------------------------------

/* Three wrong answers per question, chosen rather than drawn at random.

   One is from the same family as the answer. That is the confusion worth
   having: someone who picks Portuguese for Catalan has learned something when
   the screen tells them, where someone who picks Korean for Catalan has only
   learned that they were guessing.

   In read mode one more shares the script where possible, so the question is
   not answerable by recognising the alphabet alone — a Georgian sentence with
   three Latin-script options is a reading test, not a language test.

   The rest come from other families, preferring the same region, so the four
   options never collapse into one part of the world. */
function distractors(answer, mode) {
  const a = LANGS[answer];
  const chosen = [];
  const take = pool => {
    const free = pool.filter(l => l !== answer && !chosen.includes(l));
    if (!free.length) return false;
    chosen.push(pick(shuffle(free)));
    return true;
  };

  take(LOCALES.filter(l => LANGS[l].family === a.family));

  if (mode === 'read') {
    take(LOCALES.filter(l => LANGS[l].script === a.script && LANGS[l].family !== a.family));
  }

  /* Preferring the same region keeps the four options from reading as a world
     tour, but a language whose region holds only one or two others runs that
     pool dry — Mongolian shares "asia-north" with Yakut and nobody else. When
     that happens the fill widens rather than giving up, because a question
     with three options is not a question. */
  while (chosen.length < 3) {
    const others = LOCALES.filter(l => LANGS[l].family !== a.family);
    const sameRegion = others.filter(l => LANGS[l].region === a.region);
    const preferRegion = sameRegion.length && rand() < 0.6;
    if (preferRegion && take(sameRegion)) continue;
    if (take(others)) continue;
    if (!take(LOCALES)) break;        // 114 languages: this cannot be reached
  }
  return chosen;
}

const qid = (mode, locale, body) =>
  mode[0] + '-' + locale + '-' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 8);

// ---- read questions -------------------------------------------------------

/* A sentence has to be long enough to be a fair puzzle and short enough to
   read on an iPad under a 20-second clock. Anything with digits, URLs or
   stray Latin inside a non-Latin script is dropped: those are the sentences
   that give the answer away or render badly. */
const LATIN = /[A-Za-z]/;
// Scripts that do not put spaces between words pack far more sentence into far
// fewer characters: 40 characters of Cantonese is a paragraph, and the Latin
// length window would reject the lot.
const DENSE = new Set(['han', 'japanese', 'thai', 'khmer', 'lao', 'myanmar']);
function usableSentence(s, lang) {
  const t = s.trim();
  const dense = DENSE.has(lang.script);
  if (t.length < (dense ? 14 : 40) || t.length > (dense ? 60 : 130)) return false;
  if (/\d/.test(t)) return false;
  if (/https?:|www\.|@|[<>{}\\_|]/.test(t)) return false;
  if (t.split(/\s+/).length < 5 && lang.script === 'latin') return false;
  if (lang.script !== 'latin' && lang.script !== 'han' && lang.script !== 'japanese' && LATIN.test(t)) return false;
  // A sentence naming its own language is a giveaway.
  if (t.toLowerCase().includes(lang.name.toLowerCase())) return false;
  if (t.toLowerCase().includes(lang.autonym.toLowerCase())) return false;
  return true;
}

function readSentences(locale, lang) {
  const dir = path.join(SENTENCE_DIR, locale);
  if (!fs.existsSync(dir)) return [];
  const seen = new Set();
  const out = [];
  for (const f of shuffle(fs.readdirSync(dir).filter(f => f.endsWith('.txt')))) {
    // Sampling across files rather than draining the first one keeps the bank
    // from being twelve sentences about Catalan municipal waste policy.
    let lines;
    try { lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n'); } catch { continue; }
    const step = Math.max(1, Math.floor(lines.length / 400));
    for (let i = 0; i < lines.length; i += step) {
      const s = lines[i].trim();
      if (!s || seen.has(s) || !usableSentence(s, lang)) continue;
      seen.add(s);
      out.push(s);
      if (out.length > 600) break;
    }
    if (out.length > 600) break;
  }
  return shuffle(out);
}

const read = [];
const readCounts = {};
if (SENTENCE_DIR) {
  for (const locale of LOCALES) {
    const lang = LANGS[locale];
    const pool = readSentences(locale, lang);
    const used = pool.slice(0, PER_LANG_READ);
    readCounts[locale] = used.length;
    for (const text of used) {
      const wrong = distractors(locale, 'read');
      read.push({
        id: qid('read', locale, text),
        mode: 'read',
        answer: locale,
        text,
        options: shuffle([locale, ...wrong]),
        tier: lang.prominence
      });
    }
  }
  const thin = Object.entries(readCounts).filter(([, n]) => n < PER_LANG_READ).map(([l, n]) => `${l}:${n}`);
  if (thin.length) console.warn(`fewer read questions than asked for: ${thin.join(' ')}`);
} else {
  console.warn('no --sentences given: read questions not built');
}

// ---- listen questions -----------------------------------------------------

/* Clips are not in cv-dataset and cannot be fetched from a script — the
   corpus download is behind an agreement you accept once, by hand. See
   tools/fetch-clips.md. Until a clip folder exists the booth runs read-only,
   which is a working booth, not a broken one. */
const listen = [];
const clipCounts = {};
if (CLIP_DIR && fs.existsSync(CLIP_DIR)) {
  const outRoot = path.join(ROOT, 'media', 'clips');
  fs.mkdirSync(outRoot, { recursive: true });
  for (const locale of LOCALES) {
    const dir = path.join(CLIP_DIR, locale);
    if (!fs.existsSync(dir)) continue;
    let index = {};
    const indexPath = path.join(dir, 'index.json');
    if (fs.existsSync(indexPath)) {
      for (const row of JSON.parse(fs.readFileSync(indexPath, 'utf8'))) index[row.file] = row.sentence || '';
    }
    const files = shuffle(fs.readdirSync(dir).filter(f => /\.(mp3|m4a|ogg|wav)$/i.test(f))).slice(0, PER_LANG_LISTEN);
    if (!files.length) continue;
    fs.mkdirSync(path.join(outRoot, locale), { recursive: true });
    clipCounts[locale] = files.length;
    for (const f of files) {
      fs.copyFileSync(path.join(dir, f), path.join(outRoot, locale, f));
      const wrong = distractors(locale, 'listen');
      listen.push({
        id: qid('listen', locale, f),
        mode: 'listen',
        answer: locale,
        clip: `media/clips/${locale}/${f}`,
        transcript: index[f] || '',
        options: shuffle([locale, ...wrong]),
        tier: LANGS[locale].prominence
      });
    }
  }
} else if (CLIP_DIR) {
  console.warn(`--clips ${CLIP_DIR} does not exist`);
} else {
  console.warn('no --clips given: listen questions not built (see tools/fetch-clips.md)');
}

// ---- write ----------------------------------------------------------------

const header = (what) => `/* ${what}
   Generated by tools/build-bank.mjs on ${new Date().toISOString().slice(0, 10)}
   from ${corpus.name} and ${sps.name}. Do not edit by hand — rebuild instead. */\n`;

const totals = {
  release: corpus.name.replace(/\.json$/, ''),
  spsRelease: sps.name.replace(/\.json$/, ''),
  totalHrs: corpus.json.totalHrs,
  totalValidHrs: corpus.json.totalValidHrs,
  locales: Object.keys(corpus.json.locales).length,
  spsLocales: Object.keys(sps.json.locales).length,
  users: Object.values(corpus.json.locales).reduce((s, l) => s + (l.users || 0), 0),
  clips: Object.values(corpus.json.locales).reduce((s, l) => s + (l.clips || 0), 0)
};

fs.writeFileSync(
  path.join(ROOT, 'quiz-data.js'),
  header('Common Voice figures for the languages the booth asks about.') +
  'window.CV_DATA = ' + JSON.stringify({ totals, languages: LANGS }, null, 1) + ';\n'
);

fs.writeFileSync(
  path.join(ROOT, 'bank.js'),
  header('The booth question bank.') +
  'window.CV_BANK = ' + JSON.stringify({ read, listen }, null, 0) + ';\n'
);

const serves = (read.length + listen.length);
console.log(`read      ${read.length} questions`);
console.log(`listen    ${listen.length} questions`);
console.log(`bank      ${serves} questions = ${Math.floor(serves / 5)} runs of 5 before any repeat`);
console.log(`wrote     quiz-data.js, bank.js`);
