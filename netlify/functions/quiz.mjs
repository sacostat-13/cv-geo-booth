/* The booth's one API. Four routes, one blob store, no database.

   POST /api/quiz/join    a pad says "I'm starting, in this mode"
   GET  /api/quiz/pair    that pad asks, for ~3s, whether anyone joined it
   POST /api/quiz/round   a pad reports one answered question
   POST /api/quiz/finish  a pad reports a finished run and its initials
   GET  /api/quiz/state   the screen asks what to draw

   Two blobs carry everything the booth needs to agree on:

     <event>/live   what is happening right now. Overwritten constantly, worth
                    nothing a second later, never read for history.
     <event>/board  every finished run of the day. Appended to, capped, and the
                    only thing a leaderboard is built from.

   Each finished run is also written as its own blob under <event>/runs/, which
   is the durable record: two pads finishing in the same instant can lose one
   entry from `board` to a last-writer-wins race, and the runs are how it is
   rebuilt. Losing a leaderboard row is a small harm; blocking the booth on a
   lock would be a larger one. */
import { getStore } from '@netlify/blobs';

const DUEL_WINDOW_MS = 3500;   // how long a pad waits to find a challenger
const LIVE_STALE_MS = 25000;   // a run nobody finished stops being "live"
// A settled duel comes down off the screen after this, so the band does not
// sit over an idle booth announcing a result nobody is still standing for.
const DUEL_SETTLE_MS = 12000;
const BOARD_MAX = 2000;
const HOUR_MS = 3600000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

const store = () => getStore({ name: 'cv-booth-quiz', consistency: 'strong' });

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const slug = s => clean(s, 64).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const num = (v, lo, hi, dflt = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/* Three letters on a two-metre screen in a public hall, typed by strangers.
   The alphabet is A-Z only: no digits and no symbols, which removes most of
   the ways three characters are made to say something else. A denylist of
   whole words would not help at three characters, so the list is of the
   three-letter strings themselves. Anything blocked becomes the house
   initials rather than an error — arguing with someone at a booth about
   their initials is worse than quietly renaming them. */
const BLOCKED = new Set([
  'ASS', 'FUK', 'FUC', 'FCK', 'CNT', 'KKK', 'SHT', 'SEX', 'TIT', 'FAG', 'JEW',
  'NIG', 'NGR', 'WOP', 'PIS', 'DIK', 'DIC', 'COC', 'CUM', 'POO', 'WAN', 'BUM',
  'HOE', 'SLT', 'RAP', 'GAS', 'SS', 'NAZ', 'HIT', 'ISI', 'PRN', 'XXX'
]);
function initials(v) {
  const up = clean(v, 8).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (up.length < 2) return 'CV';
  return BLOCKED.has(up) ? 'CV' : up;
}

// ---- live state -----------------------------------------------------------

const emptyLive = () => ({ pads: {}, duel: null, reveal: null, updatedAt: 0 });

async function readLive(s, event) {
  return (await s.get(event + '/live', { type: 'json' }).catch(() => null)) || emptyLive();
}
const writeLive = (s, event, live) => {
  live.updatedAt = Date.now();
  return s.setJSON(event + '/live', live);
};

/* A pad that walked away mid-run must not hold the screen for the rest of the
   afternoon, and a duel whose other half never finished must not keep the
   next pair out of duel mode. Anything untouched for LIVE_STALE_MS is dropped
   on the next read rather than cleaned up on a timer there is nowhere to run. */
function prune(live) {
  const now = Date.now();
  for (const [k, pad] of Object.entries(live.pads)) {
    if (now - (pad.at || 0) > LIVE_STALE_MS) delete live.pads[k];
  }
  if (live.duel && now - (live.duel.at || 0) > LIVE_STALE_MS) live.duel = null;
  if (live.duel && live.duel.winner && now - (live.duel.settledAt || live.duel.at || 0) > DUEL_SETTLE_MS) live.duel = null;
  if (live.reveal && now - (live.reveal.at || 0) > LIVE_STALE_MS * 2) live.reveal = null;
  return live;
}

// ---- board ----------------------------------------------------------------

async function readBoard(s, event) {
  return (await s.get(event + '/board', { type: 'json' }).catch(() => null)) || [];
}

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/* Two boards, two rules, because they are for two different things.

   The hour board is the live one, and it keeps each set of initials' BEST
   single run. Playing six times cannot fill the top six, so the board stays
   a reason for the next person in the queue to play.

   The day board is the one with swag attached, and it ADDS runs up under the
   same initials. That is what makes "go and get your friend to play for you"
   work: a team pooling points under one tag is the social mechanic, and it is
   held to the day board where it cannot crowd out the live one. */
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
    .map((r, i) => ({ rank: i + 1, ...r }));
}

// ---- routes ---------------------------------------------------------------

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/quiz\/?/, '') || 'state';
  const event = slug(url.searchParams.get('event') || 'default');

  let s;
  try { s = store(); } catch (err) {
    console.error('[quiz] no blob store', err);
    return json(502, { error: 'store unavailable' });
  }

  let body = null;
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { return json(400, { error: 'Expected JSON' }); }
  }

  try {
    switch (route) {
      case 'join':   return await join(s, event, body);
      case 'pair':   return await pair(s, event, url);
      case 'round':  return await round(s, event, body);
      case 'finish': return await finish(s, event, body);
      case 'state':  return await state(s, event);
      default:       return json(404, { error: 'no such route' });
    }
  } catch (err) {
    console.error('[quiz] ' + route + ' failed', err);
    return json(502, { error: 'booth backend unavailable' });
  }
};

/* A pad announces a run. If the other pad announced the same mode in the last
   few seconds and is still waiting, the two become a duel here, on the server,
   so there is exactly one decision and both pads read the same answer to it.
   The pad that arrives second writes the duel and both get told by /pair. */
async function join(s, event, body) {
  const station = clean(body?.station, 8).toUpperCase() || 'A';
  const mode = body?.mode === 'listen' ? 'listen' : 'read';
  const runId = newId();
  const now = Date.now();

  const live = prune(await readLive(s, event));

  const challenger = Object.entries(live.pads).find(([k, p]) =>
    k !== station && p.waiting && p.mode === mode && now - p.at < DUEL_WINDOW_MS);

  if (challenger) {
    const [otherStation, other] = challenger;
    const duel = {
      id: newId(),
      mode,
      at: now,
      startAt: now + 1200,            // both pads count down to the same instant
      questions: Array.isArray(other.questions) ? other.questions : [],
      runs: { [otherStation]: other.runId, [station]: runId },
      scores: { [otherStation]: 0, [station]: 0 },
      answered: { [otherStation]: 0, [station]: 0 },
      done: {},
      winner: null
    };
    live.duel = duel;
    live.pads[otherStation] = { ...other, waiting: false, runId: other.runId, duelId: duel.id, at: now };
    live.pads[station] = { station, mode, runId, waiting: false, duelId: duel.id, score: 0, answered: 0, at: now };
    await writeLive(s, event, live);
    // The second pad takes the first pad's questions, so both see the same five.
    return json(200, { runId, station, mode, duel: publicDuel(duel), questions: duel.questions });
  }

  live.pads[station] = {
    station, mode, runId, waiting: true, duelId: null, score: 0, answered: 0, at: now,
    questions: Array.isArray(body?.questions) ? body.questions.slice(0, 10).map(q => clean(q, 40)) : []
  };
  await writeLive(s, event, live);
  return json(200, { runId, station, mode, duel: null, waitMs: DUEL_WINDOW_MS });
}

const publicDuel = d => d && ({
  id: d.id, mode: d.mode, startAt: d.startAt, stations: Object.keys(d.runs),
  scores: d.scores, answered: d.answered, winner: d.winner, questions: d.questions
});

/* The waiting pad polls this for the length of the duel window. It is a read
   of one blob, called a handful of times per run — cheap enough to do at
   400ms, which is what makes the pairing feel instant rather than lucky. */
async function pair(s, event, url) {
  const station = clean(url.searchParams.get('station'), 8).toUpperCase() || 'A';
  const runId = clean(url.searchParams.get('runId'), 40);
  const live = prune(await readLive(s, event));
  const pad = live.pads[station];
  if (!pad || pad.runId !== runId) return json(200, { duel: null, stale: true });
  if (pad.duelId && live.duel && live.duel.id === pad.duelId) {
    return json(200, { duel: publicDuel(live.duel) });
  }
  return json(200, { duel: null });
}

/* One answered question. The screen draws from this, so it carries what the
   screen needs to show: whose turn-by-turn score moved, and which language was
   the answer — the reveal panel is driven by the question just answered, not
   by the end of the run. */
async function round(s, event, body) {
  const station = clean(body?.station, 8).toUpperCase() || 'A';
  const runId = clean(body?.runId, 40);
  const live = prune(await readLive(s, event));
  const pad = live.pads[station];
  if (!pad || pad.runId !== runId) return json(200, { ok: false, stale: true });

  pad.score = num(body?.score, 0, 100000, pad.score);
  pad.answered = num(body?.answered, 0, 50, pad.answered);
  pad.at = Date.now();

  const answer = clean(body?.answer, 24);
  const correct = !!body?.correct;
  if (answer) {
    live.reveal = {
      locale: answer,
      mode: pad.mode,
      correct,
      station,
      chose: clean(body?.chose, 24),
      at: Date.now()
    };
  }

  if (pad.duelId && live.duel && live.duel.id === pad.duelId) {
    live.duel.scores[station] = pad.score;
    live.duel.answered[station] = pad.answered;
    live.duel.at = Date.now();
  }

  await writeLive(s, event, live);
  return json(200, { ok: true, duel: publicDuel(live.duel) });
}

async function finish(s, event, body) {
  const station = clean(body?.station, 8).toUpperCase() || 'A';
  const runId = clean(body?.runId, 40);
  const now = Date.now();

  const entry = {
    id: newId(),
    ts: now,
    station,
    runId,
    initials: initials(body?.initials),
    mode: body?.mode === 'listen' ? 'listen' : 'read',
    score: num(body?.score, 0, 100000),
    correct: num(body?.correct, 0, 50),
    of: num(body?.of, 1, 50, 5),
    timeMs: num(body?.timeMs, 0, 3600000),
    duelId: clean(body?.duelId, 40) || null,
    missed: Array.isArray(body?.missed) ? body.missed.slice(0, 10).map(m => clean(m, 24)) : []
  };
  if (entry.correct > entry.of) entry.correct = entry.of;

  // The durable copy first: if the board write races and loses, this survives.
  await s.setJSON(`${event}/runs/${now}-${entry.id}`, entry);

  const live = prune(await readLive(s, event));
  const pad = live.pads[station];

  if (pad && pad.duelId && live.duel && live.duel.id === pad.duelId) {
    const d = live.duel;
    d.done[station] = { initials: entry.initials, score: entry.score, timeMs: entry.timeMs, correct: entry.correct };
    d.scores[station] = entry.score;
    d.at = now;
    const stations = Object.keys(d.runs);
    if (stations.every(st => d.done[st])) {
      const [a, b] = stations;
      const A = d.done[a], B = d.done[b];
      // Knowledge first, speed only to break a tie, and a draw is allowed to
      // stand: a sudden-death round costs more of the queue than it is worth.
      d.winner = A.score > B.score ? a
        : B.score > A.score ? b
        : A.timeMs < B.timeMs ? a
        : B.timeMs < A.timeMs ? b
        : 'draw';
      d.settledAt = now;
      entry.duelWin = d.winner === station;
    }
  }
  if (pad) { pad.waiting = false; pad.at = now; pad.finished = true; pad.score = entry.score; }
  live.lastEntry = { initials: entry.initials, score: entry.score, correct: entry.correct, of: entry.of, at: now };
  await writeLive(s, event, live);

  let board = await readBoard(s, event);
  board.push(entry);
  if (board.length > BOARD_MAX) board = board.slice(-BOARD_MAX);
  await s.setJSON(event + '/board', board);

  const hour = rank(board, now - HOUR_MS, now);
  const day = rankTotal(board, now);
  const mine = hour.find(r => r.initials === entry.initials && r.score === entry.score);

  return json(200, {
    ok: true,
    entry: { initials: entry.initials, score: entry.score, duelWin: !!entry.duelWin },
    rank: mine ? mine.rank : null,
    of: hour.length,
    beat: hour.length > 1 ? Math.round(100 * (hour.length - (mine ? mine.rank : hour.length)) / (hour.length - 1)) : null,
    hour: hour.slice(0, 10),
    day: day.slice(0, 3),
    duel: publicDuel(live.duel)
  });
}

/* Everything the screen draws, in one call. Two blob reads; the screen polls
   this and rebuilds itself from the answer, so a dropped poll costs nothing. */
async function state(s, event) {
  const now = Date.now();
  const [live, board] = await Promise.all([readLive(s, event), readBoard(s, event)]);
  prune(live);
  const hour = rank(board, now - HOUR_MS, now);
  const day = rankTotal(board, now);
  return json(200, {
    now,
    pads: Object.fromEntries(Object.entries(live.pads).map(([k, p]) =>
      [k, { mode: p.mode, score: p.score, answered: p.answered, waiting: !!p.waiting, finished: !!p.finished, duelId: p.duelId, at: p.at }])),
    duel: publicDuel(live.duel),
    duelDone: live.duel ? !!live.duel.winner : false,
    reveal: live.reveal,
    lastEntry: live.lastEntry || null,
    hour: hour.slice(0, 10),
    day: day.slice(0, 3),
    plays: board.filter(r => sameDay(r.ts, now)).length
  });
}

export const config = { path: '/api/quiz/*' };
