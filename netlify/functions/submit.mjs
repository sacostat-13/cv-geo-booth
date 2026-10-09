/* POST /api/submit — add one voice to the wall.
   Stores each submission as its own blob so concurrent phones never overwrite
   one another; the wall is assembled by listing the store. */
import { getStore } from '@netlify/blobs';

const LIMITS = { langName: 64, dialect: 64, initials: 4, missing: 64, locale: 24, event: 64 };

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

  // Validate before truncating: "XYZ" must be rejected, not quietly filed as "XY".
  const country = clean(body.country, 16).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return json(400, { error: 'country must be a two-letter code' });

  const langName = clean(body.langName, LIMITS.langName);
  if (!langName) return json(400, { error: 'langName is required' });

  const row = {
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    country,
    locale: clean(body.locale, LIMITS.locale),
    langName,
    dialect: clean(body.dialect, LIMITS.dialect),
    initials: clean(body.initials, LIMITS.initials),
    missing: clean(body.missing, LIMITS.missing),
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
