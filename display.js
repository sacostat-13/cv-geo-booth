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
  const SHARED = CFG.mode === 'supabase' && !!CFG.supabase.url && !!CFG.supabase.anonKey;
  const canvas = $('map'), ctx = canvas.getContext('2d');

  const state = {
    mode: D.projection === 'map' ? 'map' : 'globe',
    rotLon: 10, rotLat: 14, zoom: 1,
    tgtLon: 10, tgtLat: 14, tgtZoom: 1,
    spinning: true,
    pins: {},            // country -> [{lon,lat,id,missing,ts}]
    counts: {},          // country -> number
    langCount: {},       // locale|!name -> number
    seen: new Set(),
    queue: [],
    active: null,        // submission being celebrated
    activeStart: 0,
    activePin: null,
    holdUntil: 0,
    total: 0, newLangs: 0,
    offline: false,
  };

  // ---------- formatting ---------------------------------------------------
  const nf = new Intl.NumberFormat('en');
  const fmtHours = h => (h >= 100 ? nf.format(Math.round(h)) : h >= 10 ? h.toFixed(0) : h.toFixed(1));
  const flag = c => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) : '');
  const langKey = s => (s.locale ? s.locale : '!' + (s.missing || s.langName).toLowerCase());

  // ---------- ingest -------------------------------------------------------
  function ingest(rows) {
    rows.forEach(s => {
      if (state.seen.has(s.id)) return;
      state.seen.add(s.id);
      state.total++;
      const k = langKey(s);
      if (!state.langCount[k]) { state.langCount[k] = 0; if (!s.locale) state.newLangs++; }
      state.langCount[k]++;
      state.counts[s.country] = (state.counts[s.country] || 0) + 1;
      const list = (state.pins[s.country] ||= []);
      const spot = window.Geo.placePin(s.country, s.id, list.map(p => [p.lon, p.lat]));
      if (spot) list.push({ lon: spot[0], lat: spot[1], id: s.id, missing: !s.locale, ts: s.ts });
      // Everything in the first batch is history; only live arrivals queue up.
      if (booted) state.queue.push(s);
    });
    // A burst (or a backend hiccup that delivers a batch at once) must not turn
    // into a quarter of an hour of replay: keep the newest, count the rest.
    if (state.queue.length > 25) state.queue = state.queue.slice(-25);
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

  function celebrate(s) {
    state.active = s;
    state.activeStart = performance.now();
    state.holdUntil = state.activeStart + holdFor();
    state.spinning = false;
    const list = state.pins[s.country] || [];
    state.activePin = list.find(p => p.id === s.id) || null;
    const c = window.Geo.byCode[s.country];
    if (c) {
      state.tgtLon = c.k[0];
      state.tgtLat = Math.max(-58, Math.min(58, c.k[1]));
      state.tgtZoom = state.mode === 'globe' ? 1.3 : 1.75;
    }
    paintCard(s, true);
    setStatus('Just added · ' + (COUNTRY[s.country] || s.country), false);
  }

  function restingStatus() {
    if (!SHARED) return ['Not connected to a shared wall — this screen only', true];
    if (state.offline) return ['Reconnecting to the booth', true];
    return ['Listening for the room', false];
  }

  function idle() {
    state.active = null;
    state.activePin = null;
    state.spinning = true;
    state.tgtZoom = 1;
    state.tgtLat = 14;
    $('cardFrom').textContent = 'Most recent';
    setStatus.apply(null, restingStatus());
  }

  function tickQueue(now) {
    if (state.active && now < state.holdUntil) return;
    if (state.queue.length) { celebrate(state.queue.shift()); return; }
    if (state.active) idle();
  }

  // ---------- the card -----------------------------------------------------
  function paintCard(s) {
    const card = $('card');
    const l = s.locale ? LANG[s.locale] : null;
    const name = s.missing || (l ? l.n : s.langName);
    $('cardFrom').textContent = 'Just added';
    $('cardLang').textContent = name;
    $('cardVariety').textContent = s.dialect ? s.dialect : '';
    $('cardFlag').textContent = (flag(s.country) + ' ' + (COUNTRY[s.country] || s.country) + (s.initials ? ' · ' + s.initials : '')).trim();
    const inRoom = state.langCount[langKey(s)] || 1;
    const stats = $('cardStats');
    const note = $('cardNote');

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
      note.textContent = name + ' isn’t in Common Voice yet. Languages get added because someone asks.';
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

    const activeCode = state.active ? state.active.country : null;
    ctx.lineWidth = state.mode === 'globe' ? 0.9 : 0.8;
    const DEGR = Math.PI / 180;
    const sinLat = Math.sin(state.rotLat * DEGR), cosLat = Math.cos(state.rotLat * DEGR);
    for (const c of window.WORLD) {
      const n = state.counts[c.c] || 0;
      if (cam.mode === 'globe') {
        // Skip anything whose whole extent sits behind the horizon.
        const a = sinLat * Math.sin(c.k[1] * DEGR) + cosLat * Math.cos(c.k[1] * DEGR) * Math.cos((c.k[0] - state.rotLon) * DEGR);
        const ang = Math.acos(Math.max(-1, Math.min(1, a))) / DEGR;
        if (ang - (c.r || 1) > 90) continue;
      }
      ctx.beginPath();
      for (const ring of c.g) window.Geo.tracePath(ctx, ring, cam);
      ctx.fillStyle = n > 0 ? intensity(n) : COL['--land'];
      ctx.fill('evenodd');
      ctx.strokeStyle = COL['--land-edge'];
      ctx.stroke();
      if (c.c === activeCode) {
        const t = Math.min(1, (now - state.activeStart) / 650);
        ctx.save();
        ctx.fillStyle = 'rgba(255,138,91,' + (0.18 + 0.3 * t).toFixed(3) + ')';
        ctx.fill('evenodd');
        ctx.strokeStyle = COL['--ember'];
        ctx.lineWidth = 2.2;
        ctx.shadowColor = COL['--ember'];
        ctx.shadowBlur = 26 * t;
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

  // shortest-path easing for longitude
  function easeLon(cur, tgt, k) {
    let d = ((tgt - cur + 540) % 360) - 180;
    return cur + d * k;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last) / 1000; last = now;
    tickQueue(now);
    if (state.spinning && state.mode === 'globe') state.tgtLon = state.rotLon + D.idleSpinSpeed * dt * 60 / 60;
    if (state.spinning && state.mode === 'globe') state.rotLon += D.idleSpinSpeed * dt;
    else state.rotLon = easeLon(state.rotLon, state.tgtLon, 1 - Math.pow(0.001, dt));
    state.rotLat += (state.tgtLat - state.rotLat) * (1 - Math.pow(0.002, dt));
    state.zoom += (state.tgtZoom - state.zoom) * (1 - Math.pow(0.004, dt));
    if (state.spinning && state.mode === 'map') {
      state.rotLon = easeLon(state.rotLon, 10, 1 - Math.pow(0.02, dt));
    }

    ctx.clearRect(0, 0, W, H);
    const cam = camera();
    drawWorld(cam, now);
    drawPins(cam, now);
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
        const target = Math.round(210 * (window.innerHeight / 1080));
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
  setStatus.apply(null, restingStatus());

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

  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'p') { state.mode = state.mode === 'globe' ? 'map' : 'globe'; state.zoom = state.tgtZoom = 1; }
    if (k === 'f') { const el = document.documentElement; if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
  });

  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  });

  requestAnimationFrame(frame);
  window.BoothDisplay = { state };
})();
