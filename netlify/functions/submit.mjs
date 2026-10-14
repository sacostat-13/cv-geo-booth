/* POST /api/submit — add one voice to the wall.
   Stores each submission as its own blob so concurrent phones never overwrite
   one another; the wall is assembled by listing the store. */
import { getStore } from '@netlify/blobs';

const LIMITS = { langName: 64, dialect: 64, initials: 4, missing: 64, locale: 24, event: 64 };
// One person may give several languages. Five, because the phone asks for five
// and an open endpoint with no moderation should not take a list of forty.
const MAXLANGS = 5;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/* Trim to a sane length and strip control characters — this text goes on a
   screen in a public hall. */
function clean(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Expected JSON' });
  }

  /* The phone no longer sends a country. One may still arrive from an older
     page, and it is kept if so — but it is validated before truncating, so
     "XYZ" is rejected rather than quietly filed as "XY". */
  const country = clean(body.country, 16).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return json(400, { error: 'country must be a two-letter code' });

  /* Accept either shape: a langs array, or the single language the page used
     to send. Both end up stored as an array with the first entry repeated at
     the top level, so nothing reading the old fields breaks. */
  const given = Array.isArray(body.langs) && body.langs.length
    ? body.langs
    : [{ locale: body.locale, langName: body.langName, dialect: body.dialect, missing: body.missing }];
  if (given.length > MAXLANGS) return json(400, { error: 'at most ' + MAXLANGS + ' languages' });

  const langs = [];
  const seen = new Set();
  for (const l of given) {
    if (!l || typeof l !== 'object') return json(400, { error: 'each language must be an object' });
    const langName = clean(l.langName, LIMITS.langName);
    if (!langName) return json(400, { error: 'langName is required for each language' });
    const locale = clean(l.locale, LIMITS.locale);
    const key = locale || '!' + langName.toLowerCase();
    if (seen.has(key)) continue;          // same language twice counts once
    seen.add(key);
    langs.push({
      locale,
      langName,
      dialect: clean(l.dialect, LIMITS.dialect),
      missing: clean(l.missing, LIMITS.missing),
    });
  }
  if (!langs.length) return json(400, { error: 'at least one language is required' });

  const row = {
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    country,
    langs,
    initials: clean(body.initials, LIMITS.initials),
    // The first language is repeated flat for anything still reading one.
    locale: langs[0].locale,
    langName: langs[0].langName,
    dialect: langs[0].dialect,
    missing: langs[0].missing,
  };

  const event = clean(body.event, LIMITS.event) || 'default';

  try {
    const store = getStore({ name: 'cv-booth', consistency: 'strong' });
    // Key sorts by time, so listing comes back in submission order.
    await store.setJSON(event + '/' + row.ts + '-' + row.id, row);
  } catch (err) {
    console.error('[submit] blob write failed', err);
    return json(502, { error: 'Could not save that — try once more.' });
  }

  return json(201, row);
};

export const config = { path: '/api/submit' };
