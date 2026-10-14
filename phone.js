/* The phone page behind the QR code: languages → varieties → initials.

   No country is asked for. A language does not belong to a place, and asking
   made people answer for a country that had nothing to do with what they
   speak. Submissions carry no country at all now; the map scene still draws
   any rows that already had one.

   A visitor picks up to five languages, because "languages I speak" and
   "languages I could record sentences in" are different lists and the second
   one is short. Past the second pick the question changes from "what do you
   speak" to "which would you most want Common Voice to hear" — a limit asked
   as a choice gives better signal than a list of eight, and keeps one person
   from reshaping a wall that has no moderation behind it. */
(function () {
  const CFG = window.BOOTH, CV = window.CV;
  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('en');
  const LANG = {};
  for (const l of CV.langs) LANG[l.l] = l;

  /* Without a backend this page writes to its own browser storage, so a
     submission here never reaches a screen on another device. Say so rather
     than reporting a cheerful success nobody can see. */
  const SHARED = !!window.Store.shared;

  const MAXLANGS = 5;
  // One person, one submission, with every language they chose on it.
  const pick = { initials: '', langs: [] };
  let step = 1;

  const keyOf = l => (l.locale ? l.locale : '!' + String(l.langName).toLowerCase());
  const chosen = l => pick.langs.some(x => keyOf(x) === keyOf(l));

  /* How far Common Voice still has to go for a language — the same order the
     booth screen ranks by. The neediest of someone's languages is the one the
     payoff screen and its next steps are about. */
  const HMAX = CV.langs.reduce((m, l) => Math.max(m, l.h || 0), 1);
  function needOf(locale) {
    const l = locale ? LANG[locale] : null;
    if (!l) return 1;
    if (!(l.h > 0)) return l.o ? 0.88 : 0.94;
    return Math.max(0.06, 0.8 * (1 - Math.log10(1 + l.h) / Math.log10(1 + HMAX)));
  }
  const neediest = () => pick.langs.slice().sort((a, b) => needOf(b.locale) - needOf(a.locale))[0];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtHours = h => (h >= 100 ? nf.format(Math.round(h)) : h >= 10 ? h.toFixed(0) : h.toFixed(1));
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function go(n) {
    step = n;
    document.querySelectorAll('.step').forEach(s => s.classList.remove('on'));
    $('s' + n).classList.add('on');
    [...$('rail').children].forEach((el, i) => el.classList.toggle('on', i < Math.min(n, 3)));
    window.scrollTo(0, 0);
    const first = $('s' + n).querySelector('input');
    if (first && n !== 3) setTimeout(() => { try { first.value = first.value; } catch (e) {} }, 0);
  }
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => go(+b.dataset.back)));

  // ---- step 1: languages --------------------------------------------------
  function langRow(code) {
    const l = LANG[code];
    if (!l) return '';
    const meta = l.h > 0 ? fmtHours(l.h) + ' h recorded' : (l.o ? 'no recordings yet' : 'not collecting yet');
    const sel = chosen({ locale: code }) ? ' sel' : '';
    return '<button class="opt' + (l.h > 0 ? '' : ' new') + sel + '" data-l="' + code + '">' + esc(l.n) +
      '<span class="meta">' + meta + '</span></button>';
  }

  /* What has been chosen so far, above the list it came from, so the count is
     in front of someone at the moment they decide whether to add another. */
  function renderTray() {
    const tray = $('langTray'), n = pick.langs.length;
    tray.hidden = !n;
    tray.innerHTML = pick.langs.map((l, i) =>
      '<button class="' + (l.locale ? '' : 'new') + '" data-rm="' + i + '">' + esc(l.langName) + ' <i>×</i></button>').join('');
    $('toStep2').disabled = !n;
    $('step1Lede').textContent =
      n === 0 ? 'Pick every language you could lend your voice in. Up to five. Look up at the big screen when you finish.'
      : n === 1 ? 'Add another, or continue.'
      : n < MAXLANGS ? 'Which of these would you most want Common Voice to hear? Up to five.'
      : 'Five is the limit — these are the ones the wall will show.';
  }
  $('langTray').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    pick.langs.splice(+b.dataset.rm, 1);
    renderTray();
    renderLangs($('langSearch').value);
  });

  function toggleLang(entry) {
    const at = pick.langs.findIndex(x => keyOf(x) === keyOf(entry));
    if (at >= 0) pick.langs.splice(at, 1);
    else if (pick.langs.length >= MAXLANGS) {
      $('step1Lede').textContent = 'Five is the limit — remove one to add another.';
      return;
    } else pick.langs.push(entry);
    renderTray();
    renderLangs($('langSearch').value);
  }
  /* Without a country there is nothing to suggest from, so the list is simply
     every Common Voice language by name and the search box does the work. A
     ranked default would be a second opinion nobody asked for in a picker. */
  const ALL = CV.langs.slice().sort((a, b) => a.n.localeCompare(b.n));
  function renderLangs(q) {
    const f = fold(q || '');
    let html = '';
    if (!f) {
      html = ALL.map(l => langRow(l.l)).join('');
    } else {
      const hits = CV.langs.filter(l => fold(l.n).includes(f) || l.l.toLowerCase().startsWith(f)).slice(0, 60);
      html = hits.map(l => langRow(l.l)).join('') || '<p class="empty">No Common Voice language matches that.</p>';
    }
    html += '<button class="opt ghost" data-missing="1">My language isn’t here →</button>';
    $('langList').innerHTML = html;
  }
  $('langSearch').addEventListener('input', e => renderLangs(e.target.value));
  $('langList').addEventListener('click', e => {
    const miss = e.target.closest('[data-missing]');
    if (miss) {
      const typed = ($('langSearch').value || '').trim().slice(0, 64);
      if (!typed) {
        $('langSearch').placeholder = 'Type your language, then tap this again';
        $('langSearch').focus();
        return;
      }
      toggleLang({ locale: '', langName: typed, dialect: '', missing: typed });
      $('langSearch').value = '';
      renderLangs('');
      return;
    }
    const b = e.target.closest('[data-l]');
    if (!b) return;
    toggleLang({ locale: b.dataset.l, langName: LANG[b.dataset.l].n, dialect: '', missing: '' });
  });
  $('toStep2').addEventListener('click', openVarieties);

  // ---- step 3: varieties, one group per language --------------------------
  function openVarieties() {
    $('step2Title').textContent = pick.langs.length === 1
      ? 'Which ' + pick.langs[0].langName + '?'
      : 'Which varieties?';
    $('varietyGroups').innerHTML = pick.langs.map((l, i) => {
      const list = CV.dialects[l.locale] || [];
      l.dialect = '';
      return '<div class="vgroup" data-i="' + i + '">' +
        (pick.langs.length > 1 ? '<h3>' + esc(l.langName) + '</h3>' : '') +
        '<div class="chips"><button class="chip sel" data-d="">Just the standard</button>' +
        list.map(d => '<button class="chip" data-d="' + esc(d) + '">' + esc(d) + '</button>').join('') +
        '</div><input type="text" class="vother" placeholder="Or name your own variety" autocomplete="off"></div>';
    }).join('');
    go(2);
  }
  $('varietyGroups').addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const group = b.closest('.vgroup');
    [...group.querySelectorAll('.chip')].forEach(c => c.classList.remove('sel'));
    b.classList.add('sel');
    pick.langs[+group.dataset.i].dialect = b.dataset.d;
    group.querySelector('.vother').value = '';
  });
  $('varietyGroups').addEventListener('input', e => {
    if (!e.target.classList.contains('vother')) return;
    if (e.target.value.trim()) [...e.target.closest('.vgroup').querySelectorAll('.chip')].forEach(c => c.classList.remove('sel'));
  });
  $('toStep3').addEventListener('click', () => {
    [...$('varietyGroups').children].forEach(group => {
      const typed = group.querySelector('.vother').value.trim();
      if (typed) pick.langs[+group.dataset.i].dialect = typed.slice(0, 48);
    });
    go(3);
  });

  // ---- step 4: submit -----------------------------------------------------
  $('submitBtn').addEventListener('click', async () => {
    const btn = $('submitBtn');
    btn.disabled = true; btn.textContent = 'Adding…';
    $('err').hidden = true;
    pick.initials = ($('initials').value || '').trim().slice(0, 4);
    try {
      /* Neediest first. The server repeats langs[0] in the flat fields for
         anything still reading one language, so the order here is what decides
         which one that is — it should be the same one the card leads with. */
      const ordered = pick.langs.slice().sort((a, b) => needOf(b.locale) - needOf(a.locale));
      await window.Store.add({
        initials: pick.initials,
        langs: ordered.map(l => ({ locale: l.locale, langName: l.langName, dialect: l.dialect, missing: l.missing })),
        locale: ordered[0].locale, langName: ordered[0].langName,
        dialect: ordered[0].dialect, missing: ordered[0].missing,
      });
      renderDone();
      paintReach();
      go(4);
    } catch (err) {
      $('err').textContent = err.message + ' — try once more, or ask someone at the booth.';
      $('err').hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Add me to the wall';
    }
  });

  // ---- step 5: payoff -----------------------------------------------------
  function renderDone() {
    // Everything they added is named; the facts and the next steps are about
    // whichever of them Common Voice has the least of.
    const main = neediest();
    const l = main.locale ? LANG[main.locale] : null;
    $('doneSub').textContent = pick.langs
      .map(x => x.langName + (x.dialect ? ' · ' + x.dialect : '')).join('  ·  ');
    const stats = $('doneStats'), callout = $('doneCallout');

    /* Recording is only possible where Common Voice has the language open.
       Everywhere else the useful next step is asking for it, not a page that
       will turn them away. */
    const canRecord = !!(l && l.o);

    if (l && l.h > 0) {
      stats.className = 'statrow';
      stats.innerHTML =
        tile(fmtHours(l.h) + ' h', 'recorded') + tile(fmtHours(l.v) + ' h', 'validated') + tile(nf.format(l.s), 'voices');
      callout.hidden = true;
      $('doneTitle').textContent = 'You\u2019re on the map';
    } else if (canRecord) {
      stats.className = 'statrow gold';
      stats.innerHTML = tile('0 h', 'recorded so far') + tile(nf.format(l.s), 'voices so far');
      callout.hidden = false;
      callout.textContent = main.langName + ' is open for recording on Common Voice and has nothing in it yet. The first voice in the dataset could be yours.';
      $('doneTitle').textContent = 'You\u2019re on the map — and you\u2019re early';
    } else if (l) {
      stats.className = 'statrow gold';
      stats.innerHTML = tile('—', 'not collecting yet');
      callout.hidden = false;
      callout.textContent = main.langName + ' is in the Common Voice language list but not open for recording yet. Languages open when enough people ask for them.';
      $('doneTitle').textContent = 'You\u2019re on the map in gold';
    } else {
      stats.className = 'statrow gold';
      stats.innerHTML = tile('—', 'not in Common Voice');
      callout.hidden = false;
      callout.textContent = main.langName + ' isn\u2019t in Common Voice yet. Languages get added because people ask for them — here is how.';
      $('doneTitle').textContent = 'You\u2019re on the map in gold';
    }

    paintCtas(canRecord);
  }

  /* Two things a visitor can do next: lend their voice, or write sentences in
     their language for other people to read aloud. Writing matters most for the
     languages with the least data, which is exactly who this booth attracts. */
  function paintCtas(canRecord) {
    const main0 = neediest();
    const main = $('ctaMain'), sec = $('ctaSec');
    if (canRecord) {
      main.textContent = 'Sign in and record a few sentences';
      main.href = CFG.loginUrl;
      sec.textContent = 'Write a few sentences in ' + main0.langName;
      sec.href = CFG.writeUrl.replace('{locale}', encodeURIComponent(main0.locale));
    } else {
      main.textContent = l0() ? 'Ask for ' + main0.langName + ' to be opened' : 'Ask for ' + main0.langName + ' to be added';
      main.href = CFG.addLanguageUrl;
      sec.textContent = 'Sign in to Common Voice';
      sec.href = CFG.loginUrl;
    }
  }
  const l0 = () => { const m = neediest(); return !!(m && m.locale && LANG[m.locale]); };

  const tile = (b, s) => '<div><b>' + b + '</b><span>' + s + '</span></div>';

  function paintReach() {
    const el = $('reach');
    el.hidden = SHARED;
    if (!SHARED) el.textContent = 'Saved on this phone only — this site has no shared wall configured, so the booth screen will not show it.';
  }

  $('again').addEventListener('click', () => {
    pick.initials = ''; pick.langs = [];
    $('initials').value = ''; $('langSearch').value = '';
    renderTray();
    renderLangs('');
    go(1);
  });

  // ---- boot ---------------------------------------------------------------
  $('brand').textContent = CFG.event.booth + ' · ' + CFG.event.name;
  $('foot').textContent = 'Common Voice figures from ' + CV.meta.fetched + ' · ' + CV.meta.locales + ' languages · no personal data is stored'
    + (SHARED ? '' : ' · local mode');
  renderTray();
  renderLangs('');
  go(1);
})();
