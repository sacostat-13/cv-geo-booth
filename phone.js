/* The phone page behind the QR code: country → language → variety → initials. */
(function () {
  const CFG = window.BOOTH, CV = window.CV;
  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('en');
  const LANG = {};
  for (const l of CV.langs) LANG[l.l] = l;
  const CNAME = {};
  for (const c of CV.countries) CNAME[c.c] = c.n;

  /* Without a backend this page writes to its own browser storage, so a
     submission here never reaches a screen on another device. Say so rather
     than reporting a cheerful success nobody can see. */
  const SHARED = !!window.Store.shared;

  const pick = { country: '', locale: '', langName: '', dialect: '', initials: '', missing: '' };
  let step = 1;

  const flag = c => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) : '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtHours = h => (h >= 100 ? nf.format(Math.round(h)) : h >= 10 ? h.toFixed(0) : h.toFixed(1));
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function go(n) {
    step = n;
    document.querySelectorAll('.step').forEach(s => s.classList.remove('on'));
    $('s' + n).classList.add('on');
    [...$('rail').children].forEach((el, i) => el.classList.toggle('on', i < Math.min(n, 4)));
    window.scrollTo(0, 0);
    const first = $('s' + n).querySelector('input');
    if (first && n !== 4) setTimeout(() => { try { first.value = first.value; } catch (e) {} }, 0);
  }
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => go(+b.dataset.back)));

  // ---- step 1: country ----------------------------------------------------
  function renderCountries(q) {
    const f = fold(q || '');
    const rows = CV.countries.filter(c => !f || fold(c.n).includes(f) || c.c.toLowerCase() === f);
    $('countryList').innerHTML = rows.length
      ? rows.map(c => '<button class="opt" data-c="' + c.c + '"><span class="flag">' + flag(c.c) + '</span>' + esc(c.n) + '</button>').join('')
      : '<p class="empty">No country matches that. Try the English name.</p>';
  }
  $('countrySearch').addEventListener('input', e => renderCountries(e.target.value));
  $('countryList').addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    pick.country = b.dataset.c;
    $('step2Eyebrow').textContent = flag(pick.country) + ' ' + CNAME[pick.country];
    $('langSearch').value = '';
    renderLangs('');
    go(2);
  });

  // ---- step 2: language ---------------------------------------------------
  function langRow(code, suggested) {
    const l = LANG[code];
    if (!l) return '';
    const meta = l.h > 0 ? fmtHours(l.h) + ' h recorded' : (l.o ? 'no recordings yet' : 'not collecting yet');
    return '<button class="opt' + (l.h > 0 ? '' : ' new') + '" data-l="' + code + '">' + esc(l.n) +
      '<span class="meta">' + meta + '</span></button>';
  }
  function renderLangs(q) {
    const f = fold(q || '');
    let html = '';
    if (!f) {
      const sug = CV.byCountry[pick.country] || [];
      $('step2Lede').textContent = sug.length
        ? 'Common Voice languages spoken in ' + CNAME[pick.country] + '. Search if yours is elsewhere.'
        : 'Nothing listed for ' + CNAME[pick.country] + ' yet — search, or tell us what you speak.';
      html = sug.map(c => langRow(c, true)).join('');
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
      const typed = ($('langSearch').value || '').trim();
      pick.locale = '';
      pick.missing = typed;
      pick.langName = typed;
      if (!typed) {
        $('langSearch').placeholder = 'Type your language, then tap this again';
        $('langSearch').focus();
        return;
      }
      openVariety();
      return;
    }
    const b = e.target.closest('[data-l]');
    if (!b) return;
    pick.locale = b.dataset.l;
    pick.missing = '';
    pick.langName = LANG[pick.locale].n;
    openVariety();
  });

  // ---- step 3: variety ----------------------------------------------------
  function openVariety() {
    $('step3Title').textContent = 'Which ' + pick.langName + '?';
    const list = CV.dialects[pick.locale] || [];
    pick.dialect = '';
    $('dialectOther').value = '';
    $('dialectChips').innerHTML =
      '<button class="chip" data-d="">Just the standard</button>' +
      list.map(d => '<button class="chip" data-d="' + esc(d) + '">' + esc(d) + '</button>').join('');
    go(3);
  }
  $('dialectChips').addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    [...$('dialectChips').children].forEach(c => c.classList.remove('sel'));
    b.classList.add('sel');
    pick.dialect = b.dataset.d;
    $('dialectOther').value = '';
  });
  $('dialectOther').addEventListener('input', e => {
    if (e.target.value.trim()) [...$('dialectChips').children].forEach(c => c.classList.remove('sel'));
  });
  $('toStep4').addEventListener('click', () => {
    const typed = $('dialectOther').value.trim();
    if (typed) pick.dialect = typed.slice(0, 48);
    go(4);
  });

  // ---- step 4: submit -----------------------------------------------------
  $('submitBtn').addEventListener('click', async () => {
    const btn = $('submitBtn');
    btn.disabled = true; btn.textContent = 'Adding…';
    $('err').hidden = true;
    pick.initials = ($('initials').value || '').trim().slice(0, 4);
    try {
      await window.Store.add({
        country: pick.country, locale: pick.locale, langName: pick.langName,
        dialect: pick.dialect, initials: pick.initials, missing: pick.missing,
      });
      renderDone();
      paintReach();
      go(5);
    } catch (err) {
      $('err').textContent = err.message + ' — try once more, or ask someone at the booth.';
      $('err').hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Add me to the map';
    }
  });

  // ---- step 5: payoff -----------------------------------------------------
  function renderDone() {
    const l = pick.locale ? LANG[pick.locale] : null;
    const where = flag(pick.country) + ' ' + CNAME[pick.country];
    $('doneSub').textContent = pick.langName + (pick.dialect ? ' · ' + pick.dialect : '') + ' · ' + where;
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
      callout.textContent = pick.langName + ' is open for recording on Common Voice and has nothing in it yet. The first voice in the dataset could be yours.';
      $('doneTitle').textContent = 'You\u2019re on the map — and you\u2019re early';
    } else if (l) {
      stats.className = 'statrow gold';
      stats.innerHTML = tile('—', 'not collecting yet');
      callout.hidden = false;
      callout.textContent = pick.langName + ' is in the Common Voice language list but not open for recording yet. Languages open when enough people ask for them.';
      $('doneTitle').textContent = 'You\u2019re on the map in gold';
    } else {
      stats.className = 'statrow gold';
      stats.innerHTML = tile('—', 'not in Common Voice');
      callout.hidden = false;
      callout.textContent = pick.langName + ' isn\u2019t in Common Voice yet. Languages get added because people ask for them — here is how.';
      $('doneTitle').textContent = 'You\u2019re on the map in gold';
    }

    paintCtas(canRecord);
  }

  /* Two things a visitor can do next: lend their voice, or write sentences in
     their language for other people to read aloud. Writing matters most for the
     languages with the least data, which is exactly who this booth attracts. */
  function paintCtas(canRecord) {
    const main = $('ctaMain'), sec = $('ctaSec');
    if (canRecord) {
      main.textContent = 'Sign in and record a few sentences';
      main.href = CFG.loginUrl;
      sec.textContent = 'Write a few sentences in ' + pick.langName;
      sec.href = CFG.writeUrl.replace('{locale}', encodeURIComponent(pick.locale));
    } else {
      main.textContent = l0() ? 'Ask for ' + pick.langName + ' to be opened' : 'Ask for ' + pick.langName + ' to be added';
      main.href = CFG.addLanguageUrl;
      sec.textContent = 'Sign in to Common Voice';
      sec.href = CFG.loginUrl;
    }
  }
  const l0 = () => !!(pick.locale && LANG[pick.locale]);

  const tile = (b, s) => '<div><b>' + b + '</b><span>' + s + '</span></div>';

  function paintReach() {
    const el = $('reach');
    el.hidden = SHARED;
    if (!SHARED) el.textContent = 'Saved on this phone only — this site has no shared wall configured, so the booth screen will not show it.';
  }

  $('again').addEventListener('click', () => {
    pick.country = pick.locale = pick.langName = pick.dialect = pick.initials = pick.missing = '';
    $('countrySearch').value = ''; $('initials').value = '';
    renderCountries('');
    go(1);
  });

  // ---- boot ---------------------------------------------------------------
  $('brand').textContent = CFG.event.booth + ' · ' + CFG.event.name;
  $('foot').textContent = 'Common Voice figures from ' + CV.meta.fetched + ' · ' + CV.meta.locales + ' languages · no personal data is stored'
    + (SHARED ? '' : ' · local mode');
  renderCountries('');
})();
