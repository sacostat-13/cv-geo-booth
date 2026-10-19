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
    const pool = available(mode);
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
    return out;
  }

  const byId = (() => {
    const m = new Map();
    for (const q of BANK.read || []) m.set(q.id, q);
    for (const q of BANK.listen || []) m.set(q.id, q);
    return m;
  })();
  // A duel's second pad is handed the first pad's question ids and has to
  // rebuild the identical run from its own copy of the bank.
  const runFromIds = ids => ids.map(id => byId.get(id)).filter(Boolean);

  /* 100 for the right answer, plus up to 50 more for how much of the clock
     was left. A wrong answer is worth nothing — not a negative, which only
     teaches people to stop guessing and start waiting. */
  function scoreAnswer(correct, msLeft, totalMs, cfg) {
    if (!correct) return 0;
    const c = cfg || { pointsCorrect: 100, pointsSpeedMax: 50 };
    const frac = Math.max(0, Math.min(1, msLeft / totalMs));
    return c.pointsCorrect + Math.round(c.pointsSpeedMax * frac);
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

  const GENDER_LABEL = {
    male_masculine: 'men', female_feminine: 'women', intersex: 'intersex contributors',
    transgender_male: 'trans men', transgender_female: 'trans women',
    non_binary: 'non-binary contributors', do_not_wish_to_say: 'contributors who preferred not to say'
  };
  const AGE_LABEL = {
    teens: 'teenagers', twenties: 'people in their twenties', thirties: 'people in their thirties',
    fourties: 'people in their forties', fifties: 'people in their fifties',
    sixties: 'people in their sixties', seventies: 'people in their seventies',
    eighties: 'people in their eighties', nineties: 'people in their nineties'
  };
  const label = (map, k) => map[k] || (k ? k.replace(/_/g, ' ') : 'contributors who did not say');

  const top = list => (list && list.length ? list.find(x => x.label) || list[0] : null);

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
    name, autonym, lang, factFor, correctionFor, totalsCards,
    fmtHours, fmtInt, pct, label, GENDER_LABEL, AGE_LABEL,
    shuffle, data: DATA, bank: BANK
  };
})();
