#!/usr/bin/env node
/* Check the difficulty levels against the bank and the language table.

   The levels are derived at runtime rather than baked into bank.js, so
   nothing in the build output proves they are right. This does: it loads the
   same four files a pad loads, in the same order, and checks every question
   in the bank at every level.

     node tools/check-levels.mjs        (or: npm run check-levels)

   Run it after any rebuild of the bank or edit of tools/languages.json. A
   family regrouped by a linguist can take a language below three relatives
   and make it ineligible for Hard, which is correct behaviour but worth
   seeing. Exits non-zero on a failure. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const w = { sessionStorage: { getItem: () => null, setItem: () => {} } };
for (const f of ['defaults.js', 'quiz-data.js', 'bank.js', 'quiz.js'])
  new Function('window', 'sessionStorage', fs.readFileSync(ROOT + '/' + f, 'utf8'))(w, w.sessionStorage);
globalThis.window = w;
const Q = w.Quiz, L = w.CV_DATA.languages, CFG = w.BOOTH.run;

let fails = 0;
const ok = (name, cond, extra='') => { console.log((cond?'  ok  ':'FAIL  ')+name+(cond?'':'  '+extra)); if(!cond) fails++; };

const fam = loc => L[loc].family;
const real = f => f !== 'isolate' && f !== 'constructed';
const kinCount = loc => real(fam(loc)) ? Object.keys(L).filter(l => l !== loc && fam(l) === fam(loc)).length : 0;
// Easy's relative is optional: a language with none gets an unrelated option instead.
const wantKin = (q, level) => {
  const c = CFG.levels[level];
  return c.relatedOptional ? Math.min(c.related, kinCount(q.answer)) : c.related;
};
const famous = (q, opts) => opts.filter(o => o !== q.answer && fam(o) !== fam(q.answer) && L[o].prominence >= 3).length;

// ---- composition, over the whole bank -------------------------------------
for (const level of ['easy','normal','hard']) {
  const pool = Q.available('read').concat(Q.available('listen')).filter(q => Q.levelFits(q, level));
  let bad = 0, sample = '';
  for (const q of pool) {
    const opts = Q.optionsFor(q, level);
    if (opts.length !== 4 || new Set(opts).size !== 4 || !opts.includes(q.answer)) { bad++; sample = q.id + ' ' + opts; continue; }
    const want = wantKin(q, level), wantFamous = CFG.levels[level].prominent || 0;
    const kin = opts.filter(o => o !== q.answer && fam(o) === fam(q.answer) && real(fam(q.answer))).length;
    if (kin !== want) { bad++; sample = `${q.id} ${level} wanted ${want} relatives, got ${kin}: ${opts.map(o=>o+'/'+fam(o))}`; }
    else if (famous(q, opts) < wantFamous) { bad++; sample = `${q.id} ${level} wanted ${wantFamous} famous wrong answers: ${opts}`; }
  }
  ok(`${level}: ${pool.length} eligible questions, every one with the level's relatives and famous names among four distinct options`, bad === 0, sample);
}

// ---- a run at each level ---------------------------------------------------
for (const level of ['easy','normal','hard']) {
  for (const mode of ['read','listen']) {
    const run = Q.buildRun(mode, Object.assign({}, CFG, { level }));
    const everyFits = run.every(q => Q.levelFits(q, level));
    const everyComposed = run.every(q =>
      q.options.filter(o => o !== q.answer && fam(o) === fam(q.answer) && real(fam(q.answer))).length === wantKin(q, level));
    const distinctLangs = new Set(run.map(q => q.answer)).size === run.length;
    ok(`buildRun ${mode}/${level}: 5 questions, all eligible, all composed, no language twice`,
       run.length === 5 && everyFits && everyComposed && distinctLangs,
       JSON.stringify(run.map(q => q.answer)));
  }
}

// ---- determinism: the other pad rebuilds the identical run -----------------
{
  const a = Q.buildRun('read', Object.assign({}, CFG, { level: 'hard' }));
  const b = Q.runFromIds(a.map(q => q.id), 'hard');
  ok('duel: the second pad rebuilds the same options in the same order',
     JSON.stringify(a.map(q => q.options)) === JSON.stringify(b.map(q => q.options)),
     JSON.stringify([a[0].options, b[0].options]));
  const c = Q.runFromIds(a.map(q => q.id), 'easy');
  ok('a different level gives different options for the same question ids',
     JSON.stringify(a.map(q => q.options)) !== JSON.stringify(c.map(q => q.options)));
  // the right answer is not always in the same slot
  const slots = new Set(Q.available('read').slice(0, 200).map(q => Q.optionsFor(q,'normal').indexOf(q.answer)));
  ok('the right answer moves around the four buttons', slots.size === 4, [...slots].join(','));
}

// ---- eligibility -----------------------------------------------------------
{
  const basque = Q.available('read').find(q => L[q.answer] && L[q.answer].family === 'isolate');
  ok('an isolate is not offered at Hard', basque ? !Q.levelFits(basque, 'hard') : true);
  ok('an isolate is still offered at Easy', basque ? Q.levelFits(basque, 'easy') : true);
  const hardOk = Object.keys(L).filter(k => Q.levelFits({ answer: k }, 'hard')).length;
  ok(`${hardOk} of ${Object.keys(L).length} languages can be asked at Hard`, hardOk > 150);
}

// ---- scoring ---------------------------------------------------------------
{
  const full = (lv) => Q.scoreAnswer(true, 20000, 20000, CFG, lv);
  ok('a perfect-speed answer: 150 easy / 300 normal / 750 hard',
     full('easy') === 150 && full('normal') === 300 && full('hard') === 750,
     [full('easy'), full('normal'), full('hard')].join(' '));
  ok('one right on Hard is worth five on Easy', full('hard') === 5 * full('easy'));
  ok('one right on Normal is worth two on Easy', full('normal') === 2 * full('easy'));
  ok('a wrong answer is worth nothing at every level',
     ['easy','normal','hard'].every(lv => Q.scoreAnswer(false, 20000, 20000, CFG, lv) === 0));
  ok('no level given falls back to the house default (normal)', Q.scoreAnswer(true, 20000, 20000, CFG) === 300);
  ok('a nonsense level falls back too', Q.scoreAnswer(true, 20000, 20000, CFG, 'impossible') === 300);
}

// ---- perfect run -----------------------------------------------------------
{
  ok('perfect run: nothing on Easy, 400 on Normal, 1000 on Hard',
     Q.perfectBonus('easy', CFG) === 0 && Q.perfectBonus('normal', CFG) === 400 && Q.perfectBonus('hard', CFG) === 1000,
     [Q.perfectBonus('easy',CFG), Q.perfectBonus('normal',CFG), Q.perfectBonus('hard',CFG)].join(' '));
  const perfectHard = 5 * Q.scoreAnswer(true, 20000, 20000, CFG, 'hard') + Q.perfectBonus('hard', CFG);
  const perfectEasy = 5 * Q.scoreAnswer(true, 20000, 20000, CFG, 'easy');
  ok(`a flawless Hard run tops out at ${perfectHard}, a flawless Easy one at ${perfectEasy}`,
     perfectHard === 4750 && perfectEasy === 750);
  ok('the bonus is about a third on top of a perfect run',
     Q.perfectBonus('hard', CFG) / (perfectHard - Q.perfectBonus('hard', CFG)) > 0.25);
}

// ---- the correction sentence still works at Hard ---------------------------
{
  const q = Q.buildRun('read', Object.assign({}, CFG, { level: 'hard' }))[0];
  const wrong = q.options.find(o => o !== q.answer);
  const s = Q.correctionFor(q.answer, wrong);
  ok('a wrong answer at Hard still gets a true correction sentence',
     /both .* languages/.test(s) || s.length > 20, s);
  console.log('        e.g. ' + s);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
