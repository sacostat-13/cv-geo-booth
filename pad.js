/* The pad: one run, start to finish.

   The whole thing is a small state machine over seven views. Nothing here
   fetches a question or a clip from anywhere — the bank and the audio are
   on the device. The only network calls are the four that let the two pads
   and the screen agree on what is happening: join, pair, round, finish. If
   every one of them fails the run still plays and still teaches; it just
   does not reach the board. That is the right failure for a booth. */
(function () {
  const CFG = window.BOOTH;
  const S = window.BoothStore;
  const Q = window.Quiz;

  const $ = id => document.getElementById(id);
  const body = document.body;

  // ---- station ------------------------------------------------------------

  /* Which of the two pads this is. From the URL once — ?station=B — then
     remembered, so a pad that reloads or is picked up and rebooted comes back
     as itself without anyone retyping anything. */
  const params = new URLSearchParams(location.search);
  let station = (params.get('station') || localStorage.getItem('cvquiz.station') || 'A').toUpperCase().slice(0, 1);
  if (!/^[A-Z]$/.test(station)) station = 'A';
  try { localStorage.setItem('cvquiz.station', station); } catch (e) { /* private mode */ }
  $('station').textContent = 'Station ' + station;

  // ---- run state ----------------------------------------------------------

  let run = null;

  const view = v => { body.className = 'screen-' + v; };

  function newRun(mode) {
    return {
      mode,
      runId: null,
      duel: null,
      questions: [],
      i: 0,
      score: 0,
      correct: 0,
      startedAt: 0,
      answers: [],
      replaysLeft: CFG.run.replays,
      timer: null,
      deadline: 0,
      beat1: null,
      beat2: null
    };
  }

  // ---- start --------------------------------------------------------------

  document.querySelectorAll('.mode').forEach(btn => {
    btn.addEventListener('click', () => begin(btn.dataset.mode));
  });

  const listenAvailable = () => Q.available('listen').length > 0;
  if (!listenAvailable()) {
    /* No clips baked in yet. Saying so plainly beats a Listen button that
       does nothing, and the booth still works: reading is a whole game. */
    const b = $('modeListen');
    b.disabled = true;
    b.style.opacity = '.4';
    b.querySelector('.mode-note').textContent = 'No clips loaded on this pad';
    $('startFoot').textContent = 'Reading mode only on this pad right now.';
  }

  async function begin(mode) {
    if (mode === 'listen' && !listenAvailable()) return;
    run = newRun(mode);
    run.questions = Q.buildRun(mode, CFG.run);
    if (!run.questions.length) return;

    $('pairMode').textContent = mode === 'listen' ? 'listening' : 'reading';
    view('pairing');

    let res;
    try {
      res = await S.join({ station, mode, questions: run.questions.map(q => q.id) });
    } catch (e) {
      // No backend: play solo, silently. The person in front of the pad is
      // not the right audience for a connectivity problem.
      return startQuestions();
    }
    run.runId = res.runId;

    if (res.duel) return enterDuel(res.duel);
    waitForChallenger();
  }

  $('skipPair').addEventListener('click', () => { stopPairPoll(); startQuestions(); });

  let pairPoll = null, pairUntil = 0;
  function waitForChallenger() {
    pairUntil = Date.now() + CFG.duel.windowMs;
    pairPoll = setInterval(async () => {
      if (!run || body.className !== 'screen-pairing') return stopPairPoll();
      if (Date.now() > pairUntil) { stopPairPoll(); return startQuestions(); }
      try {
        const r = await S.pair(station, run.runId);
        if (r && r.duel) { stopPairPoll(); enterDuel(r.duel); }
      } catch (e) { stopPairPoll(); startQuestions(); }
    }, 400);
  }
  function stopPairPoll() { if (pairPoll) clearInterval(pairPoll); pairPoll = null; }

  // ---- duel ---------------------------------------------------------------

  function enterDuel(duel) {
    run.duel = duel;
    // Both pads rebuild the same five questions from the same ids. If this
    // pad somehow cannot — a bank mismatch between devices — it falls back to
    // its own run rather than showing four blank options.
    const shared = Q.runFromIds(duel.questions || []);
    if (shared.length === run.questions.length) run.questions = shared;

    const other = (duel.stations || []).find(s => s !== station) || '?';
    $('readyVs').textContent = `Station ${station} vs Station ${other}`;
    view('ready');

    // Counting down to an absolute instant the server chose, not to a local
    // timer started on arrival: that is what makes the first question land on
    // both pads together.
    const startAt = duel.startAt || (Date.now() + CFG.duel.readyMs);
    const total = Math.max(1500, startAt - Date.now() + CFG.duel.readyMs);
    const t0 = Date.now();
    const tick = setInterval(() => {
      const left = Math.ceil((t0 + total - Date.now()) / 1000);
      $('readyCount').textContent = Math.max(0, left);
      if (left <= 0) { clearInterval(tick); startQuestions(); }
    }, 120);
  }

  // ---- questions ----------------------------------------------------------

  function startQuestions() {
    run.startedAt = Date.now();
    $('dots').innerHTML = run.questions.map(() => '<i></i>').join('');
    $('liveScore').textContent = '0';
    ask();
  }

  function ask() {
    const q = run.questions[run.i];
    const dots = [...$('dots').children];
    dots.forEach((d, i) => d.classList.toggle('now', i === run.i));
    view('question');

    // stimulus
    const listen = q.mode === 'listen';
    $('listenBox').hidden = !listen;
    $('sentence').hidden = listen;
    if (listen) {
      run.replaysLeft = CFG.run.replays;
      $('replaysLeft').textContent = `(${run.replaysLeft} left)`;
      $('replayBtn').hidden = false;
      $('wave').innerHTML = Array.from({ length: 21 }, () => '<i></i>').join('');
      const a = $('audio');
      a.src = q.clip;
      a.currentTime = 0;
      playClip();
    } else {
      const el = $('sentence');
      el.textContent = q.text;
      // Shrink the type for the long ones rather than letting them run under
      // the answer buttons. Measured against the Latin alphabet; dense
      // scripts are short in characters and tall on screen, so they keep
      // their full size.
      const n = q.text.length;
      el.style.setProperty('--fit', n > 105 ? '.72' : n > 85 ? '.82' : n > 65 ? '.92' : '1');
      const L = Q.lang(q.answer);
      // The sentence is set in its own language so the browser picks the right
      // font and the right direction; without this, Arabic and Hebrew render
      // left to right and the question becomes unanswerable.
      el.lang = q.answer;
      el.dir = (L && ['arabic', 'hebrew', 'thaana'].includes(L.script)) ? 'rtl' : 'auto';
    }

    // options. The question id goes on the container: it is what tells a
    // staffer reading a bug report, or a test harness, which of the 1,300
    // questions was on screen.
    const box = $('options');
    box.dataset.qid = q.id;
    box.innerHTML = '';
    q.options.forEach(loc => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = Q.name(loc);
      b.dataset.locale = loc;
      b.addEventListener('click', () => answer(loc, b), { once: true });
      box.appendChild(b);
    });

    startClock();
  }

  // ---- audio --------------------------------------------------------------

  /* A clip that does not load leaves a play button that does nothing, which
     looks like a broken pad rather than a missing file. It should not happen
     — the audio ships with the site — but if it does, say so, and do not let
     the clock punish someone for a question they were never given. */
  function clipFailed() {
    stopClip();
    const note = $('clipNote');
    note.hidden = false;
    clearInterval(run.timer);
    clearTimeout(run.beat1); clearTimeout(run.beat2);
    setTimeout(() => {
      note.hidden = true;
      run.questions.splice(run.i, 1);
      if (run.questions.length > run.i) ask();
      else if (run.answers.length) end();
      else resetToStart();
    }, 1800);
  }

  function playClip() {
    const a = $('audio'), q = run.questions[run.i];
    if (!q || q.mode !== 'listen') return;
    a.onerror = clipFailed;
    $('playBtn').classList.add('playing');
    $('wave').classList.add('on');
    // Clips are cut at build time, but a long one must not be allowed to run
    // past the answer clock, so the page stops it as well.
    const stopAt = setTimeout(stopClip, CFG.run.clipSecs * 1000 + 400);
    a.onended = () => { clearTimeout(stopAt); stopClip(); };
    a.play().catch(() => stopClip());   // autoplay refusal: the button still works
  }
  function stopClip() {
    $('playBtn').classList.remove('playing');
    $('wave').classList.remove('on');
  }
  $('playBtn').addEventListener('click', () => { const a = $('audio'); a.currentTime = 0; playClip(); });
  $('replayBtn').addEventListener('click', () => {
    if (run.replaysLeft <= 0) return;
    run.replaysLeft--;
    $('replaysLeft').textContent = `(${run.replaysLeft} left)`;
    if (run.replaysLeft === 0) $('replayBtn').hidden = true;
    const a = $('audio'); a.currentTime = 0; playClip();
  });

  // ---- clock --------------------------------------------------------------

  const ARC = 119.4; // circumference of the r=19 circle in the markup

  /* A question left unanswered is silence on the wire: the pad says nothing
     between one answer and the next, and the backend eventually decides the
     run is over. That is what took the language off the big screen while
     somebody was still thinking about it. So a pad with a question on screen
     checks in, twice, saying only "still here" — no answer, so the screen's
     reveal panel is untouched.

     Two calls per slow question, and only for slow ones: most are answered
     inside ten seconds and never send any. */
  function beat() {
    if (!run || !run.runId) return;
    S.round({
      station, runId: run.runId,
      score: run.score, answered: run.i
      // deliberately no `answer`: this is a keep-alive, not a result
    }).catch(() => {});
  }

  function startClock() {
    const total = CFG.run.answerMs;
    run.deadline = Date.now() + total;
    clearTimeout(run.beat1); clearTimeout(run.beat2);
    run.beat1 = setTimeout(beat, 11000);
    run.beat2 = setTimeout(beat, 22000);
    const arc = $('clockArc'), num = $('clockNum'), wrap = num.parentElement;
    clearInterval(run.timer);
    run.timer = setInterval(() => {
      const left = run.deadline - Date.now();
      const frac = Math.max(0, left / total);
      arc.style.strokeDashoffset = String(ARC * (1 - frac));
      num.textContent = Math.max(0, Math.ceil(left / 1000));
      wrap.classList.toggle('low', left < 5000);
      if (left <= 0) { clearInterval(run.timer); answer(null, null); }
    }, 100);
  }

  // ---- answering ----------------------------------------------------------

  function answer(chose, btn) {
    clearInterval(run.timer);
    clearTimeout(run.beat1); clearTimeout(run.beat2);
    stopClip();
    const q = run.questions[run.i];
    const msLeft = Math.max(0, run.deadline - Date.now());
    const right = chose === q.answer;
    const gained = Q.scoreAnswer(right, msLeft, CFG.run.answerMs, CFG.run);

    run.score += gained;
    if (right) run.correct++;
    run.answers.push({ id: q.id, answer: q.answer, chose, right, gained });

    const dot = $('dots').children[run.i];
    dot.classList.remove('now');
    dot.classList.add(right ? 'ok' : 'no');
    $('liveScore').textContent = String(run.score);

    // Mark the board before leaving the question, so the eye that is already
    // on the four buttons sees which one was right.
    [...$('options').children].forEach(b => {
      if (b.dataset.locale === q.answer) b.classList.add('ok');
      else if (b === btn) b.classList.add('no');
      else b.classList.add('dim');
    });

    body.classList.add(right ? 'flash-ok' : 'flash-no');
    setTimeout(() => body.classList.remove('flash-ok', 'flash-no'), 520);
    if (right) confetti();

    S.round({
      station, runId: run.runId,
      score: run.score, answered: run.i + 1,
      answer: q.answer, chose: chose || '', correct: right
    }).catch(() => {});

    setTimeout(() => reveal(q, chose, right, gained), 700);
  }

  function reveal(q, chose, right, gained) {
    const v = $('verdict');
    v.textContent = right ? 'Right' : chose ? 'Not that one' : 'Out of time';
    v.classList.toggle('ok', right);
    $('answerName').textContent = Q.name(q.answer);
    const auto = Q.autonym(q.answer);
    $('answerAutonym').textContent = auto;
    $('answerAutonym').hidden = !auto;
    // Right answer gets a fact; wrong answer gets the reason it was a fair
    // mistake. Correcting the specific guess is what stops the wrong option
    // being what the person walks away remembering.
    $('because').textContent = right ? Q.factFor(q.answer) : Q.correctionFor(q.answer, chose);
    $('gain').textContent = gained ? '+' + gained : '';

    const t = $('transcript');
    if (q.mode === 'listen' && q.transcript) {
      t.hidden = false;
      t.textContent = '“' + q.transcript + '”';
      t.lang = q.answer;
    } else {
      t.hidden = true;
    }

    view('reveal');
    setTimeout(() => {
      run.i++;
      if (run.i < run.questions.length) ask();
      else end();
    }, CFG.run.revealMs);
  }

  // ---- end ----------------------------------------------------------------

  let typed = '';

  function end() {
    const of = run.questions.length;
    $('endScore').textContent = String(run.score);
    $('endLine').textContent = `${run.correct} of ${of} right`;
    $('endKicker').textContent = run.duel ? 'Duel' : 'Your run';

    /* The missed languages, shown again with a fact each. The lab finding is
       that a second look a short while after the correction is worth more than
       the correction alone; thirty seconds later on the same screen is the
       only "later" a booth has. */
    const missed = run.answers.filter(a => !a.right);
    const box = $('missed');
    box.innerHTML = missed.length
      ? '<h2>Worth remembering</h2>' + missed.map(a =>
          `<div class="card"><b>${esc(Q.name(a.answer))}</b><span>${esc(Q.factFor(a.answer))}</span></div>`).join('')
      : '<h2>Clean sweep</h2><div class="card"><b>' + esc(Q.name(run.answers[run.answers.length - 1].answer)) +
        '</b><span>' + esc(Q.factFor(run.answers[run.answers.length - 1].answer)) + '</span></div>';

    typed = '';
    paintSlots();
    $('postBoard').disabled = true;
    $('duelBars').hidden = true;
    view('end');
    if (run.duel) watchDuel();
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // initials keypad
  const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const keys = $('keys');
  KEYS.forEach(k => {
    const b = document.createElement('button');
    b.textContent = k;
    b.addEventListener('click', () => { if (typed.length < 3) { typed += k; paintSlots(); } });
    keys.appendChild(b);
  });
  const del = document.createElement('button');
  del.className = 'wide';
  del.textContent = 'Delete';
  del.addEventListener('click', () => { typed = typed.slice(0, -1); paintSlots(); });
  keys.appendChild(del);

  function paintSlots() {
    [...$('slots').children].forEach((s, i) => {
      s.textContent = typed[i] || '\u00A0';   // the underline is the slot; a literal _ doubles it
      s.classList.toggle('filled', !!typed[i]);
    });
    $('postBoard').disabled = typed.length < 2;
  }

  $('skipBoard').addEventListener('click', () => resetToStart());
  $('postBoard').addEventListener('click', post);
  $('again').addEventListener('click', () => resetToStart());

  async function post() {
    $('postBoard').disabled = true;
    const payload = {
      station, runId: run.runId, initials: typed, mode: run.mode,
      score: run.score, correct: run.correct, of: run.questions.length,
      timeMs: Date.now() - run.startedAt,
      duelId: run.duel ? run.duel.id : null,
      missed: run.answers.filter(a => !a.right).map(a => a.answer)
    };
    let res = null;
    try { res = await S.finish(payload); } catch (e) { /* board unreachable */ }

    const v = $('postedVerdict');
    if (!res || !res.ok) {
      v.textContent = 'Saved on this pad';
      v.classList.remove('ok');
      $('postedRank').textContent = typed + ' — ' + run.score;
      $('postedBeat').textContent = 'The board could not be reached just now.';
    } else {
      v.textContent = res.entry.duelWin ? 'Duel won' : "You're on the board";
      v.classList.add('ok');
      $('postedRank').textContent = res.rank ? `#${res.rank} this hour` : `${res.entry.initials} — ${res.entry.score}`;
      $('postedBeat').textContent = (res.beat !== null && res.of > 2)
        ? `Ahead of ${res.beat}% of the last hour.`
        : 'First on the board this hour.';
      if (res.rank === 1) confetti(40);
    }
    view('posted');
    // The pad goes back to the attract screen on its own: the next person in
    // the queue should never have to clear someone else's result.
    clearTimeout(resetTimer);
    resetTimer = setTimeout(resetToStart, 12000);
  }

  let resetTimer = null;
  function resetToStart() {
    clearTimeout(resetTimer);
    clearInterval(run && run.timer);
    if (run) { clearTimeout(run.beat1); clearTimeout(run.beat2); }
    stopPairPoll();
    stopDuelWatch();
    run = null;
    view('start');
  }

  // ---- duel scoreboard ----------------------------------------------------

  let duelWatch = null;
  function watchDuel() {
    stopDuelWatch();
    const other = (run.duel.stations || []).find(s => s !== station);
    let tries = 0;
    duelWatch = setInterval(async () => {
      if (!run || !run.duel || ++tries > 40) return stopDuelWatch();
      let r;
      try { r = await S.pair(station, run.runId); } catch (e) { return stopDuelWatch(); }
      const d = r && r.duel;
      if (!d) return;
      const mine = d.scores[station] || 0, theirs = d.scores[other] || 0;
      const max = Math.max(mine, theirs, 1);
      const bars = $('duelBars');
      bars.hidden = false;
      bars.innerHTML = [[station, mine, 'You'], [other, theirs, 'Station ' + other]]
        .map(([st, val, lbl]) => `<div class="row${d.winner === st ? ' win' : ''}">
            <span>${esc(lbl)}</span>
            <span class="meter"><i style="width:${Math.round(100 * val / max)}%"></i></span>
            <span>${val}</span></div>`).join('');
      if (d.winner) {
        $('endKicker').textContent = d.winner === 'draw' ? 'Duel — a draw'
          : d.winner === station ? 'Duel won' : 'Duel lost';
        stopDuelWatch();
      }
    }, 900);
  }
  function stopDuelWatch() { if (duelWatch) clearInterval(duelWatch); duelWatch = null; }

  // ---- confetti -----------------------------------------------------------

  // Saturated enough to carry against a light background; the pastel end of
  // a confetti palette vanishes on paper.
  const COLOURS = ['#D6283C', '#D9541B', '#117A52', '#2B5FBF', '#B88A00'];
  function confetti(n) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('burst');
    const count = n || 22;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = COLOURS[i % COLOURS.length];
      p.style.setProperty('--spin', (Math.random() * 1080 - 540) + 'deg');
      p.style.animationDuration = (1.1 + Math.random() * 0.9) + 's';
      p.style.animationDelay = (Math.random() * 0.25) + 's';
      box.appendChild(p);
      setTimeout(() => p.remove(), 2600);
    }
  }

  // A pad left alone mid-run goes home rather than sitting on a stranger's
  // half-finished question until someone notices.
  let idleAt = Date.now();
  ['pointerdown', 'keydown'].forEach(e => addEventListener(e, () => { idleAt = Date.now(); }));
  setInterval(() => {
    if (!run) return;
    if (body.className === 'screen-question' && Date.now() - idleAt > 90000) resetToStart();
  }, 5000);

  view('start');
})();
