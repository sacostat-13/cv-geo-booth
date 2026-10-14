/* The language wall — a second scene for the same booth state.

   The map answers "where are we from". This answers "what do we speak", which
   is the question the booth is actually asking, and it does not need anyone to
   pin a language to a country. Press V to switch; the geo wall is untouched.

   Two things decide what the wall looks like.

   What gets the screen is need, not headcount: a column's height is how far
   Common Voice still has to go for that language, and the blocks stacked inside
   it are the voices this room has given it — the start of filling the gap. Rank
   the room by how many speak each language and the wall hands itself to
   English, which is the opposite of what the booth is for.

   What to do with the long tail: a festival room gives a handful of languages
   Common Voice knows well and then forty it barely has. Shrinking everything
   until it all fits turns the wall into grey noise; cutting the tail off tells
   exactly the wrong story. So there are two tiers — the languages Common Voice
   is missing most stand as columns, the well-recorded rest pack into a field of
   tiles beneath them. Nothing is dropped, and the idle tour lifts one language
   out of the field at a time, which is how a language with a single voice still
   gets its name across a 42" screen. */
(function () {
  const COL = {};
  (function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const n of ['--sea', '--land', '--land-edge', '--grid', '--voice', '--ember', '--gold', '--fg', '--muted', '--dim'])
      COL[n] = cs.getPropertyValue(n).trim();
  })();

  const UI = '"IBM Plex Sans",system-ui,sans-serif';
  const MONO = '"IBM Plex Mono",ui-monospace,monospace';
  const DISP = '"Zilla Slab",Georgia,serif';

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }

  /* The band the wall gets. The four DOM corners own the rest of the screen,
     so these insets mirror body.scene-wall in display.html. */
  function region(W, H) {
    const u = H / 1080;
    const x = 56 * u, top = 182 * u, bottom = 356 * u;
    return { x, y: top, w: W - x * 2, h: Math.max(140, H - top - bottom), u };
  }

  // ---------- layout -------------------------------------------------------
  /* Targets only: the animated boxes chase these, so a re-rank slides instead
     of jumping and the wall never changes shape in a single frame. */
  function computeLayout(entries, R) {
    const out = new Map();
    const L = entries.length;
    if (!L) return out;

    const gap = Math.max(9, R.w * 0.007);
    // Wide enough for a language's name and what Common Voice has of it.
    const minColW = 168, maxColW = 250;
    let n = Math.min(L, Math.max(1, Math.floor((R.w + gap) / (minColW + gap))));
    const tail = L - n;

    const labelH = Math.max(50, 70 * R.u);
    const headH = tail ? Math.max(R.h * 0.56, R.h - 236 * R.u) : R.h;
    const fieldY = R.y + headH + gap * 2.6;
    const fieldH = tail ? (R.y + R.h) - fieldY : 0;

    const colW = Math.min(maxColW, (R.w - gap * (n - 1)) / n);
    const startX = R.x + (R.w - (n * colW + (n - 1) * gap)) / 2;
    const base = R.y + headH - labelH;
    const shaftArea = Math.max(40, base - R.y);

    /* One block per voice, the same size in every column so a block means the
       same thing wherever it is — which is what lets someone point at theirs.
       Thin stripes still read as counted things from across a room; a smear
       does not, so only below ~2px does a column give up and go solid. */
    let maxVoices = 1;
    for (let i = 0; i < n; i++) maxVoices = Math.max(maxVoices, entries[i].count);
    const unit = Math.min(22, shaftArea / Math.max(7, maxVoices));
    const bgap = unit > 7 ? Math.min(3.4, unit * 0.22) : unit > 3 ? 1.2 : 0.6;
    const bh = Math.max(1.4, unit - bgap);
    const solid = bh < 2.2;

    for (let i = 0; i < n; i++) {
      const e = entries[i];
      const fillH = Math.min(shaftArea, e.count * bh + (e.count - 1) * bgap);
      const shaftH = Math.max(20, Math.min(shaftArea, (e.need || 0) * shaftArea));
      out.set(e.key, {
        tier: 'col', rank: i, x: startX + i * (colW + gap), y: base - Math.max(shaftH, fillH),
        w: colW, h: Math.max(shaftH, fillH), fillH,
        base, bh, bgap, solid, labelH,
      });
    }
    if (!tail) return out;

    /* The field. Sized down until every one of them fits — density is the
       point, so the answer to "too many" is smaller tiles, never fewer. */
    const rest = entries.slice(n);
    const restMax = rest.reduce((m, e) => Math.max(m, e.count), 1);
    const g = gap * 0.6;
    const sizeOf = (c, s0) => s0 * (0.6 + 0.4 * Math.sqrt(c / restMax));
    let s = Math.min(62, fieldH * 0.44), rows = null;
    for (; s >= 10; s -= 1.5) {
      rows = pack(rest, s, sizeOf, R.w, g);
      const total = rows.reduce((t, r) => t + r.h, 0) + (rows.length - 1) * g;
      if (total <= fieldH) break;
    }
    const totalH = rows.reduce((t, r) => t + r.h, 0) + (rows.length - 1) * g;
    let y = fieldY + Math.max(0, (fieldH - totalH) / 2);
    for (const row of rows) {
      let x = R.x + (R.w - row.w) / 2;
      for (const it of row.items) {
        out.set(it.e.key, { tier: 'tile', rank: 999, x, y: y + (row.h - it.s) / 2, w: it.s, h: it.s });
        x += it.s + g;
      }
      y += row.h + g;
    }
    out.meta = { tail, fieldY: fieldY + Math.max(0, (fieldH - totalH) / 2) };
    return out;
  }

  function pack(list, s0, sizeOf, maxW, g) {
    const rows = [];
    let row = { items: [], w: 0, h: 0 };
    for (const e of list) {
      const s = sizeOf(e.count, s0);
      if (row.items.length && row.w + g + s > maxW) { rows.push(row); row = { items: [], w: 0, h: 0 }; }
      row.w += row.items.length ? g + s : s;
      row.items.push({ e, s });
      row.h = Math.max(row.h, s);
    }
    if (row.items.length) rows.push(row);
    return rows;
  }

  // ---------- drawing ------------------------------------------------------
  const boxes = new Map();
  let placed = [];     // what was drawn last frame, for hit testing

  function draw(ctx, W, H, now, view) {
    const R = region(W, H);
    ctx.clearRect(0, 0, W, H);
    backdrop(ctx, R);
    if (!view.entries.length) { placed = []; drawEmpty(ctx, R); return; }

    const target = computeLayout(view.entries, R);
    const k = 1 - Math.pow(0.0025, Math.min(0.06, view.dt));
    for (const [key, t] of target) {
      let b = boxes.get(key);
      if (!b) b = { x: t.x, y: t.tier === 'col' ? t.base : t.y + t.h / 2, w: t.w, h: 0, fh: 0, spot: 0 };
      b.tier = t.tier; b.base = t.base; b.bh = t.bh; b.bgap = t.bgap; b.solid = t.solid;
      b.labelH = t.labelH; b.rank = t.rank;
      b.x += (t.x - b.x) * k; b.y += (t.y - b.y) * k;
      b.w += (t.w - b.w) * k; b.h += (t.h - b.h) * k;
      b.fh += ((t.fillH || 0) - b.fh) * k;
      b.spot += ((key === view.focusKey ? 1 : 0) - b.spot) * k;
      boxes.set(key, b);
    }
    for (const key of [...boxes.keys()]) if (!target.has(key)) boxes.delete(key);

    const lit = Math.max(0, ...[...boxes.values()].map(b => b.spot));
    const sweep = R.x + ((now / 9000) % 1) * (R.w + 360) - 180;
    placed = [];

    let spotted = null;
    for (const e of view.entries) {
      const b = boxes.get(e.key);
      if (!b) continue;
      placed.push({ key: e.key, b });
      const dim = 1 - 0.45 * lit * (1 - b.spot);
      if (b.spot > 0.5) { spotted = { e, b, dim }; continue; }
      if (b.tier === 'col') drawColumn(ctx, b, e, now, view, dim, sweep);
      else drawTile(ctx, b, e, now, view, dim, sweep);
    }
    if (spotted) {
      if (spotted.b.tier === 'col') drawColumn(ctx, spotted.b, spotted.e, now, view, 1, sweep);
      else drawTile(ctx, spotted.b, spotted.e, now, view, 1, sweep);
      drawSpotlight(ctx, R, spotted.b, spotted.e);
    }
    if (target.meta && target.meta.tail) fieldCaption(ctx, R, target.meta);
    legend(ctx, R);
  }

  function backdrop(ctx, R) {
    const g = ctx.createLinearGradient(0, R.y - 60, 0, R.y + R.h + 120);
    g.addColorStop(0, 'rgba(18,15,28,0)');
    g.addColorStop(1, 'rgba(8,6,14,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, R.x * 2 + R.w, R.y + R.h + 140);
  }

  function accentOf(e) { return e.missing ? COL['--gold'] : COL['--voice']; }
  function rgbaOf(e, a) {
    return (e.missing ? 'rgba(255,200,97,' : 'rgba(56,227,192,') + a.toFixed(3) + ')';
  }

  function drawColumn(ctx, b, e, now, view, dim, sweep) {
    const just = view.justKeys.indexOf(e.key) >= 0 ? Math.min(1, (now - view.justStart) / 900) : 1;
    const shimmer = Math.max(0, 1 - Math.abs(b.x + b.w / 2 - sweep) / 220) * 0.22;
    const base = b.base, fh = Math.max(0, b.fh);
    ctx.save();
    ctx.globalAlpha = dim;

    // The shaft: what Common Voice is still missing, standing empty.
    const sg = ctx.createLinearGradient(0, base - b.h, 0, base);
    sg.addColorStop(0, rgbaOf(e, 0.03));
    sg.addColorStop(1, rgbaOf(e, 0.12));
    ctx.fillStyle = sg;
    rr(ctx, b.x, base - b.h, b.w, Math.max(2, b.h), 10); ctx.fill();
    ctx.strokeStyle = rgbaOf(e, 0.26); ctx.lineWidth = 1.5; ctx.stroke();

    if (b.solid) {
      const g = ctx.createLinearGradient(0, base - fh, 0, base);
      g.addColorStop(0, rgbaOf(e, 0.95 + shimmer * 0.2));
      g.addColorStop(1, rgbaOf(e, 0.35));
      ctx.fillStyle = g;
      rr(ctx, b.x, base - fh, b.w, Math.max(2, fh), 9); ctx.fill();
    } else {
      const n = e.count, bh = b.bh, bg = b.bgap;
      const first = Math.max(0, n - Math.ceil((fh + bg) / (bh + bg)) - 1);
      for (let i = first; i < n; i++) {
        const y = base - (i + 1) * bh - i * bg;
        const t = n > 1 ? i / (n - 1) : 1;
        if (i === n - 1 && just < 1) {
          // The block that just arrived lands warm and cools into the stack.
          const pop = 1 + (1 - just) * 0.55 * Math.exp(-4 * just);
          const hh = bh * pop, ww = b.w * (1 + (1 - just) * 0.05);
          ctx.fillStyle = COL['--ember'];
          ctx.shadowColor = COL['--ember'];
          ctx.shadowBlur = 26 * (1 - just);
          rr(ctx, b.x - (ww - b.w) / 2, y - (hh - bh), ww, hh, Math.min(5, bh * 0.35));
          ctx.fill(); ctx.shadowBlur = 0;
          continue;
        }
        ctx.fillStyle = rgbaOf(e, Math.min(0.97, 0.45 + 0.45 * t + shimmer));
        rr(ctx, b.x, y, b.w, bh, Math.min(5, bh * 0.35));
        ctx.fill();
      }
    }
    ctx.restore();
    columnLabel(ctx, b, e, dim);
  }

  function columnLabel(ctx, b, e, dim) {
    const fs = Math.max(13, Math.min(26, b.w * 0.165));
    ctx.save();
    ctx.globalAlpha = dim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = COL['--fg'];
    ctx.font = '600 ' + fs + 'px ' + UI;
    ctx.fillText(fit(ctx, e.name, b.w - 4), b.x + b.w / 2, b.base + fs * 0.55);
    ctx.font = '500 ' + Math.round(fs * 0.82) + 'px ' + UI;
    ctx.fillStyle = accentOf(e);
    const voices = e.count + (e.count === 1 ? ' voice' : ' voices');
    ctx.fillText(fit(ctx, voices, b.w - 4), b.x + b.w / 2, b.base + fs * 1.75);
    ctx.font = '400 ' + Math.round(Math.min(16, fs * 0.72)) + 'px ' + UI;
    ctx.fillStyle = COL['--dim'];
    ctx.fillText(fit(ctx, e.note || '', b.w - 4), b.x + b.w / 2, b.base + fs * 2.7);
    ctx.restore();
  }

  function drawTile(ctx, b, e, now, view, dim, sweep) {
    const just = view.justKeys.indexOf(e.key) >= 0 ? Math.min(1, (now - view.justStart) / 900) : 1;
    const shimmer = Math.max(0, 1 - Math.abs(b.x + b.w / 2 - sweep) / 220) * 0.25;
    ctx.save();
    ctx.globalAlpha = dim;
    const weight = Math.min(1, 0.34 + 0.2 * e.count);
    ctx.fillStyle = just < 1 ? COL['--ember'] : rgbaOf(e, Math.min(0.95, weight + shimmer));
    if (just < 1) { ctx.shadowColor = COL['--ember']; ctx.shadowBlur = 24 * (1 - just); }
    rr(ctx, b.x, b.y, b.w, b.h, Math.min(9, b.w * 0.24));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgbaOf(e, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (b.w >= 96) {
      ctx.fillStyle = '#0F0C18';
      ctx.font = '600 ' + Math.max(11, b.w * 0.15) + 'px ' + UI;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, e.name, b.w - 10), b.x + b.w / 2, b.y + b.h / 2);
    } else if (e.count > 1 && b.w >= 30) {
      ctx.fillStyle = '#0F0C18';
      ctx.font = '600 ' + Math.max(10, b.w * 0.38) + 'px ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(e.count), b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.restore();
  }

  /* A language from the field, named. Without this a one-voice language is a
     12-pixel square nobody can read, which is the whole reason the tour exists. */
  function drawSpotlight(ctx, R, b, e) {
    if (b.tier === 'col') return;
    const t = b.spot;
    const w = b.w + (Math.min(470, R.w * 0.3) - b.w) * t;
    const h = b.h + (Math.min(132, R.h * 0.3) - b.h) * t;
    let x = b.x + b.w / 2 - w / 2, y = b.y + b.h / 2 - h / 2;
    x = Math.max(R.x, Math.min(R.x + R.w - w, x));
    y = Math.max(R.y, Math.min(R.y + R.h - h, y));
    ctx.save();
    ctx.globalAlpha = t;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    ctx.fillStyle = 'rgba(30,25,48,.96)';
    rr(ctx, x, y, w, h, 18); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = rgbaOf(e, 0.6); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = accentOf(e);
    rr(ctx, x, y, 6, h, 3); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL['--fg'];
    const fs = Math.max(20, Math.min(40, h * 0.34));
    ctx.font = '700 ' + fs + 'px ' + DISP;
    ctx.fillText(fit(ctx, e.name, w - 44), x + 24, y + h * 0.52);
    ctx.font = '500 ' + Math.round(fs * 0.46) + 'px ' + UI;
    ctx.fillStyle = COL['--muted'];
    ctx.fillText(e.count + (e.count === 1 ? ' voice' : ' voices') + (e.missing ? ' · not in Common Voice' : ''), x + 24, y + h * 0.78);
    ctx.restore();
  }

  /* The field needs a sentence, or it reads as an unlabelled remainder rather
     than as the rest of the room. */
  function fieldCaption(ctx, R, meta) {
    const fs = Math.max(13, 17 * R.u);
    ctx.save();
    ctx.font = '500 ' + fs + 'px ' + UI;
    ctx.fillStyle = COL['--dim'];
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(meta.tail + ' more in the room, further along in Common Voice', R.x, meta.fieldY - fs * 0.45);
    ctx.restore();
  }

  /* Above the wall, where nothing else is: under it sits the card and the QR. */
  function legend(ctx, R) {
    const fs = Math.max(12, 15 * R.u);
    ctx.save();
    ctx.font = '500 ' + fs + 'px ' + UI;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    const y = R.y - fs * 2.1;
    let x = R.x + R.w;
    const bits = [[COL['--gold'], 'not in Common Voice yet'], [COL['--voice'], 'in Common Voice']];
    for (const [c, label] of bits) {
      ctx.fillStyle = COL['--dim'];
      ctx.fillText(label, x, y);
      x -= ctx.measureText(label).width + 10;
      ctx.fillStyle = c;
      rr(ctx, x - 11, y - fs * 0.75, 11, 11, 3); ctx.fill();
      x -= 11 + 22;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COL['--dim'];
    ctx.fillText('height: what Common Voice is still missing \u00b7 blocks: voices in this room',
      R.x + R.w, R.y - fs * 0.5);
    ctx.restore();
  }

  function drawEmpty(ctx, R) {
    ctx.save();
    ctx.strokeStyle = 'rgba(167,159,196,.22)';
    ctx.setLineDash([10, 12]); ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R.x, R.y + R.h * 0.72); ctx.lineTo(R.x + R.w, R.y + R.h * 0.72);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(167,159,196,.55)';
    ctx.font = '500 ' + Math.max(18, 26 * R.u) + 'px ' + UI;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('The first block lands here', R.x + R.w / 2, R.y + R.h * 0.72 - 22 * R.u);
    ctx.restore();
  }

  function hitAt(x, y) {
    // Small tiles first: a finger near a 14px square should still find it.
    const sorted = [...placed].sort((a, b) => a.b.w - b.b.w);
    for (const p of sorted) {
      const b = p.b, pad = Math.max(0, 16 - b.w / 2);
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad + (b.tier === 'col' ? (b.labelH || 0) : 0))
        return p.key;
    }
    return null;
  }

  window.Wall = { draw, hitAt, region };
})();
