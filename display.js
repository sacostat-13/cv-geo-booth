/* The booth screen: rotating world, one submission celebrated at a time. */
(function () {
  const CFG = window.BOOTH, D = CFG.display;
  const LANG = {};
  for (const l of window.CV.langs) LANG[l.l] = l;
  const COUNTRY = {};
  for (const c of window.CV.countries) COUNTRY[c.c] = c.n;

  const $ = id => document.getElementById(id);

  /* Is this screen reading a wall that phones can actually reach? Without a
     backend every page keeps its submissions in its own browser, so a phone can
     "succeed" and the screen never hears about it. Say so, loudly. */
  const SHARED = !!window.Store.shared;
  const canvas = $('map'), ctx = canvas.getContext('2d');

  const state = {
    mode: D.projection === 'map' ? 'map' : 'globe',
    rotLon: 10, rotLat: 14, zoom: 1,
    tgtLon: 10, tgtLat: 14, tgtZoom: 1,
    spinning: true,
    pins: {},            // country -> [{lon,lat,id,missing,ts}]
    counts: {},          // country -> number
    langCount: {},       // locale|!name -> number
    langInfo: {},        // locale|!name -> { key, locale, name, countries:Set, dialects:Set }
    langOrder: [],       // the order languages joined the wall, for the idle tour
    rotIndex: -1,        // where the idle tour has got to
    rotUntil: 0,
    touring: false,      // a language is holding the screen right now
    restUntil: 0,        // until when the globe just turns, showing nothing
    focus: null,         // { country, kind: 'submission' | 'rotation' | 'pick' }
    picked: null,        // country code the viewer clicked
    pickUntil: 0,
    seen: new Set(),
    queue: [],
    active: null,        // submission being celebrated
    activeStart: 0,
    activePin: null,
    holdUntil: 0,
    total: 0, newLangs: 0,
    offline: false,
    // The second scene: the same room drawn as languages rather than places.
    scene: 'geo',        // "geo" or "wall" — press V
    focusLang: null,     // which language the wall is holding, if any
    justKeys: [],        // the languages a live arrival just added to
    wallRows: null,      // cached, rebuilt on ingest rather than per frame
  };

  // ---------- formatting ---------------------------------------------------
  const nf = new Intl.NumberFormat('en');
  const fmtHours = h => (h >= 100 ? nf.format(Math.round(h)) : h >= 10 ? h.toFixed(0) : h.toFixed(1));
  const flag = c => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) : '');
  const langKey = l => (l.locale ? l.locale : '!' + (l.missing || l.langName).toLowerCase());

  /* One submission is one person, who may have given several languages. Rows
     written before that was possible carry a single language at the top level,
     so both shapes are read the same way from here on. */
  function langsOf(s) {
    return Array.isArray(s.langs) && s.langs.length
      ? s.langs
      : [{ locale: s.locale, langName: s.langName, dialect: s.dialect, missing: s.missing }];
  }

  // ---------- ingest -------------------------------------------------------
  function ingest(rows) {
    rows.forEach(s => {
      if (state.seen.has(s.id)) return;
      state.seen.add(s.id);
      // One voice is one person. Each of their languages counts once toward
      // that language, so a block on the wall always means one person.
      state.total++;
      const ls = langsOf(s);
      for (const L of ls) {
        const k = langKey(L);
        if (!state.langCount[k]) {
          state.langCount[k] = 0;
          if (!L.locale) state.newLangs++;
          state.langInfo[k] = { key: k, locale: L.locale, name: L.missing || (LANG[L.locale] ? LANG[L.locale].n : L.langName), countries: new Set(), dialects: new Set() };
          state.langOrder.push(k);
        }
        state.langCount[k]++;
        if (s.country) state.langInfo[k].countries.add(s.country);
        if (L.dialect) state.langInfo[k].dialects.add(L.dialect);
      }
      /* The phone stopped asking where people are from. Rows saved before that
         still carry a country and still get a pin; new ones simply don't, and
         the map scene draws whatever is there. */
      if (s.country) {
        state.counts[s.country] = (state.counts[s.country] || 0) + 1;
        const list = (state.pins[s.country] ||= []);
        const spot = window.Geo.placePin(s.country, s.id, list.map(p => [p.lon, p.lat]));
        if (spot) list.push({ lon: spot[0], lat: spot[1], id: s.id, missing: ls.some(L => !L.locale), ts: s.ts });
      }
      // Everything in the first batch is history; only live arrivals queue up.
      if (booted) state.queue.push(s);
    });
    // A burst (or a backend hiccup that delivers a batch at once) must not turn
    // into a quarter of an hour of replay: keep the newest, count the rest.
    if (state.queue.length > 25) state.queue = state.queue.slice(-25);
    state.wallRows = null;
    paintCounts();
    paintTicker();
  }

  let booted = false;

  // ---------- the celebration queue ---------------------------------------
  function holdFor() {
    const q = state.queue.length;
    if (q <= D.queuePressure) return D.highlightMs;
    const over = Math.min(1, (q - D.queuePressure) / 10);
    return Math.round(D.highlightMs + (D.minHighlightMs - D.highlightMs) * over);
  }

  /* Point the camera at a country. Used by all three things that take the
     screen: a new submission, the idle tour, and a viewer clicking the map. */
  function flyTo(code, zoom) {
    const c = window.Geo.byCode[code];
    if (!c) return;
    state.tgtLon = c.k[0];
    state.tgtLat = Math.max(-58, Math.min(58, c.k[1]));
    state.tgtZoom = zoom;
    state.spinning = false;
  }

  function celebrate(s) {
    state.active = s;
    state.activeStart = performance.now();
    state.holdUntil = state.activeStart + holdFor();
    state.picked = null;
    const list = s.country ? (state.pins[s.country] || []) : [];
    state.activePin = list.find(p => p.id === s.id) || null;
    state.focus = s.country ? { country: s.country, kind: 'submission' } : null;
    // Several blocks land at once; the screen holds the one Common Voice has
    // the least of, because that is the one worth reading out.
    const ls = langsOf(s);
    state.justKeys = ls.map(langKey);
    const main = primaryOf(ls);
    state.focusLang = langKey(main);
    if (s.country) flyTo(s.country, state.mode === 'globe' ? 1.3 : 1.75);
    paintCard(s);
    setStatus('Just added · ' + (s.country ? (COUNTRY[s.country] || s.country) : (main.missing || main.langName)), false);
  }

  function restingStatus() {
    if (!SHARED) return ['Not connected to a shared wall — this screen only', true];
    if (state.offline) return ['Reconnecting to the booth', true];
    return ['Listening for the room', false];
  }

  /* Hand the screen back to the turning globe. The booth is a thing people
     walk past, and a map that never just turns stops reading as a map. */
  function rest(now) {
    state.touring = false;
    state.focus = null;
    state.focusLang = null;
    state.spinning = true;
    state.tgtZoom = 1;
    state.tgtLat = 14;
    state.restUntil = now + (D.idleRestMs || 25000);
    // The card stays up while the globe turns, but it is no longer news.
    if ($('cardFrom').textContent === 'Just added') $('cardFrom').textContent = 'Most recent';
    setStatus.apply(null, restingStatus());
  }

  /* One language from the room, then back to the globe. Showing the whole list
     end to end would leave the globe barely visible, so the tour takes one
     turn at a time. A real submission always interrupts. */
  function tourStep(now) {
    if (!state.langOrder.length) {
      paintEmpty();
      rest(now);
      return;
    }
    state.touring = true;
    state.rotIndex = (state.rotIndex + 1) % state.langOrder.length;
    const info = state.langInfo[state.langOrder[state.rotIndex]];
    state.rotUntil = now + (D.idleTourMs || 7000);
    state.focusLang = info.key;

    // A language the room gave without a country has nowhere to fly to; on the
    // map the globe simply keeps turning behind its card.
    const countries = [...info.countries];
    const country = countries.length ? (countries[state.rotIndex % countries.length] || countries[0]) : null;
    state.focus = country ? { country, kind: 'rotation' } : null;
    if (country) flyTo(country, state.mode === 'globe' ? 1.18 : 1.5);
    paintTourCard(info, country);
    setStatus.apply(null, restingStatus());
  }

  function clearPick() {
    state.picked = null;
    rest(performance.now());
  }

  /* The screen is in exactly one of four states, in this order of precedence:
     celebrating an arrival, holding a country someone tapped, showing one
     language from the room, or simply turning. */
  function tickQueue(now) {
    // A live arrival beats everything, and a backlog is worked through one at
    // a time rather than collapsed.
    if (state.queue.length && (!state.active || now >= state.holdUntil)) {
      celebrate(state.queue.shift());
      return;
    }
    if (state.active) {
      if (now < state.holdUntil) return;
      state.active = null;
      state.activePin = null;
      rest(now);
      return;
    }
    if (state.picked) {
      if (now < state.pickUntil) return;
      clearPick();
      return;
    }
    if (state.touring) {
      if (now < state.rotUntil) return;
      rest(now);
      return;
    }
    if (now >= state.restUntil) tourStep(now);
  }

  // ---------- the card -----------------------------------------------------
  /* The four states a language can be in, shared by the submission card and the
     idle tour so a language reads the same whichever one put it on screen. */
  function fillFacts(name, locale, inRoom) {
    const card = $('card'), stats = $('cardStats'), note = $('cardNote');
    const l = locale ? LANG[locale] : null;
    if (l && l.h > 0) {
      card.classList.remove('new');
      stats.innerHTML =
        statTile(fmtHours(l.h) + ' h', 'recorded') +
        statTile(nf.format(l.s), 'speakers') +
        statTile(nf.format(inRoom), 'in the room');
      note.hidden = l.v > 0;
      if (!note.hidden) note.textContent = 'None of it validated yet — listening is how it gets there.';
    } else if (l && l.o) {
      card.classList.add('new');
      stats.innerHTML = statTile('0 h', 'recorded so far') + statTile(nf.format(inRoom), 'in the room');
      note.hidden = false;
      note.textContent = name + ' is open for recording on Common Voice and has nothing in it yet. The first voice could be yours.';
    } else if (l) {
      card.classList.add('new');
      stats.innerHTML = statTile('—', 'not collecting yet') + statTile(nf.format(inRoom), 'in the room');
      note.hidden = false;
      note.textContent = name + ' is in the Common Voice language list but not open for recording yet. It opens when enough people ask.';
    } else {
      card.classList.add('new');
      stats.innerHTML = statTile('—', 'not in Common Voice') + statTile(nf.format(inRoom), 'in the room');
      note.hidden = false;
      note.textContent = name + ' isn\u2019t in Common Voice yet. Languages get added because someone asks.';
    }
    card.classList.add('on');
  }

  /* The neediest of someone's languages: what their card is about, and where
     the wall's spotlight goes. */
  function primaryOf(ls) {
    return ls.slice().sort((a, b) => needOf(b.locale).need - needOf(a.locale).need)[0];
  }

  function paintCard(s) {
    const ls = langsOf(s);
    const main = primaryOf(ls);
    const nameOf = L => L.missing || (L.locale && LANG[L.locale] ? LANG[L.locale].n : L.langName);
    const name = nameOf(main);
    $('cardFrom').textContent = 'Just added';
    // Everything they gave is named; the facts below are the neediest one's.
    $('cardLang').textContent = ls.map(nameOf).join(' · ');
    $('cardLang').classList.toggle('multi', ls.length > 1);
    const varieties = ls.map(L => L.dialect).filter(Boolean);
    $('cardVariety').textContent = varieties.join(' · ');
    const where = s.country ? flag(s.country) + ' ' + (COUNTRY[s.country] || s.country) : '';
    $('cardFlag').textContent = [where, s.initials].filter(Boolean).join(' · ');
    fillFacts(name, main.locale, state.langCount[langKey(main)] || 1);
  }

  /* One language on the idle tour: the same facts, plus every country and
     variety the room has given it so far. */
  function paintTourCard(info, country) {
    $('cardFrom').textContent = 'In the room';
    $('cardLang').textContent = info.name;
    const varieties = [...info.dialects];
    $('cardVariety').textContent = varieties.length
      ? varieties.slice(0, 3).join(' · ') + (varieties.length > 3 ? ' +' + (varieties.length - 3) : '')
      : '';
    const countries = [...info.countries];
    $('cardFlag').textContent = countries.length
      ? countries.slice(0, 4).map(c => (flag(c) + ' ' + (COUNTRY[c] || c)).trim()).join('  ')
        + (countries.length > 4 ? '  +' + (countries.length - 4) : '')
      : '';
    fillFacts(info.name, info.locale, state.langCount[info.key] || 1);
  }

  /* Someone touched a country: show how it stands, from the room's own
     submissions first and from Common Voice where the room has nothing. */
  function paintPickCard(code) {
    const card = $('card');
    const name = COUNTRY[code] || code;
    const here = Object.values(state.langInfo).filter(i => i.countries.has(code));
    here.sort((a, b) => (state.langCount[b.key] || 0) - (state.langCount[a.key] || 0));
    const voices = state.counts[code] || 0;

    $('cardFrom').textContent = 'On this map';
    $('cardLang').textContent = name;
    $('cardVariety').textContent = '';
    $('cardFlag').textContent = flag(code);

    const stats = $('cardStats'), note = $('cardNote');
    if (here.length) {
      card.classList.remove('new');
      stats.innerHTML = statTile(nf.format(voices), voices === 1 ? 'voice from here' : 'voices from here') +
        statTile(nf.format(here.length), here.length === 1 ? 'language' : 'languages');
      note.hidden = false;
      note.innerHTML = '<div class="list">' + here.slice(0, 6).map(i => {
        const l = i.locale ? LANG[i.locale] : null;
        const fact = l && l.h > 0 ? fmtHours(l.h) + ' h in Common Voice' : l ? 'no recordings yet' : 'not in Common Voice';
        return '<div><b>' + esc(i.name) + '</b><span>' + fact + '</span></div>';
      }).join('') + '</div>';
    } else {
      card.classList.add('new');
      const cvLangs = (window.CV.byCountry[code] || []).map(c => LANG[c]).filter(Boolean);
      cvLangs.sort((a, b) => b.h - a.h);
      stats.innerHTML = statTile('0', 'voices from here') +
        statTile(nf.format(cvLangs.length), 'in Common Voice');
      note.hidden = false;
      note.innerHTML = 'Nobody from ' + esc(name) + ' yet.' + (cvLangs.length
        ? '<div class="list">' + cvLangs.slice(0, 5).map(l =>
            '<div><b>' + esc(l.n) + '</b><span>' + (l.h > 0 ? fmtHours(l.h) + ' h' : 'no recordings yet') + '</span></div>').join('') + '</div>'
        : '');
    }
    card.classList.add('on');
  }

  const statTile = (b, s) => '<div class="stat"><b>' + b + '</b><span>' + s + '</span></div>';

  function setStatus(text, warn) {
    $('statusText').textContent = text;
    $('statusDot').classList.toggle('warn', !!warn);
  }

  function paintCounts() {
    $('nVoices').textContent = nf.format(state.total);
    $('nLangs').textContent = nf.format(Object.keys(state.langCount).length);
    $('nNew').textContent = nf.format(state.newLangs);
  }

  function paintTicker() {
    const rows = Object.entries(state.langCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
    $('ticker').innerHTML = rows.map(([k, n]) => {
      const isNew = k[0] === '!';
      const name = isNew ? k.slice(1).replace(/\b\w/g, m => m.toUpperCase()) : (LANG[k] ? LANG[k].n : k);
      return '<span class="chip' + (isNew ? ' new' : '') + '">' + esc(name) + ' <b>' + n + '</b></span>';
    }).join('');
  }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* How far Common Voice still has to go for one language, 0 to 1. This is the
     booth's actual subject: a language nobody has recorded needs the screen more
     than one with three thousand hours, however many people here happen to speak
     it. Ranking on voices in the room would hand the wall to English, which is
     the opposite of what the booth is for. */
  const HMAX = window.CV.langs.reduce((m, l) => Math.max(m, l.h || 0), 1);
  const LOGMAX = Math.log10(1 + HMAX);
  function needOf(locale) {
    const l = locale ? LANG[locale] : null;
    if (!l) return { need: 1, note: 'not in Common Voice', hours: 0, bar: 0 };
    if (!(l.h > 0)) return { need: l.o ? 0.88 : 0.94, note: l.o ? 'no recordings yet' : 'not open yet', hours: 0, bar: 0 };
    // The bar is log-scaled: linear, English alone would be the whole track and
    // every language that needs the booth would be a sliver against it.
    return {
      need: Math.max(0.06, 0.8 * (1 - Math.log10(1 + l.h) / LOGMAX)),
      note: fmtHours(l.h) + ' h',
      hours: l.h,
      bar: Math.log10(1 + l.h) / LOGMAX,
    };
  }

  /* What the language wall draws: every language in the room, the ones Common
     Voice is missing most first. Ties go to the language more of the room
     speaks, then to whoever got here first, so the order is stable between
     frames and never reshuffles on its own. */
  function wallRows() {
    if (state.wallRows) return state.wallRows;
    const rows = Object.values(state.langInfo).map(i => {
      const n = needOf(i.locale);
      return {
        key: i.key,
        name: i.name,
        locale: i.locale,
        count: state.langCount[i.key] || 0,
        missing: !i.locale,
        need: n.need,
        note: n.note,
        hours: n.hours,
        bar: n.bar,
      };
    });
    const order = new Map(state.langOrder.map((k, n) => [k, n]));
    rows.sort((a, b) => b.need - a.need || b.count - a.count || order.get(a.key) - order.get(b.key));
    return (state.wallRows = rows);
  }

  /* Someone touched a language on the wall. Same facts as the idle tour, said
     the same way — the wall's answer to tapping a country on the map. */
  function paintWallPickCard(info) {
    const countries = [...info.countries];
    paintTourCard(info, countries[0]);
    $('cardFrom').textContent = 'On this wall';
  }

  // ---------- rendering ----------------------------------------------------
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  function camera() {
    const base = window.Geo.makeCamera(state.mode, W, H, state.rotLon, state.rotLat, state.zoom);
    if (state.mode === 'globe') return base;
    // Flat map: pan so the focused point sits near the middle.
    const p = base.project(state.rotLon, state.rotLat);
    const dx = W / 2 - p[0], dy = H / 2 - p[1];
    const k = state.zoom > 1.001 ? 1 : 0;
    return {
      mode: 'map', scale: base.scale, radius: base.radius,
      project(lon, lat) { const q = base.project(lon, lat); return [q[0] + dx * k, q[1] + dy * k]; },
      visible() { return true; },
    };
  }

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const COL = {};
  function readColors() {
    for (const n of ['--sea', '--land', '--land-edge', '--grid', '--voice', '--ember', '--gold', '--fg']) COL[n] = css(n);
  }

  function drawGraticule(cam) {
    ctx.strokeStyle = COL['--grid']; ctx.lineWidth = 1; ctx.globalAlpha = .55;
    ctx.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) {
      let started = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        if (!cam.visible(lon, lat)) { started = false; continue; }
        const p = cam.project(lon, lat);
        if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      let started = false;
      for (let lat = -85; lat <= 85; lat += 4) {
        if (!cam.visible(lon, lat)) { started = false; continue; }
        const p = cam.project(lon, lat);
        if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  /* Countries worth drawing for the current camera — on the globe, anything
     whose whole extent is behind the horizon is skipped. */
  const DEGR = Math.PI / 180;
  function onScreen(cam) {
    if (cam.mode !== 'globe') return window.WORLD;
    const sinLat = Math.sin(state.rotLat * DEGR), cosLat = Math.cos(state.rotLat * DEGR);
    return window.WORLD.filter(c => {
      const a = sinLat * Math.sin(c.k[1] * DEGR) + cosLat * Math.cos(c.k[1] * DEGR) * Math.cos((c.k[0] - state.rotLon) * DEGR);
      return Math.acos(Math.max(-1, Math.min(1, a))) / DEGR - (c.r || 1) <= 90;
    });
  }

  function intensity(n) {
    // 0 pins -> plain land; more voices -> warmer toward the accent.
    const t = Math.min(1, Math.log(1 + n) / Math.log(1 + D.pinMax * 2.5));
    return 'rgba(56,227,192,' + (0.10 + t * 0.62).toFixed(3) + ')';
  }

  function drawWorld(cam, now) {
    // ground
    if (state.mode === 'globe') {
      const r = cam.radius;
      const g = ctx.createRadialGradient(W / 2 - r * .3, H / 2 - r * .35, r * .1, W / 2, H / 2, r);
      g.addColorStop(0, '#171229'); g.addColorStop(1, COL['--sea']);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(56,227,192,.22)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.clip();
    } else {
      ctx.fillStyle = COL['--sea'];
      ctx.fillRect(0, 0, W, H);
    }
    drawGraticule(cam);

    const focusCode = state.focus ? state.focus.country : null;
    const focusKind = state.focus ? state.focus.kind : null;
    ctx.lineWidth = state.mode === 'globe' ? 0.9 : 0.8;
    for (const c of onScreen(cam)) {
      const n = state.counts[c.c] || 0;
      ctx.beginPath();
      for (const ring of c.g) window.Geo.tracePath(ctx, ring, cam);
      ctx.fillStyle = n > 0 ? intensity(n) : COL['--land'];
      ctx.fill('evenodd');
      ctx.strokeStyle = COL['--land-edge'];
      ctx.stroke();
      if (c.c === focusCode) {
        // A new submission flares in warm; the idle tour and a viewer's tap glow
        // in the quieter accent, so an actual arrival still stands out.
        const hot = focusKind === 'submission';
        const t = hot ? Math.min(1, (now - state.activeStart) / 650) : 1;
        ctx.save();
        ctx.fillStyle = hot
          ? 'rgba(255,138,91,' + (0.18 + 0.3 * t).toFixed(3) + ')'
          : 'rgba(56,227,192,0.22)';
        ctx.fill('evenodd');
        ctx.strokeStyle = hot ? COL['--ember'] : COL['--voice'];
        ctx.lineWidth = hot ? 2.2 : 1.8;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = hot ? 26 * t : 16;
        ctx.stroke();
        ctx.restore();
      }
    }
    if (state.mode === 'globe') ctx.restore();
  }

  function drawPins(cam, now) {
    const activeId = state.activePin ? state.activePin.id : null;
    const r = Math.max(2.2, cam.radius * 0.0075);
    for (const code in state.pins) {
      const list = state.pins[code];
      if (list.length > D.pinMax) {
        // Too many to read as dots: the country's fill already carries the count.
        const p = cam.project(window.Geo.byCode[code].k[0], window.Geo.byCode[code].k[1]);
        if (cam.visible(window.Geo.byCode[code].k[0], window.Geo.byCode[code].k[1])) {
          ctx.font = '600 ' + Math.round(cam.radius * 0.038) + 'px "IBM Plex Sans",system-ui,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(10,8,18,.6)';
          ctx.beginPath(); ctx.arc(p[0], p[1], cam.radius * 0.034, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = COL['--fg'];
          ctx.fillText(String(list.length), p[0], p[1] + 1);
        }
        continue;
      }
      for (const pin of list) {
        if (!cam.visible(pin.lon, pin.lat)) continue;
        const p = cam.project(pin.lon, pin.lat);
        const isActive = pin.id === activeId;
        const col = pin.missing ? COL['--gold'] : COL['--voice'];
        let rr = r;
        if (isActive) {
          const t = Math.min(1, (now - state.activeStart) / 520);
          const bounce = t < 1 ? 1 + (1 - t) * 2.4 * Math.exp(-4 * t) : 1;
          rr = r * 1.7 * bounce;
          const ripple = ((now - state.activeStart) % 1500) / 1500;
          ctx.beginPath();
          ctx.arc(p[0], p[1], r * 2 + ripple * cam.radius * 0.09, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,138,91,' + (0.5 * (1 - ripple)).toFixed(3) + ')';
          ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? COL['--ember'] : col;
        ctx.shadowColor = isActive ? COL['--ember'] : col;
        ctx.shadowBlur = isActive ? 22 : 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  /* Hit-testing. Rather than inverting two different projections, rebuild each
     country's path under the live camera and ask the canvas whether the point
     is inside it. Exact for the globe and the flat map alike — reading pixel
     colours instead would misreport every antialiased border. */
  const hit = document.createElement('canvas');
  const hitCtx = hit.getContext('2d');   // deliberately left untransformed
  function countryAt(x, y) {
    if (!W || !H) return null;
    // isPointInPath only answers for points inside the canvas, and a detached
    // canvas defaults to 300x150 — size it to the map or every hit misses.
    if (hit.width !== W || hit.height !== H) { hit.width = W; hit.height = H; }
    const cam = camera();
    const list = onScreen(cam);
    for (const c of list) {
      const path = new Path2D();
      for (const ring of c.g) window.Geo.tracePath(path, ring, cam);
      if (hitCtx.isPointInPath(path, x, y, 'evenodd')) return c;
    }
    // Nothing exactly under the pointer: allow a near miss, so the small
    // countries are still reachable with a finger.
    let best = null, bestD = 18 * 18;
    for (const c of list) {
      if (!cam.visible(c.k[0], c.k[1])) continue;
      const p = cam.project(c.k[0], c.k[1]);
      const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // shortest-path easing for longitude
  function easeLon(cur, tgt, k) {
    let d = ((tgt - cur + 540) % 360) - 180;
    return cur + d * k;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last) / 1000; last = now;
    tickQueue(now);
    if (state.spinning && state.mode === 'globe') {
      state.rotLon += D.idleSpinSpeed * dt;
      state.tgtLon = state.rotLon;
    } else {
      // Once a tour stop has settled, keep drifting slowly so the screen never
      // looks frozen between languages. A submission or a tap holds still.
      if (state.focus && state.focus.kind === 'rotation' && state.mode === 'globe'
          && Math.abs(((state.tgtLon - state.rotLon + 540) % 360) - 180) < 3) {
        state.tgtLon += 0.45 * dt;
      }
      state.rotLon = easeLon(state.rotLon, state.tgtLon, 1 - Math.pow(0.001, dt));
    }
    state.rotLat += (state.tgtLat - state.rotLat) * (1 - Math.pow(0.002, dt));
    state.zoom += (state.tgtZoom - state.zoom) * (1 - Math.pow(0.004, dt));
    if (state.spinning && state.mode === 'map') {
      state.rotLon = easeLon(state.rotLon, 10, 1 - Math.pow(0.02, dt));
    }

    if (state.scene === 'wall') {
      const rows = wallRows();
      window.Wall.draw(ctx, W, H, now, {
        entries: rows,
        focusKey: state.focusLang,
        justKeys: state.justKeys,
        justStart: state.activeStart,
        dt,
      });
    } else {
      ctx.clearRect(0, 0, W, H);
      const cam = camera();
      drawWorld(cam, now);
      drawPins(cam, now);
    }
    requestAnimationFrame(frame);
  }

  // ---------- QR -----------------------------------------------------------
  /* Where the phone page lives. Left blank in config, it is wherever this page
     is served from — so the same commit works on a Netlify preview, the
     production site and a custom domain with nothing to edit. */
  function phoneUrl() {
    if (CFG.phoneUrl) return CFG.phoneUrl;
    if (location.protocol === 'file:') return '';
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }

  function paintQR() {
    const url = phoneUrl();
    const box = $('qr');
    $('qrUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

    if (!url) {
      $('qrFallback').textContent = 'Open this page over http to generate the QR code';
      return;
    }
    if (typeof window.qrcode === 'function') {
      try {
        const qr = window.qrcode(0, 'M');          // 0 = pick the smallest version that fits
        qr.addData(url);
        qr.make();
        const n = qr.getModuleCount();
        const pad = 2;
        // Draw one canvas pixel per module-pixel and let the canvas keep that
        // exact size on screen. Scaling a QR code down blurs the module edges
        // and phones stop reading it, so the box flexes instead of the code.
        const target = Math.round((state.scene === 'wall' ? 152 : 210) * (window.innerHeight / 1080));
        const cell = Math.max(3, Math.floor(target / (n + pad * 2)));
        const c = document.createElement('canvas');
        c.width = c.height = (n + pad * 2) * cell;
        c.style.width = c.style.height = c.width + 'px';
        const g = c.getContext('2d');
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#120F1C';
        for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
          if (qr.isDark(r, col)) g.fillRect((col + pad) * cell, (r + pad) * cell, cell, cell);
        }
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', 'QR code to ' + url);
        box.innerHTML = ''; box.appendChild(c);
        return;
      } catch (e) {
        console.warn('[booth] QR generation failed', e);
      }
    }
    if (window.BOOTH_QR) {
      box.innerHTML = '<img alt="QR code to the Common Voice booth page" src="' + window.BOOTH_QR + '">';
      return;
    }
    $('qrFallback').textContent = url.replace(/^https?:\/\//, '');
  }

  /* Nothing has been added yet: invite rather than show an empty frame. */
  function paintEmpty() {
    const card = $('card');
    card.classList.remove('new');
    $('cardFrom').textContent = 'The wall is empty';
    $('cardLang').textContent = 'Be the first';
    $('cardVariety').textContent = '';
    $('cardFlag').textContent = '';
    $('cardStats').innerHTML =
      statTile(nf.format(window.CV.langs.length), 'languages in Common Voice') +
      statTile('0', 'in the room');
    $('cardNote').hidden = false;
    $('cardNote').textContent = SHARED
      ? 'Scan the code and tell the wall what you speak.'
      : 'This screen is not connected to a shared wall yet, so phones cannot reach it. Set SUPABASE_URL and SUPABASE_ANON_KEY and redeploy.';
    card.classList.add('on');
  }

  // ---------- boot ---------------------------------------------------------
  readColors();
  resize();
  paintQR();
  $('eyebrow').textContent = CFG.event.booth + ' · ' + CFG.event.name;
  // The first frame is drawn before the store answers — and it may never answer,
  // if the backend is unreachable at open. Either way the screen shows an
  // invitation rather than the markup's placeholders.
  paintEmpty();
  rest(performance.now());

  window.Store.subscribe(rows => {
    ingest(rows);
    if (!booted) {
      booted = true;
      const lastRow = rows[rows.length - 1];
      if (lastRow) { paintCard(lastRow); $('cardFrom').textContent = 'Most recent'; }
      else paintEmpty();
    }
  });
  window.addEventListener('booth:offline', () => {
    state.offline = true;
    if (!state.active) setStatus.apply(null, restingStatus());
  });
  window.addEventListener('booth:online', () => {
    state.offline = false;
    if (!state.active) setStatus.apply(null, restingStatus());
  });

  function pickAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const c = countryAt(clientX - r.left, clientY - r.top);
    if (!c) { if (state.picked) clearPick(); return; }
    state.picked = c.c;
    state.pickUntil = performance.now() + (D.pickHoldMs || 20000);
    state.focus = { country: c.c, kind: 'pick' };
    flyTo(c.c, state.mode === 'globe' ? 1.25 : 1.6);
    paintPickCard(c.c);
    setStatus((COUNTRY[c.c] || c.c), false);
  }
  function pickLangAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const key = window.Wall.hitAt(clientX - r.left, clientY - r.top);
    const info = key ? state.langInfo[key] : null;
    if (!info) { if (state.picked) clearPick(); return; }
    state.picked = key;
    state.pickUntil = performance.now() + (D.pickHoldMs || 20000);
    state.focus = null;
    state.focusLang = key;
    paintWallPickCard(info);
    setStatus(info.name, false);
  }

  function setScene(next) {
    state.scene = next;
    document.body.classList.toggle('scene-wall', next === 'wall');
    $('h1').textContent = next === 'wall'
      ? 'What is Common Voice still missing?'
      : 'Which languages are in this room?';
    $('call').innerHTML = next === 'wall'
      ? 'Add what you<br>speak'
      : 'Scan to put your<br>language on the map';
    $('hint').textContent = next === 'wall'
      ? 'Tap a language for its standing \u00b7 V map \u00b7 F fullscreen'
      : 'Tap a country for its languages \u00b7 P projection \u00b7 V languages \u00b7 F fullscreen';
    if (state.picked) clearPick();
    paintQR();   // the wall gives the QR less room, so the code is redrawn to fit
  }

  canvas.addEventListener('click', e => (state.scene === 'wall' ? pickLangAt : pickAt)(e.clientX, e.clientY));
  canvas.style.cursor = 'pointer';

  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'escape' && state.picked) { clearPick(); return; }
    if (k === 'v') { setScene(state.scene === 'wall' ? 'geo' : 'wall'); return; }
    if (k === 'p') { state.mode = state.mode === 'globe' ? 'map' : 'globe'; state.zoom = state.tgtZoom = 1; }
    if (k === 'f') { const el = document.documentElement; if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
  });

  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  });

  setScene(D.scene === 'wall' ? 'wall' : 'geo');

  requestAnimationFrame(frame);
  window.BoothDisplay = { state, countryAt, pickAt, pickLangAt, setScene, wallRows };
})();
