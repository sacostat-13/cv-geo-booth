#!/usr/bin/env node
/* Check a clips folder before it reaches a build.

       node tools/check-clips.mjs ./clips
       node tools/check-clips.mjs ./clips --index-only    # no audio cut yet

   Several people cutting clips for the same booth will structure them
   several ways unless something tells them otherwise, and the failure mode
   is quiet: a locale folder named "catalan" instead of "ca" does not error,
   it just silently contributes nothing, and nobody notices until the booth
   is on and Catalan never comes up. This says so instead.

   Reads nothing but the folder you point it at and writes nothing at all.
   Exits non-zero if there are errors, so it can gate a build.

   Duration checks need `ffprobe` on the path; without it they are skipped
   and the run says so rather than passing quietly. */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dir = process.argv[2];
const indexOnly = process.argv.includes('--index-only');
const allDurations = process.argv.includes('--all-durations');
if (!dir || dir.startsWith('--')) {
  console.error('usage: node tools/check-clips.mjs <clips-dir> [--index-only] [--all-durations]');
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  console.error(`no such folder: ${dir}`);
  process.exit(2);
}

// What the booth will actually accept, read from the same table the build uses.
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'languages.json'), 'utf8')).languages;
const KNOWN = new Map(TABLE.map(l => [l.locale, l.name]));

// Kept in step with defaults.js by hand; both are stated in the README.
const CLIP_SECS = 6;
const WANT_PER_LANG = 12;
/* Durations are sampled, not exhaustive. ffprobe is a process per clip, and a
   full download is ten thousand of them — minutes of spawning to re-learn
   what the first few of each language already said, since they all came out
   of the same prepare-clips run. --all-durations if you really want every
   one. */
const DURATION_SAMPLE = 3;
const AUDIO = /\.(mp3|m4a|ogg|wav)$/i;
// Fields that must never reach a published website.
const FORBIDDEN = ['client_id', 'clientId', 'clientID', 'speaker_id', 'speakerId'];

let errors = 0, warnings = 0;
const err = (where, msg) => { errors++; console.log(`  ERROR  ${where}: ${msg}`); };
const warn = (where, msg) => { warnings++; console.log(`  warn   ${where}: ${msg}`); };

let ffprobe = true;
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { ffprobe = false; }

const duration = f => {
  try {
    return Number(execFileSync('ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
      { encoding: 'utf8' }).trim());
  } catch { return NaN; }
};

const entries = fs.readdirSync(dir, { withFileTypes: true });
// Folders starting with _ or . are the operator's own — reports, scratch,
// whatever — and are not claiming to be a locale.
const locales = entries.filter(e => e.isDirectory() && !/^[_.]/.test(e.name)).map(e => e.name);
const strays = entries.filter(e => e.isFile() && e.name !== 'README.md' && !e.name.startsWith('.'));

console.log(`checking ${path.resolve(dir)}`);
if (indexOnly) console.log('index-only: not looking for the audio itself');
if (!indexOnly && !ffprobe) console.log('ffprobe not found: clip lengths NOT checked');
else if (!indexOnly && !allDurations) console.log(`checking the length of the first ${DURATION_SAMPLE} clips per language (--all-durations for every one)`);
console.log('');

if (!locales.length) err(path.basename(dir), 'no locale folders in here at all');
for (const f of strays) warn(path.basename(dir), `loose file "${f.name}" — clips go in a locale folder`);

let totalClips = 0, totalNoSentence = 0;

for (const locale of locales.sort()) {
  const where = locale;
  const ldir = path.join(dir, locale);

  if (!KNOWN.has(locale)) {
    /* The one mistake worth shouting about. A wrong code is not a broken
       build, it is a language that silently never appears. */
    const guess = [...KNOWN.entries()]
      .filter(([, name]) => name.toLowerCase().startsWith(locale.slice(0, 3).toLowerCase()))
      .map(([code, name]) => `${code} (${name})`).slice(0, 3);
    err(where, `not a locale the booth knows${guess.length ? ` — did you mean ${guess.join(', ')}?` : ''}`);
    continue;
  }

  const files = fs.readdirSync(ldir).filter(f => AUDIO.test(f));
  const indexPath = path.join(ldir, 'index.json');

  if (!fs.existsSync(indexPath)) {
    err(where, 'no index.json — the clips will play with no caption and no transcript');
    if (files.length) totalClips += files.length;
    continue;
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (e) {
    err(where, `index.json is not valid JSON — ${e.message}`);
    continue;
  }
  if (!Array.isArray(index)) { err(where, 'index.json must be an array of { file, sentence }'); continue; }
  if (!index.length) { err(where, 'index.json is empty'); continue; }

  const named = new Set();
  let noSentence = 0, probed = 0;

  index.forEach((row, i) => {
    const at = `${where}[${i}]`;
    if (!row || typeof row !== 'object') { err(at, 'not an object'); return; }

    for (const k of FORBIDDEN) {
      if (k in row) err(at, `has "${k}" — contributor identifiers must not ship with the site`);
    }

    if (typeof row.file !== 'string' || !row.file.trim()) { err(at, 'missing "file"'); return; }
    if (/[\\/]/.test(row.file)) { err(at, `"file" is a path — it must be just the name, in this folder`); return; }
    if (!AUDIO.test(row.file)) { err(at, `"${row.file}" is not an audio file the booth plays (mp3, m4a, ogg, wav)`); return; }
    if (named.has(row.file)) { err(at, `"${row.file}" is listed twice`); return; }
    named.add(row.file);

    if (typeof row.sentence !== 'string' || !row.sentence.trim()) {
      noSentence++;
    } else if (row.sentence.trim().length < 10) {
      warn(at, `sentence looks truncated: "${row.sentence}"`);
    }

    if (!indexOnly) {
      const full = path.join(ldir, row.file);
      if (!fs.existsSync(full)) { err(at, `"${row.file}" is in the index but not in the folder`); return; }
      if (fs.statSync(full).size < 2048) { err(at, `"${row.file}" is ${fs.statSync(full).size} bytes — that is not a clip`); return; }
      if (ffprobe && (allDurations || probed < DURATION_SAMPLE)) {
        probed++;
        const d = duration(full);
        if (!isFinite(d)) warn(at, `"${row.file}" — ffprobe could not read it`);
        else if (d < CLIP_SECS - 0.75) err(at, `"${row.file}" is ${d.toFixed(1)}s, short of the ${CLIP_SECS}s the booth asks for`);
        else if (d > CLIP_SECS + 0.75) warn(at, `"${row.file}" is ${d.toFixed(1)}s — the pad will cut it at ${CLIP_SECS}s`);
      }
    }
  });

  if (noSentence) {
    warn(where, `${noSentence} of ${index.length} entries have no sentence — those clips arrive with nothing to caption them`);
  }
  totalNoSentence += noSentence;

  if (!indexOnly) {
    const orphans = files.filter(f => !named.has(f));
    if (orphans.length) warn(where, `${orphans.length} audio file(s) not in index.json, so unused: ${orphans.slice(0, 3).join(', ')}${orphans.length > 3 ? '…' : ''}`);
  }

  if (index.length < WANT_PER_LANG) {
    warn(where, `${index.length} clips; the build takes up to ${WANT_PER_LANG} per language`);
  }

  totalClips += index.length;
  console.log(`  ${locale.padEnd(12)} ${String(index.length).padStart(3)} clips   ${KNOWN.get(locale)}`);
}

// ---- the summary ----------------------------------------------------------

console.log('');
const good = locales.filter(l => KNOWN.has(l)).length;
console.log(`${good} language(s), ${totalClips} clips`);

/* Every language in Listen mode is also a wrong answer for the others, so a
   small set is a thin game rather than a short one. */
if (good && good < 8) {
  console.log(`\nNote: with ${good} languages every question draws its four options from a` +
    `\nvery small pool, so the same names come round again and again. Thirty is` +
    `\ncomfortable; see clips-example/README.md.`);
}
if (totalNoSentence) {
  console.log(`\nNote: ${totalNoSentence} clip(s) have no sentence. They will play, but the pad` +
    `\nwill show no transcript after the answer — which is the caption for anyone` +
    `\nwho could not hear it.`);
}

console.log('');
if (errors) {
  console.log(`${errors} error(s), ${warnings} warning(s) — fix the errors before building.`);
  process.exit(1);
}
console.log(warnings ? `No errors, ${warnings} warning(s).` : 'All good.');
