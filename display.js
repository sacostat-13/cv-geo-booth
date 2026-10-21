/* The screen. It polls one endpoint and redraws itself from the answer, so a
   dropped poll, a reloaded page or a screen plugged in halfway through the
   afternoon all arrive at the same picture.

   It never decides anything. Who is winning, whether a duel is settled, which
   language was just answered — all of it comes from the backend, because the
   pads are reading the same answers and the three devices disagreeing in
   front of a crowd is the one failure that cannot be explained away. */
(function () {
  const CFG = window.BOOTH;
  const S = window.BoothStore;
  const Q = window.Quiz;
  const $ = id => document.getElementById(id);

  $('eventName').textContent = CFG.event.name || '';
  $('release').textContent = [
  (Q.data.totals && Q.data.totals.release) ? Q.data.totals.release.replace('cv-corpus-', 'Common Voice ') : '',
  Q.bank.built ? 'build ' + Q.bank.built : ''
].filter(Boolean).join('  ·  ');

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- the four things the right-hand panel can be -------------------------

  /* Precedence, highest first:
       duel      — two people are racing; nothing outranks that
       reveal    — a language was just answered, and this is the teaching
       playing   — somebody is mid-run but between questions
       idle      — nobody is here
     Each one holds for its own minimum so the panel never strobes between
     states on consecutive polls. */
  const feature = $('feature');
  let showing = '', showingSince = 0;
  function show(card, minMs) {
    const now = Date.now();
    if (card === showing) return;
    if (showing && now - showingSince < (holdFor[showing] || 0)) return;
    showing = card;
    showingSince = now;
    holdFor[card] = minMs || 0;
    feature.dataset.show = card;
  }
  const holdFor = {};

  // ---- board ---------------------------------------------------------------

  let seenInitials = new Set();
  let firstPaint = true;

  /* A score is only readable next to the rules it was made under. One right
     answer on Hard is worth five on Easy, so a 3,100 beside a 420 is not two
     people being better and worse at the same thing — without the chip
     the top of the board is simply unexplainable from three metres. On the
     day board, which adds runs up, it is the toughest level they played. */
  const LEVEL_LETTER = { easy: 'E', normal: 'N', hard: 'H' };

  function paintRows(el, rows, { total, max }) {
    const filled = rows.slice(0, max).map(r => {
      const fresh = !firstPaint && !seenInitials.has(r.initials);
      const runs = total && r.runs > 1 ? `<span class="runs">${r.runs} runs</span>` : '';
      const lv = r.level ? `<span class="lv ${r.level}" title="${r.level}">${LEVEL_LETTER[r.level] || ''}</span>` : '';
      // Five of five with every wrong answer a relative. Rare enough that the
      // star means something, and the one thing on the board worth pointing at.
      const star = r.perfect ? '<span class="star" aria-label="perfect run">★</span>' : '';
      return `<li class="${fresh ? 'fresh' : ''}">
        <span class="n">${r.rank}</span>
        <span class="who">${esc(r.initials)}${lv}${star}${runs}</span>
        <span class="pts">${r.score.toLocaleString()}</span>
      </li>`;
    });

    /* Empty slots rather than an empty panel. A board with three names and
       seven waiting places reads as a board you could be on; three names and
       white space reads as a thing that is over. An empty board is ten
       numbered dashes rather than a sentence apologising for itself. */
    while (filled.length < max) {
      filled.push(`<li class="slot"><span class="n">${filled.length + 1}</span><span class="who">—</span><span class="pts"></span></li>`);
    }
    el.innerHTML = filled.join('');
  }

  function paintBoard(st) {
    paintRows($('hourRows'), st.hour, { max: CFG.screen.hourTop });
    paintRows($('dayRows'), st.day, { total: true, max: CFG.screen.dayTop });
    for (const r of st.hour.concat(st.day)) seenInitials.add(r.initials);
    firstPaint = false;

    // The hour board is a rolling window, not a scheduled reset, so what the
    // header counts down is when the current leader's run ages out of it.
    const oldest = st.hour.length ? Math.min(...st.hour.map(r => r.ts)) : 0;
    const mins = oldest ? Math.max(0, Math.round((oldest + 3600000 - st.now) / 60000)) : 0;
    // Only worth saying once a run is actually close to ageing out; a fresh
    // board announcing "drops in 60m" is noise.
    $('resetIn').textContent = (mins > 0 && mins <= 20) ? `oldest run drops in ${mins}m` : '';

    $('plays').textContent = (st.plays || 0).toLocaleString();
  }

  // ---- reveal --------------------------------------------------------------

  /* Gender is drawn as a roster: every category Common Voice offers, in the
     same order, for every language, including the ones nobody picked. The
     other splits are distributions, where a top-four is the right summary and
     a 0% row is four words of nothing.

     The difference matters because the two answer different questions. Age
     asks how a language's recordings are spread; gender asks who Common Voice
     reached, and there an empty row is the finding rather than the absence of
     one. A booth about under-representation that hides its smallest rows
     because they are small is arguing against itself. */
  function bars(el, list, kind) {
    const roster = kind === 'gender';
    if (!list || !list.length) { el.innerHTML = '<div class="bar"><span class="lbl">not recorded</span></div>'; return; }
    const map = roster ? Q.GENDER_SHORT : kind === 'age' ? Q.AGE_LABEL : {};
    const rows = roster ? list : list.filter(x => x.share >= 0.005).slice(0, 4);
    if (!rows.length) { el.innerHTML = '<div class="bar"><span class="lbl">not recorded</span></div>'; return; }
    el.innerHTML = rows.map(x => {
      const unsaid = !x.label;
      // "did not say" is shown rather than hidden. A quarter of a language's
      // recordings having no age attached is a fact about the dataset, and
      // the dataset's gaps are what the booth is about.
      //
      // x.name is the accent or variant's real name, in its own script, as
      // Common Voice's own language data has it — "Nord-Occidental", not
      // "ca-nwestern". Where there is none, the raw token at least loses its
      // underscores rather than going on the wall as database spelling.
      const label = unsaid ? 'did not say'
        : (x.name || map[x.label] || x.label.replace(/_/g, ' '));
      // None at all, versus some but under half a percent. "0%" on a row
      // where somebody did contribute would be wrong, and "<1%" on a row
      // where nobody did would be worse.
      const none = x.none || x.share === 0;
      const value = none ? 'none' : x.share < 0.005 ? '<1%' : Q.pct(x.share);
      // A hairline for a share too small to see, so the row reads as present
      // rather than as a rendering failure.
      const width = none ? 0 : Math.max(0.8, x.share * 100);
      return `<div class="bar${unsaid ? ' unsaid' : ''}${none ? ' none' : ''}">
        <span class="lbl">${esc(label)}</span><span class="val">${value}</span>
        <span class="track"><i style="width:${width}%"></i></span>
      </div>`;
    }).join('');
  }

  let qrFor = '';
  function paintQr(locale) {
    if (qrFor === locale) return;
    qrFor = locale;
    const url = (CFG.languageUrl || '').replace('{locale}', encodeURIComponent(locale));
    const box = $('qr');
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createImgTag(6, 0);
    } catch (e) {
      box.innerHTML = `<div class="qr-fallback">${esc(url.replace(/^https?:\/\//, ''))}</div>`;
    }
  }

  let revealedId = '';
  function paintReveal(reveal) {
    const key = reveal.locale + ':' + reveal.at;
    if (key === revealedId) return;
    revealedId = key;
    const l = Q.lang(reveal.locale);
    if (!l) return;

    // Three ways this panel gets shown, and it should say which: somebody got
    // it, somebody missed it, or nobody is playing and this is the booth
    // showing a language because it is worth showing.
    $('revealKicker').textContent = reveal.idle ? 'A language in Common Voice'
      : reveal.correct ? 'Got it —'
        : 'The answer was';
    $('revealName').textContent = l.name;
    // 95 of the 247 languages have no autonym sourced yet. An empty line is
    // better than a guess, but it should take no space either.
    $('revealAutonym').textContent = l.autonym || '';
    $('revealAutonym').hidden = !l.autonym;
    $('qrLang').textContent = l.name;

    const stats = [
      `<div class="stat"><b>${Q.fmtHours(l.validHours).replace(/ (hours|minutes)$/, '')}</b><span>${/minutes/.test(Q.fmtHours(l.validHours)) ? 'minutes' : 'hours'} validated</span></div>`,
      `<div class="stat"><b>${Q.fmtInt(l.users)}</b><span>people recorded it</span></div>`,
      `<div class="stat"><b>${Q.fmtInt(l.validated)}</b><span>validated clips</span></div>`
    ];
    if (l.sps) stats.push('<div class="stat flag"><b>Spontaneous speech</b><span>not only read sentences</span></div>');
    $('revealStats').innerHTML = stats.join('');

    bars($('barsGender'), l.gender, 'gender');
    bars($('barsAge'), l.age, 'age');

    // Variants where the release has them, accents otherwise: both answer
    // "how many ways of speaking this does Common Voice know about".
    const named = xs => (xs || []).filter(x => x.label);
    const useVariant = named(l.variants).length > 0;
    const list = useVariant ? l.variants : l.accents;
    // A column reading "did not say — 100%" says nothing. Where nobody has
    // tagged a variety or an accent, the column goes away and the other two
    // widen, rather than holding space for an empty fact.
    const worth = named(list).length > 0;
    $('variantTitle').textContent = useVariant ? 'Varieties recorded' : 'Accents tagged';
    $('variantSplit').hidden = !worth;
    if (worth) bars($('barsVariant'), list, 'plain');

    paintQr(reveal.locale);
  }

  // ---- duel ----------------------------------------------------------------

  /* The band, not a card. It appears above whatever the panel is already
     showing and disappears when the duel ages out; the language underneath
     is never displaced by it. */
  function paintDuel(d) {
    const band = $('duelBand');
    band.hidden = !d;
    feature.classList.toggle('has-duel', !!d);
    if (!d) return;
    // Sorted, so Station A is always the left column. Which pad joined first
    // is not something a crowd should have to work out from the screen.
    const [a, b] = (d.stations || ['A', 'B']).slice().sort();
    // Both pads had to ask for the same level to be paired at all, so the
    // band can name it once for the two of them.
    const dl = (CFG.run.levels && CFG.run.levels[d.level]) || null;
    band.querySelector('.dlabel').textContent = dl ? 'Duel — ' + dl.name : 'Duel';
    const sides = { [a]: $('sideA'), [b]: $('sideB') };
    for (const st of [a, b]) {
      const el = sides[st];
      if (!el) continue;
      el.querySelector('.st').textContent = 'Station ' + st;
      el.querySelector('.sc').textContent = ((d.scores && d.scores[st]) || 0).toLocaleString();
      el.classList.remove('lead', 'won');
    }
    const sa = (d.scores && d.scores[a]) || 0, sb = (d.scores && d.scores[b]) || 0;
    if (!d.winner && sa !== sb) sides[sa > sb ? a : b].classList.add('lead');

    // One short line. The winner is worth a sentence, not a headline — the
    // headline belongs to the language.
    if (d.winner === 'draw') {
      $('duelResult').textContent = 'A draw';
    } else if (d.winner) {
      sides[d.winner] && sides[d.winner].classList.add('won');
      $('duelResult').textContent = 'Station ' + d.winner + ' takes it';
    } else {
      const n = Math.max(...[a, b].map(st => (d.answered && d.answered[st]) || 0));
      $('duelResult').textContent = `question ${Math.min(n + 1, CFG.run.questions)} of ${CFG.run.questions}`;
    }
  }

  // ---- playing / idle ------------------------------------------------------

  $('liveWave').innerHTML = Array.from({ length: 36 }, (_, i) =>
    `<i style="animation-delay:${(i % 7) * 90}ms;animation-duration:${700 + (i % 5) * 120}ms"></i>`).join('');

  function paintPlaying(pads) {
    const live = Object.entries(pads).filter(([, p]) => !p.finished);
    if (!live.length) return;
    const [st, p] = live[0];
    const lvl = (CFG.run.levels && CFG.run.levels[p.level]) || null;
    $('playingLine').textContent = p.mode === 'listen'
      ? 'Someone is listening right now'
      : 'Someone is reading right now';
    $('playingSub').textContent = `Station ${st} — question ` +
      `${Math.min((p.answered || 0) + 1, CFG.run.questions)} of ${CFG.run.questions}` +
      (lvl ? ` — ${lvl.name}` : '');
  }

  /* With nobody playing the screen alternates between one figure about Common
     Voice as a whole and one language in full — the same panel a player gets
     when they answer, demographics and QR and all.

     A number nobody is standing in front of teaches nobody. A language does:
     somebody walking past learns that Common Voice has four hours of Tamazight
     and who recorded them, without having touched a pad. It also means the
     attract loop and the game show the same thing, so the screen is never
     advertising an experience different from the one on offer.

     Which language is weighted toward the ones with least recorded, because
     that is the booth's whole argument — but not exclusively, or the idle
     screen becomes a list of languages a visitor has never heard of with
     nothing to anchor it. Roughly three under-recorded to one familiar. */
  const idleQueue = (() => {
    const all = Object.keys(Q.data.languages);
    const hours = l => Q.lang(l).validHours || 0;
    const needy = all.filter(l => hours(l) < 100);
    const known = all.filter(l => hours(l) >= 100);
    const out = [];
    const a = Q.shuffle(needy), b = Q.shuffle(known);
    while (a.length || b.length) {
      for (let i = 0; i < 3 && a.length; i++) out.push(a.pop());
      if (b.length) out.push(b.pop());
    }
    return out;
  })();

  const cards = Q.totalsCards();
  // Starts true so the first flip lands on the totals card: a screen that
  // comes up on one big number reads as "this is working" faster than one that
  // comes up mid-way through a language nobody has asked about yet.
  let cardAt = 0, langAt = 0, cardSince = 0, idleShowsLang = true;

  // Returns which card the idle rotation wants shown, and only changes its
  // mind once a card has had its time. The loop does the showing.
  function paintIdle(now) {
    if (now - cardSince >= CFG.screen.idleCardMs) {
      cardSince = now;
      idleShowsLang = !idleShowsLang;
      if (idleShowsLang && idleQueue.length) {
        const locale = idleQueue[langAt++ % idleQueue.length];
        // Routed through the same painter as a real answer, with a flag so
        // the kicker does not claim somebody just got it right.
        paintReveal({ locale, idle: true, at: 'idle-' + locale + '-' + langAt });
      } else {
        idleShowsLang = false;
        const c = cards[cardAt++ % cards.length];
        $('idleBig').textContent = c.big;
        $('idleSub').textContent = c.small;
      }
    }
    return idleShowsLang ? 'reveal' : 'idle';
  }

  // ---- the joiner banner ---------------------------------------------------

  let lastEntryAt = 0;
  function joiner(st) {
    if (!st.lastEntry || st.lastEntry.at === lastEntryAt) return;
    lastEntryAt = st.lastEntry.at;
    const e = st.lastEntry;
    const el = $('joiner');
    el.hidden = false;
    el.textContent = `${e.initials} just scored ${e.score} — ${e.correct} of ${e.of} right`;
    el.classList.remove('show');
    void el.offsetWidth;          // restart the animation
    el.classList.add('show');
    clearTimeout(joiner.t);
    joiner.t = setTimeout(() => { el.hidden = true; }, 9000);
  }

  // ---- the loop ------------------------------------------------------------

  let failures = 0;
  async function tick() {
    let st;
    try {
      st = await S.state();
      failures = 0;
    } catch (e) {
      // A booth screen showing an error message is worse than a booth screen
      // showing the last thing it knew. It keeps the picture and keeps trying.
      failures++;
      $('stripLeft').textContent = failures > 5
        ? 'Board offline — the pads still work'
        : 'Take a pad. Listen or read. Five questions.';
      return schedule(CFG.screen.idlePollMs);
    }
    $('stripLeft').textContent = 'Take a pad. Listen or read. Five questions.';

    paintBoard(st);
    joiner(st);

    /* Ages are measured against the server's own clock, which it sends as
       `now`, and never against this screen's. Both ends of the subtraction
       then come from the same machine. Comparing a server timestamp to
       `Date.now()` here was a real bug: three devices at a festival have three
       clocks, and a screen a minute fast declares every pad stale and drops
       the language it should be holding. */
    const age = ts => (ts ? Math.max(0, st.now - ts) : Infinity);

    const anyLive = Object.values(st.pads || {}).some(p => !p.finished && age(p.at) < CFG.screen.padLiveMs);

    paintDuel(st.duel);

    /* A duel no longer takes the panel. It raises the band and leaves the
       precedence below it alone, so the screen goes on showing whichever
       language was last answered — which is the part a visitor takes away.

       While somebody is still mid-run the reveal is sticky: it holds until
       their next answer replaces it, however long they take. A player
       thinking for twenty seconds should not cost the screen the language it
       was explaining — the previous behaviour let the hold expire and fell
       back to a waveform, which is how the big screen appeared to "lose" the
       pad. During a duel the same applies, for both players at once. */
    const revealFresh = st.reveal && (age(st.reveal.at) < CFG.screen.revealMs || anyLive || st.duel);

    if (revealFresh) {
      paintReveal(st.reveal);
      show('reveal', 4000);
    } else if (anyLive) {
      // Only before the first answer of a run — after that the reveal holds.
      paintPlaying(st.pads);
      show('playing', 2000);
    } else {
      show(paintIdle(st.now), 3000);
    }

    schedule(anyLive || st.duel ? CFG.screen.pollMs : CFG.screen.idlePollMs);
  }

  let timer = null;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  // In local mode the three tabs talk over a BroadcastChannel, so the screen
  // can redraw the instant a pad does something instead of waiting for a poll.
  if (S.onChange) S.onChange(() => schedule(60));

  // Nudge the loop when the screen comes back from a sleep or a tab switch,
  // rather than waiting out a timer that was throttled while hidden.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(60); });

  show(paintIdle(Date.now()), 0);
  tick();
})();
