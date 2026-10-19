/* The booth's transport. One interface, two backends.

   netlify — the real thing: /api/quiz/*, backed by Netlify Blobs.
   local   — one machine, several tabs: localStorage plus a BroadcastChannel,
             running the same pairing and scoring rules in the page. It exists
             so the whole booth — two pads and the screen — can be driven from
             a laptop with no deploy and no network, which is how it gets
             tested and how it survives a venue with no wifi.

   Both answer the same five calls: join, pair, round, finish, state.
   Both are exposed as window.BoothStore. */
(function () {
  const CFG = window.BOOTH;
  const DUEL_WINDOW_MS = 3500;
  const LIVE_STALE_MS = 25000;
  const DUEL_SETTLE_MS = 12000;   // a settled duel comes down off the screen
  const HOUR_MS = 3600000;
  const KEY_LIVE = 'cvquiz.live.v1';
  const KEY_BOARD = 'cvquiz.board.v1';

  const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

  const BLOCKED = new Set(['ASS','FUK','FUC','FCK','CNT','KKK','SHT','SEX','TIT','FAG','JEW','NIG','NGR','WOP','PIS','DIK','DIC','COC','CUM','POO','WAN','BUM','HOE','SLT','RAP','GAS','NAZ','HIT','ISI','PRN','XXX']);
  function cleanInitials(v) {
    const up = String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (up.length < 2) return 'CV';
    return BLOCKED.has(up) ? 'CV' : up;
  }

  function rank(rows, since, now) {
    const best = new Map();
    for (const r of rows) {
      if (r.ts < since || !sameDay(r.ts, now)) continue;
      const prev = best.get(r.initials);
      if (!prev || r.score > prev.score || (r.score === prev.score && r.timeMs < prev.timeMs)) best.set(r.initials, r);
    }
    return [...best.values()]
      .sort((a, b) => b.score - a.score || a.timeMs - b.timeMs || a.ts - b.ts)
      .map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score, correct: r.correct, of: r.of, timeMs: r.timeMs, ts: r.ts, duelWin: !!r.duelWin }));
  }

  // The day board adds runs up under the same initials; the hour board keeps
  // the best single one. Same split as netlify/functions/quiz.mjs.
  function rankTotal(rows, now) {
    const tot = new Map();
    for (const r of rows) {
      if (!sameDay(r.ts, now)) continue;
      const t = tot.get(r.initials) || { initials: r.initials, score: 0, correct: 0, of: 0, runs: 0, timeMs: 0, ts: r.ts };
      t.score += r.score; t.correct += r.correct; t.of += r.of; t.runs++;
      t.timeMs += r.timeMs; t.ts = Math.min(t.ts, r.ts);
      tot.set(r.initials, t);
    }
    return [...tot.values()]
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.ts - b.ts)
      .map((r, i) => Object.assign({ rank: i + 1 }, r));
  }

  // ---- netlify ------------------------------------------------------------

  function NetlifyStore() {
    const ev = encodeURIComponent(CFG.event.slug || 'default');
    const base = '/api/quiz';
    const q = path => `${base}/${path}${path.includes('?') ? '&' : '?'}event=${ev}`;

    async function post(path, body) {
      const r = await fetch(q(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    }
    async function get(path) {
      const r = await fetch(q(path), { cache: 'no-store' });
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    }

    return {
      kind: 'netlify',
      shared: true,
      join: body => post('join', body),
      pair: (station, runId) => get(`pair?station=${encodeURIComponent(station)}&runId=${encodeURIComponent(runId)}`),
      round: body => post('round', body),
      finish: body => post('finish', body),
      state: () => get('state')
    };
  }

  // ---- local --------------------------------------------------------------

  /* The same rules as netlify/functions/quiz.mjs, re-stated in the page.
     Two copies of one set of rules is a cost; the alternative — a booth that
     cannot be rehearsed without a deploy — is a bigger one. If the duel or
     scoring rules change, both copies change. */
  function LocalStore() {
    let channel = null;
    try { channel = new BroadcastChannel('cvquiz'); } catch (e) { /* unsupported */ }

    const readLive = () => {
      try { return JSON.parse(localStorage.getItem(KEY_LIVE) || 'null') || { pads: {}, duel: null, reveal: null }; }
      catch (e) { return { pads: {}, duel: null, reveal: null }; }
    };
    const writeLive = live => {
      live.updatedAt = Date.now();
      try { localStorage.setItem(KEY_LIVE, JSON.stringify(live)); } catch (e) { /* private mode */ }
      if (channel) channel.postMessage({ type: 'live' });
    };
    const readBoard = () => {
      try { return JSON.parse(localStorage.getItem(KEY_BOARD) || '[]'); } catch (e) { return []; }
    };
    const writeBoard = rows => {
      try { localStorage.setItem(KEY_BOARD, JSON.stringify(rows.slice(-2000))); } catch (e) { /* private mode */ }
      if (channel) channel.postMessage({ type: 'board' });
    };

    function prune(live) {
      const now = Date.now();
      for (const k of Object.keys(live.pads)) {
        if (now - (live.pads[k].at || 0) > LIVE_STALE_MS) delete live.pads[k];
      }
      if (live.duel && now - (live.duel.at || 0) > LIVE_STALE_MS) live.duel = null;
      if (live.duel && live.duel.winner && now - (live.duel.settledAt || live.duel.at || 0) > DUEL_SETTLE_MS) live.duel = null;
      if (live.reveal && now - (live.reveal.at || 0) > LIVE_STALE_MS * 2) live.reveal = null;
      return live;
    }
    const publicDuel = d => d && ({
      id: d.id, mode: d.mode, startAt: d.startAt, stations: Object.keys(d.runs),
      scores: d.scores, answered: d.answered, winner: d.winner, questions: d.questions
    });

    return {
      kind: 'local',
      shared: false,

      async join(body) {
        const station = String(body.station || 'A').toUpperCase();
        const mode = body.mode === 'listen' ? 'listen' : 'read';
        const runId = newId();
        const now = Date.now();
        const live = prune(readLive());

        const found = Object.entries(live.pads).find(([k, p]) =>
          k !== station && p.waiting && p.mode === mode && now - p.at < DUEL_WINDOW_MS);

        if (found) {
          const [other, pad] = found;
          const duel = {
            id: newId(), mode, at: now, startAt: now + 1200,
            questions: pad.questions || [],
            runs: { [other]: pad.runId, [station]: runId },
            scores: { [other]: 0, [station]: 0 },
            answered: { [other]: 0, [station]: 0 },
            done: {}, winner: null
          };
          live.duel = duel;
          live.pads[other] = Object.assign({}, pad, { waiting: false, duelId: duel.id, at: now });
          live.pads[station] = { station, mode, runId, waiting: false, duelId: duel.id, score: 0, answered: 0, at: now };
          writeLive(live);
          return { runId, station, mode, duel: publicDuel(duel), questions: duel.questions };
        }

        live.pads[station] = {
          station, mode, runId, waiting: true, duelId: null, score: 0, answered: 0, at: now,
          questions: (body.questions || []).slice(0, 10)
        };
        writeLive(live);
        return { runId, station, mode, duel: null, waitMs: DUEL_WINDOW_MS };
      },

      async pair(station, runId) {
        const live = prune(readLive());
        const pad = live.pads[String(station).toUpperCase()];
        if (!pad || pad.runId !== runId) return { duel: null, stale: true };
        if (pad.duelId && live.duel && live.duel.id === pad.duelId) return { duel: publicDuel(live.duel) };
        return { duel: null };
      },

      async round(body) {
        const station = String(body.station || 'A').toUpperCase();
        const live = prune(readLive());
        const pad = live.pads[station];
        if (!pad || pad.runId !== body.runId) return { ok: false, stale: true };
        pad.score = body.score || 0;
        pad.answered = body.answered || 0;
        pad.at = Date.now();
        if (body.answer) {
          live.reveal = { locale: body.answer, mode: pad.mode, correct: !!body.correct, station, chose: body.chose || '', at: Date.now() };
        }
        if (pad.duelId && live.duel && live.duel.id === pad.duelId) {
          live.duel.scores[station] = pad.score;
          live.duel.answered[station] = pad.answered;
          live.duel.at = Date.now();
        }
        writeLive(live);
        return { ok: true, duel: publicDuel(live.duel) };
      },

      async finish(body) {
        const now = Date.now();
        const station = String(body.station || 'A').toUpperCase();
        const entry = {
          id: newId(), ts: now, station, runId: body.runId,
          initials: cleanInitials(body.initials),
          mode: body.mode === 'listen' ? 'listen' : 'read',
          score: body.score || 0, correct: body.correct || 0, of: body.of || 5,
          timeMs: body.timeMs || 0, duelId: body.duelId || null,
          missed: (body.missed || []).slice(0, 10)
        };

        const live = prune(readLive());
        const pad = live.pads[station];
        if (pad && pad.duelId && live.duel && live.duel.id === pad.duelId) {
          const d = live.duel;
          d.done[station] = { initials: entry.initials, score: entry.score, timeMs: entry.timeMs, correct: entry.correct };
          d.scores[station] = entry.score;
          d.at = now;
          const stations = Object.keys(d.runs);
          if (stations.every(st => d.done[st])) {
            const [a, b] = stations, A = d.done[a], B = d.done[b];
            d.winner = A.score > B.score ? a : B.score > A.score ? b
              : A.timeMs < B.timeMs ? a : B.timeMs < A.timeMs ? b : 'draw';
            d.settledAt = now;
            entry.duelWin = d.winner === station;
          }
        }
        if (pad) { pad.waiting = false; pad.finished = true; pad.at = now; pad.score = entry.score; }
        live.lastEntry = { initials: entry.initials, score: entry.score, correct: entry.correct, of: entry.of, at: now };
        writeLive(live);

        const board = readBoard();
        board.push(entry);
        writeBoard(board);

        const hour = rank(board, now - HOUR_MS, now);
        const day = rankTotal(board, now);
        const mine = hour.find(r => r.initials === entry.initials && r.score === entry.score);
        return {
          ok: true,
          entry: { initials: entry.initials, score: entry.score, duelWin: !!entry.duelWin },
          rank: mine ? mine.rank : null,
          of: hour.length,
          beat: hour.length > 1 ? Math.round(100 * (hour.length - (mine ? mine.rank : hour.length)) / (hour.length - 1)) : null,
          hour: hour.slice(0, 10), day: day.slice(0, 3),
          duel: publicDuel(live.duel)
        };
      },

      async state() {
        const now = Date.now();
        const live = prune(readLive());
        const board = readBoard();
        const hour = rank(board, now - HOUR_MS, now);
        const day = rankTotal(board, now);
        const pads = {};
        for (const [k, p] of Object.entries(live.pads)) {
          pads[k] = { mode: p.mode, score: p.score, answered: p.answered, waiting: !!p.waiting, finished: !!p.finished, duelId: p.duelId, at: p.at };
        }
        return {
          now, pads,
          duel: publicDuel(live.duel),
          duelDone: live.duel ? !!live.duel.winner : false,
          reveal: live.reveal,
          lastEntry: live.lastEntry || null,
          hour: hour.slice(0, 10), day: day.slice(0, 3),
          plays: board.filter(r => sameDay(r.ts, now)).length
        };
      },

      onChange(fn) { if (channel) channel.onmessage = () => fn(); }
    };
  }

  window.BoothStore = (CFG.mode === 'netlify' || CFG.mode === 'supabase') ? NetlifyStore() : LocalStore();
  window.BoothStore.cleanInitials = cleanInitials;
})();
