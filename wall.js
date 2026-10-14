/* The language wall — a second scene for the same booth state.

   The map answers "where are we from". This answers "what do we speak", which
   is the question the booth is actually asking, and it does not need anyone to
   pin a language to a country. Press V to switch; the geo wall is untouched.

   Two things decide what the wall looks like.

   The screen shows two quantities that do not share a scale: hours Common Voice
   has recorded (global, 0 to a few thousand, log-distributed) and voices this
   room has given (local, 0 to a few dozen, linear). Making one the container of
   the other reads as a measurement and is really a metaphor — a person speaking
   for five minutes cannot fill English's three thousand hours. So they are two
   channels side by side on one row per language: a log-scaled bar of what is
   recorded, and one discrete block per person here. Neither contains the other,
   and the rows stay comparable straight down the column.

   What gets the screen is need, not headcount: rows are ordered by how far
   Common Voice still has to go. Rank the room by how many speak each language
   and the wall hands itself to English, which is the opposite of what the booth
   is for.

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
    const headerH = Math.max(26, 34 * R.u);     // the two channel captions
    const minRowH = Math.max(38, 46 * R.u);
    const maxRowH = Math.max(minRowH, 76 * R.u);

    /* The field is one compact band at the foot, so the rows get the rest. */
    const bodyTop = R.y + headerH;
    const fieldBand = 136 * R.u;
    const headH = L > 3 ? R.h - fieldBand : R.h;
    const rowsH = headH - headerH;
    let n = Math.max(1, Math.min(L, Math.floor(rowsH / minRowH)));
    const rowH = Math.min(maxRowH, rowsH / n);
    const fieldY = R.y + headH + gap * 2.2;
    const fieldH = (R.y + R.h) - fieldY;

    /* Which languages get a row. Ordering by need alone puts every zero-hour
       language at the top, so the recorded channel would be empty on every
       visible row and the comparison it exists for would never appear. So the
       last rows are kept for what the room already has well recorded: the
       channel then spans nothing to thousands of hours, which is the point. */
    let rows = entries, splitAt = -1;
    if (L > n) {
      const bottom = Math.min(3, Math.max(0, n - 4));
      const top = n - bottom;
      rows = entries.slice(0, top).concat(bottom ? entries.slice(L - bottom) : []);
      splitAt = bottom ? top : -1;
    }
    const middle = L > n ? entries.slice(n - Math.min(3, Math.max(0, n - 4)), L - Math.min(3, Math.max(0, n - 4))) : [];
    const tail = middle.length;

    /* Three columns: who, what Common Voice has, who is here. The name gets
       enough room for the longest language names, the bar gets the most, and
       the blocks get what is left. */
    const nameW = Math.min(420, Math.max(190, R.w * 0.21));
    const voiceW = Math.min(430, Math.max(180, R.w * 0.22));
    const barX = R.x + nameW + gap * 2;
    const barW = R.w - nameW - voiceW - gap * 4;
    const voiceX = barX + barW + gap * 2;

    // One block per voice, the same size on every row, so a block means the
    // same thing wherever it sits — that is what lets someone point at theirs.
    let maxVoices = 1;
    for (const e of rows) maxVoices = Math.max(maxVoices, e.count);
    /* A block is sized by the row, not by the busiest language. Sizing to fit
       the largest count would shrink every block until the rows that matter —
       the ones with two or three voices — stopped being countable, to make one
       row of eighty fit. That row says what it needs to with a run of blocks
       and a remainder instead. */
    const bw = Math.max(6, Math.min(16, rowH * 0.3));
    const bgap = Math.max(2, bw * 0.28);
    const solid = bw < 4;

    rows.forEach((e, i) => {
      out.set(e.key, {
        tier: 'row', rank: i, x: R.x, y: bodyTop + i * rowH, w: R.w, h: rowH,
        nameW, barX, barW, voiceX, voiceW, bw, bgap, solid,
        fillH: Math.min(barW, (e.bar || 0) * barW),
      });
    });
    out.meta = {
      tail: 0, headerH, barX, barW, voiceX, rowsTop: bodyTop,
      splitY: splitAt >= 0 ? bodyTop + splitAt * rowH : 0,
    };
    if (!tail) return out;

    /* The field. Sized down until every one of them fits — density is the
       point, so the answer to "too many" is smaller tiles, never fewer. */
    const rest = middle;
    const restMax = rest.reduce((m, e) => Math.max(m, e.count), 1);
    const g = gap * 0.6;
    const sizeOf = (c, s0) => s0 * (0.6 + 0.4 * Math.sqrt(c / restMax));
    let s = Math.min(62, fieldH * 0.44), packed = null;
    for (; s >= 10; s -= 1.5) {
      packed = pack(rest, s, sizeOf, R.w, g);
      const total = packed.reduce((t, r) => t + r.h, 0) + (packed.length - 1) * g;
      if (total <= fieldH) break;
    }
    const totalH = packed.reduce((t, r) => t + r.h, 0) + (packed.length - 1) * g;
    let y = fieldY + Math.max(0, (fieldH - totalH) / 2);
    for (const row of packed) {
      let x = R.x + (R.w - row.w) / 2;
      for (const it of row.items) {
        out.set(it.e.key, { tier: 'tile', rank: 999, x, y: y + (row.h - it.s) / 2, w: it.s, h: it.s });
        x += it.s + g;
      }
      y += row.h + g;
    }
    out.meta = Object.assign(out.meta || {}, { tail, fieldY: fieldY + Math.max(0, (fieldH - totalH) / 2) });
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
      if (!b) b = { x: t.x, y: t.y, w: t.w, h: t.h, fh: 0, spot: 0 };
      b.tier = t.tier; b.bgap = t.bgap; b.solid = t.solid; b.rank = t.rank;
      b.nameW = t.nameW; b.barX = t.barX; b.barW = t.barW;
      b.voiceX = t.voiceX; b.voiceW = t.voiceW; b.bw = t.bw;
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
      if (b.tier === 'row') drawRow(ctx, b, e, now, view, dim, sweep);
      else drawTile(ctx, b, e, now, view, dim, sweep);
    }
    if (spotted) {
      if (spotted.b.tier === 'row') drawRow(ctx, spotted.b, spotted.e, now, view, 1, sweep);
      else drawTile(ctx, spotted.b, spotted.e, now, view, 1, sweep);
      drawSpotlight(ctx, R, spotted.b, spotted.e);
    }
    if (target.meta) channelHeaders(ctx, R, target.meta);
    if (target.meta && target.meta.splitY) divider(ctx, R, target.meta);
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

  /* One language, one row, two channels: what Common Voice has recorded, and
     who in this room could add to it. */
  function drawRow(ctx, b, e, now, view, dim, sweep) {
    const just = view.justKeys.indexOf(e.key) >= 0 ? Math.min(1, (now - view.justStart) / 900) : 1;
    const mid = b.y + b.h / 2;
    const fs = Math.max(15, Math.min(30, b.h * 0.42));
    ctx.save();
    ctx.globalAlpha = dim;

    if (b.spot > 0.02) {
      ctx.fillStyle = rgbaOf(e, 0.08 * b.spot);
      rr(ctx, b.x - 10, b.y + 2, b.w + 20, b.h - 4, 10); ctx.fill();
    }

    // name
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL['--fg'];
    ctx.font = '600 ' + fs + 'px ' + UI;
    ctx.fillText(fit(ctx, e.name, b.nameW), b.x, mid);

    // channel 1 — hours recorded, log-scaled, with the figure beside the fill
    const trackH = Math.max(8, Math.min(22, b.h * 0.3));
    const ty = mid - trackH / 2;
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    rr(ctx, b.barX, ty, b.barW, trackH, trackH / 2); ctx.fill();
    const fw = Math.max(0, b.fh);
    if (e.hours <= 0) {
      // Nothing recorded. A hatched track reads as "empty", where a plain one
      // reads as "still loading".
      ctx.save();
      rr(ctx, b.barX, ty, b.barW, trackH, trackH / 2); ctx.clip();
      ctx.strokeStyle = rgbaOf(e, 0.14); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = b.barX - trackH; x < b.barX + b.barW; x += 9) {
        ctx.moveTo(x, ty + trackH); ctx.lineTo(x + trackH, ty);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (fw > 1) {
      const g = ctx.createLinearGradient(b.barX, 0, b.barX + fw, 0);
      g.addColorStop(0, rgbaOf(e, 0.45));
      g.addColorStop(1, rgbaOf(e, 0.95));
      ctx.fillStyle = g;
      rr(ctx, b.barX, ty, fw, trackH, trackH / 2); ctx.fill();
    }
    /* The figure rides the end of the fill, and moves inside it once the fill
       is long enough to hold it — otherwise a full bar pushes its own label
       into the blocks channel. */
    ctx.font = '500 ' + Math.round(fs * 0.72) + 'px ' + (e.hours > 0 ? MONO : UI);
    const note = e.note || '';
    const noteW = ctx.measureText(note).width;
    const room = b.barX + b.barW - (b.barX + fw) - 14;
    if (fw > noteW + 28 && room < noteW) {
      ctx.fillStyle = '#0B0914';
      ctx.textAlign = 'right';
      ctx.fillText(note, b.barX + fw - 12, mid);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = e.hours > 0 ? COL['--voice'] : COL['--gold'];
      ctx.fillText(fit(ctx, note, Math.max(60, room)), b.barX + fw + 12, mid);
    }

    // channel 2 — one block per person in this room
    drawVoices(ctx, b, e, now, just, sweep);
    ctx.restore();
  }

  function drawVoices(ctx, b, e, now, just, sweep) {
    const n = e.count;
    const h = Math.max(10, Math.min(b.h * 0.5, b.bw * 1.5));
    const y = b.y + (b.h - h) / 2;
    if (b.solid) {
      const w = Math.min(b.voiceW, Math.max(6, n * 3));
      ctx.fillStyle = rgbaOf(e, 0.85);
      rr(ctx, b.voiceX, y, w, h, 4); ctx.fill();
      ctx.fillStyle = COL['--fg'];
      ctx.font = '600 ' + Math.round(h * 0.7) + 'px ' + MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), b.voiceX + w + 10, b.y + b.h / 2);
      return;
    }
    const step = b.bw + b.bgap;
    const fits = Math.floor((b.voiceW + b.bgap) / step);
    const shown = Math.min(n, fits);
    for (let i = 0; i < shown; i++) {
      const x = b.voiceX + i * step;
      const shimmer = Math.max(0, 1 - Math.abs(x - sweep) / 200) * 0.2;
      if (i === n - 1 && just < 1) {
        // The block that just arrived lands warm and settles into the row.
        const drop = (1 - just) * (1 - just) * b.h * 0.9;
        ctx.fillStyle = COL['--ember'];
        ctx.shadowColor = COL['--ember'];
        ctx.shadowBlur = 24 * (1 - just);
        rr(ctx, x, y - drop, b.bw, h, Math.min(4, b.bw * 0.3));
        ctx.fill(); ctx.shadowBlur = 0;
        continue;
      }
      ctx.fillStyle = rgbaOf(e, Math.min(0.95, 0.6 + shimmer));
      rr(ctx, x, y, b.bw, h, Math.min(4, b.bw * 0.3));
      ctx.fill();
    }
    if (n > shown) {
      ctx.fillStyle = COL['--muted'];
      ctx.font = '500 ' + Math.round(h * 0.62) + 'px ' + MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('+' + (n - shown), b.voiceX + shown * step + 6, b.y + b.h / 2);
    }
  }

  /* Where the neediest rows end and the room's well-recorded languages begin. */
  function divider(ctx, R, meta) {
    const fs = Math.max(11, 14 * R.u);
    const y = meta.splitY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(R.x, y); ctx.lineTo(R.x + R.w, y); ctx.stroke();
    ctx.font = '500 ' + fs + 'px ' + UI;
    ctx.fillStyle = COL['--dim'];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const label = 'what the room already has';
    const w = ctx.measureText(label).width;
    ctx.fillStyle = COL['--sea'];
    ctx.fillRect(R.x + R.w - w - 16, y - fs * 0.8, w + 16, fs * 1.6);
    ctx.fillStyle = COL['--dim'];
    ctx.textAlign = 'right';
    ctx.fillText(label, R.x + R.w, y);
    ctx.restore();
  }

  /* Two captions, once, above the rows — they are what make the two channels
     readable without a key to decode. */
  function channelHeaders(ctx, R, meta) {
    if (meta.barX == null) return;
    const fs = Math.max(12, 16 * R.u);
    ctx.save();
    ctx.font = '600 ' + fs + 'px ' + UI;
    ctx.fillStyle = COL['--dim'];
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.letterSpacing && (ctx.letterSpacing = '0.08em');
    ctx.fillText('RECORDED IN COMMON VOICE', meta.barX, meta.rowsTop - fs * 0.5);
    ctx.fillText('VOICES IN THIS ROOM', meta.voiceX, meta.rowsTop - fs * 0.5);
    ctx.letterSpacing && (ctx.letterSpacing = '0px');
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
    ctx.fillText(meta.tail + ' more in between', R.x, meta.fieldY - fs * 0.45);
    ctx.restore();
  }

  /* Above the wall, where nothing else is: under it sits the card and the QR. */
  function legend(ctx, R) {
    const fs = Math.max(12, 15 * R.u);
    ctx.save();
    ctx.font = '500 ' + fs + 'px ' + UI;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    const y = R.y - fs * 0.6;
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
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad)
        return p.key;
    }
    return null;
  }

  window.Wall = { draw, hitAt, region };
})();
