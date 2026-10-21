/* Shared quiz logic: choosing a run, scoring it, and turning a locale into
   the one sentence of Common Voice fact that goes on the screen.

   Used by both the pads and the screen, so the number on the pad and the
   number on the 42" are never two different calculations of the same thing. */
(function () {
  const BANK = window.CV_BANK || { read: [], listen: [] };
  const DATA = window.CV_DATA || { languages: {}, totals: {} };
  const L = DATA.languages;

  const name = loc => (L[loc] && L[loc].name) || loc;
  const autonym = loc => (L[loc] && L[loc].autonym) || '';
  const lang = loc => L[loc] || null;

  const pick = a => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /* ---- levels -------------------------------------------------------------

     A level is not a different bank. It is a different set of wrong answers.

     Easy puts the right answer among three languages from three other
     families; Normal slips one relative in; Hard makes all three relatives,
     so neither the alphabet nor the part of the world gives anything away
     and only the language itself does.

     The options are therefore worked out here rather than baked into the
     bank at build time, as they used to be: three option sets per question
     would be three times the bank for something a dozen lines can derive,
     and it would mean a rebuild — 1.8GB of clips and the whole sentence
     corpus — to change a level.

     They do have to be identical on both pads, though. A duel hands the
     second pad nothing but five question ids and expects it to rebuild the
     same five questions, so nothing below may use Math.random: every draw
     comes from a generator seeded with the question id and the level, which
     gives the same four options in the same order on every device for as
     long as the language table does not change. */

  const LEVEL_KEYS = ['easy', 'normal', 'hard'];
  const levelCfg = key => {
    const all = (window.BOOTH && window.BOOTH.run && window.BOOTH.run.levels) || {};
    return all[key] || all.normal || { key: 'normal', name: 'Normal', multiplier: 2, related: 1, perfect: true };
  };
  const levelKey = k => LEVEL_KEYS.includes(k)
    ? k
    : ((window.BOOTH && window.BOOTH.run && window.BOOTH.run.level) || 'normal');

  /* A family that is a family. "isolate" is the absence of relatives and
     "constructed" is a filing cabinet rather than a clade — Esperanto,
     Interlingua and Ido are not a family anyone could be fairly confused by.
     Neither can supply a related wrong answer. */
  const realFamily = f => f && f !== 'isolate' && f !== 'constructed';

  const FAMILIES = (() => {
    const m = new Map();
    for (const loc in L) {
      const f = L[loc].family;
      if (!m.has(f)) m.set(f, []);
      m.get(f).push(loc);
    }
    return m;
  })();
  const relatives = loc => {
    const l = L[loc];
    if (!l || !realFamily(l.family)) return [];
    return (FAMILIES.get(l.family) || []).filter(x => x !== loc);
  };

  // mulberry32 over an FNV-1a hash of the seed string. Same seed, same run of
  // numbers, on an iPad and on a laptop and on the other pad.
  function seeded(seed) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h = (h + 0x6D2B79F5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Can this question be asked at this level at all? Hard needs three
     relatives and Normal needs one. Basque has none and Mongolian has one,
     so a Hard run must not offer them: four options from four families under
     a label promising the opposite is the booth lying about its own rules.
     Such questions are filtered out of the run rather than downgraded
     silently. At Hard that rules out 38 of the 247 languages. */
  function levelFits(q, level) {
    const need = levelCfg(levelKey(level)).related || 0;
    return need === 0 || relatives(q.answer).length >= need;
  }

  function optionsFor(q, level) {
    const key = levelKey(level);
    const cfg = levelCfg(key);
    const a = L[q.answer];
    if (!a) return q.options || [];

    const rnd = seeded(q.id + '|' + key);
    const chosen = [];
    const draw = pool => {
      const free = pool.filter(l => l !== q.answer && chosen.indexOf(l) === -1);
      if (!free.length) return false;
      chosen.push(free[Math.floor(rnd() * free.length)]);
      return true;
    };

    const all = Object.keys(L);
    const kin = relatives(q.answer);
    for (let i = 0; i < Math.min(cfg.related || 0, 3); i++) if (!draw(kin)) break;

    /* The rest are unrelated. In reading mode one of them shares the script
       where it can: a Georgian sentence with three Latin-alphabet options is
       a test of the alphabet, not of the language, and the alphabet is the
       one clue the booth should not hand over for free. After that, the same
       part of the world where possible, so four options never read as a
       world tour. Every step widens if the pool it wanted is empty — a
       question with three options is not a question. */
    const unrelated = all.filter(l => L[l].family !== a.family);
    if (q.mode === 'read' && chosen.length < 3) {
      draw(unrelated.filter(l => L[l].script === a.script));
    }
    while (chosen.length < 3) {
      const sameRegion = unrelated.filter(l => L[l].region === a.region);
      if (sameRegion.length && rnd() < 0.6 && draw(sameRegion)) continue;
      if (draw(unrelated)) continue;
      if (!draw(all)) break;
    }

    // Seeded shuffle too: the right answer must not sit in the same quadrant
    // every time, and must sit in the same quadrant on both pads of a duel.
    const out = [q.answer].concat(chosen);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /* All five right, on a level where the wrong answers were relatives.
     Easy returns 0 by configuration, not by an exception here. */
  function perfectBonus(level, cfg) {
    const l = levelCfg(levelKey(level));
    if (!l.perfect) return 0;
    const c = cfg || {};
    return (c.pointsCorrect || 100) * (l.multiplier || 1) * (c.perfectBonus || 2);
  }

  /* Questions already served today, so a queue of visitors does not all get
     the same five. Kept in this browser only: the pads are the only things
     that serve questions and each one keeps its own history. */
  const SEEN_KEY = 'cvquiz.seen.v1';
  function seen() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function remember(ids) {
    try {
      const s = [...seen(), ...ids];
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-400)));
    } catch (e) { /* private mode */ }
  }

  function available(mode) {
    const pool = BANK[mode] || [];
    return pool.filter(q => q.options && q.options.length === 4);
  }

  /* A run ramps: the first questions come from languages most people have
     heard spoken, the last from ones they probably have not. Everyone should
     get at least one right, and everyone should meet at least one language
     they did not know Common Voice had.

     Within a tier the pick avoids anything this pad has already served, and
     never repeats a language inside one run — four Slavic questions in a row
     is a worse quiz than five from four continents. */
  function buildRun(mode, opts) {
    const cfg = Object.assign({ questions: 5, easyFirst: 2 }, opts || {});
    const level = levelKey(cfg.level);
    const all = available(mode);
    // Only languages that can carry this level's wrong answers.
    let pool = all.filter(q => levelFits(q, level));
    if (!pool.length) pool = all;
    if (!pool.length) return [];
    const used = seen();
    const takenLocales = new Set();
    const out = [];

    const draw = tiers => {
      let cands = pool.filter(q => tiers.includes(q.tier) && !takenLocales.has(q.answer));
      let fresh = cands.filter(q => !used.has(q.id));
      if (fresh.length) cands = fresh;
      if (!cands.length) {
        cands = pool.filter(q => !takenLocales.has(q.answer));
        if (!cands.length) cands = pool;
      }
      const q = pick(cands);
      takenLocales.add(q.answer);
      out.push(q);
    };

    for (let i = 0; i < cfg.questions; i++) {
      if (i < cfg.easyFirst) draw([3, 2]);
      else if (i === cfg.questions - 1) draw([1]);
      else draw([2, 1]);
    }
    remember(out.map(q => q.id));
    // The options are the level's, not the bank's. The baked-in `options`
    // stay in bank.js as the fallback for a build whose language table and
    // bank have drifted apart.
    return out.map(q => Object.assign({}, q, { level, options: optionsFor(q, level) }));
  }

  const byId = (() => {
    const m = new Map();
    for (const q of BANK.read || []) m.set(q.id, q);
    for (const q of BANK.listen || []) m.set(q.id, q);
    return m;
  })();
  // A duel's second pad is handed the first pad's question ids and has to
  // rebuild the identical run from its own copy of the bank.
  // The level comes with them: both pads must build the same four options.
  const runFromIds = (ids, level) => ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(q => Object.assign({}, q, { level: levelKey(level), options: optionsFor(q, level) }));

  /* 100 for the right answer, plus up to 50 more for how much of the clock
     was left. A wrong answer is worth nothing — not a negative, which only
     teaches people to stop guessing and start waiting. */
  function scoreAnswer(correct, msLeft, totalMs, cfg, level) {
    if (!correct) return 0;
    const c = cfg || { pointsCorrect: 100, pointsSpeedMax: 50 };
    const frac = Math.max(0, Math.min(1, msLeft / totalMs));
    const base = c.pointsCorrect + Math.round(c.pointsSpeedMax * frac);
    // The multiplier takes the speed bonus with it, so being quick is worth
    // more where the question was harder.
    return base * (levelCfg(levelKey(level)).multiplier || 1);
  }

  // ---- facts --------------------------------------------------------------

  const fmtHours = h =>
    h >= 1000 ? Math.round(h).toLocaleString() + ' hours'
      : h >= 10 ? Math.round(h) + ' hours'
        : h >= 1 ? h.toFixed(1) + ' hours'
          : h > 0 ? Math.round(h * 60) + ' minutes'
            : 'nothing';
  const fmtInt = n => (n || 0).toLocaleString();
  const pct = v => Math.round(v * 100) + '%';

  /* The release's own keys, exactly: 'non-binary' hyphenated, a bare
     'transgender', and no trans male/female split. */
  const GENDER_LABEL = {
    male_masculine: 'men',
    female_feminine: 'women',
    transgender: 'transgender contributors',
    'non-binary': 'non-binary contributors',
    intersex: 'intersex contributors',
    do_not_wish_to_say: 'contributors who preferred not to say'
  };
  // Short forms for the screen's bars, where the column is one third of a
  // panel and "contributors who preferred not to say" does not fit.
  const GENDER_SHORT = {
    male_masculine: 'men',
    female_feminine: 'women',
    transgender: 'transgender',
    'non-binary': 'non-binary',
    intersex: 'intersex',
    do_not_wish_to_say: 'preferred not to say'
  };
  const AGE_LABEL = {
    teens: 'teenagers', twenties: 'people in their twenties', thirties: 'people in their thirties',
    fourties: 'people in their forties', fifties: 'people in their fifties',
    sixties: 'people in their sixties', seventies: 'people in their seventies',
    eighties: 'people in their eighties', nineties: 'people in their nineties'
  };
  const label = (map, k) => map[k] || (k ? k.replace(/_/g, ' ') : 'contributors who did not say');

  // The largest named share. `top` cannot just take the first entry any more:
  // the gender list is a fixed roster in a fixed order, not a ranking.
  const top = list => {
    if (!list || !list.length) return null;
    const named = list.filter(x => x.label);
    if (!named.length) return list[0];
    return named.reduce((a, b) => (b.share > a.share ? b : a));
  };

  /* One sentence, under about fifteen words, true, and about this language
     rather than about Common Voice in general. The ones that land are the
     ones with a gap in them — who is missing from the recordings is the
     reason the booth is there. */
  function factFor(locale) {
    const l = lang(locale);
    if (!l) return '';
    const facts = [];

    if (l.validHours >= 1) facts.push(`${l.name} has ${fmtHours(l.validHours)} of validated speech in Common Voice.`);
    else facts.push(`Common Voice has ${fmtHours(l.validHours)} validated in ${l.name} so far.`);

    if (l.users >= 50) facts.push(`${fmtInt(l.users)} people have recorded ${l.name} for Common Voice.`);
    else if (l.users > 0) facts.push(`Just ${fmtInt(l.users)} people have recorded ${l.name} for Common Voice.`);

    const g = top(l.gender);
    if (g && g.share >= 0.5) facts.push(`${pct(g.share)} of ${l.name} recordings come from ${label(GENDER_LABEL, g.label)}.`);

    const a = top(l.age);
    if (a && a.share >= 0.3) facts.push(`${pct(a.share)} of ${l.name} recordings come from ${label(AGE_LABEL, a.label)}.`);

    // Sentences waiting to be read is the one figure that points straight at
    // what the QR code offers: something the visitor could go and do tonight.
    if (l.sentences > 1000) facts.push(`${fmtInt(l.sentences)} ${l.name} sentences are waiting to be read aloud.`);

    if (l.variants && l.variants.length > 2) facts.push(`Common Voice tracks ${l.variants.length} varieties of ${l.name}.`);
    else if (l.accents && l.accents.filter(x => x.label).length > 2) facts.push(`Contributors have tagged ${l.accents.filter(x => x.label).length} accents of ${l.name}.`);

    if (l.sps) facts.push(`${l.name} is one of the languages collecting spontaneous speech, not just read sentences.`);

    return pick(facts);
  }

  /* After a wrong answer, the sentence that makes the mistake worth having
     made. Naming what they picked is the point: the thing people remember is
     the correction of their own guess, not a fact in the abstract. */
  /* "uralic" in the middle of a sentence looks like a typo, and "an Isolate
     language" is not a thing. Family names are proper nouns and two of them
     are not families at all. */
  const familyName = f => f.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('-');
  function familyPhrase(f) {
    if (f === 'isolate') return 'a language isolate — related to nothing else';
    if (f === 'constructed') return 'a constructed language';
    return `${/^[AEIOU]/.test(familyName(f)) ? 'an' : 'a'} ${familyName(f)} language`;
  }

  function correctionFor(answerLoc, choseLoc) {
    const a = lang(answerLoc), c = lang(choseLoc);
    if (!a) return '';
    if (!c || answerLoc === choseLoc) return factFor(answerLoc);
    if (a.family === c.family && a.family !== 'isolate') {
      return `${c.name} and ${a.name} are both ${familyName(a.family)} languages — a fair mistake.`;
    }
    if (a.region === c.region) {
      return `${c.name} is spoken in the same part of the world, but ${a.name} is ${familyPhrase(a.family)}.`;
    }
    return `${a.name} is ${familyPhrase(a.family)}; ${c.name} is ${familyPhrase(c.family)}.`;
  }

  /* The idle screen's facts about Common Voice as a whole. Drawn from the
     same release as everything else, so nothing on the screen is older or
     newer than anything else on it. */
  function totalsCards() {
    const t = DATA.totals || {};
    return [
      { big: fmtInt(Math.round(t.totalValidHrs || 0)), small: 'hours of validated speech in Common Voice' },
      { big: fmtInt(t.locales || 0), small: 'languages have a Common Voice dataset' },
      { big: fmtInt(t.users || 0), small: 'people have donated their voice' },
      { big: fmtInt(t.spsLocales || 0), small: 'languages are collecting spontaneous speech' },
      { big: fmtInt(Math.round(t.totalHrs || 0)), small: 'hours recorded in total, validated or not' }
    ];
  }

  window.Quiz = {
    buildRun, runFromIds, scoreAnswer, available,
    optionsFor, levelFits, levelCfg, levelKey, perfectBonus, LEVEL_KEYS,
    name, autonym, lang, factFor, correctionFor, totalsCards,
    fmtHours, fmtInt, pct, label, GENDER_LABEL, GENDER_SHORT, AGE_LABEL,
    shuffle, data: DATA, bank: BANK
  };
})();
