/* GET /api/wall — every voice on the wall, oldest first.
   The screen calls this on a timer and rebuilds the whole map from the answer,
   so a missed poll costs nothing. */
import { getStore } from '@netlify/blobs';

const MAX = 5000;

export default async (req) => {
  const url = new URL(req.url);
  const event = (url.searchParams.get('event') || 'default').slice(0, 64);
  const since = Number(url.searchParams.get('since')) || 0;

  let rows = [];
  try {
    const store = getStore({ name: 'cv-booth', consistency: 'strong' });
    const { blobs } = await store.list({ prefix: event + '/' });

    // Keys start with the timestamp, so sorting the keys orders the wall
    // without reading a single blob.
    const keys = blobs
      .map(b => b.key)
      .filter(k => !since || Number(k.slice(event.length + 1).split('-')[0]) >= since)
      .sort()
      .slice(-MAX);

    rows = (await Promise.all(keys.map(k => store.get(k, { type: 'json' }).catch(() => null))))
      .filter(Boolean);
  } catch (err) {
    console.error('[wall] blob read failed', err);
    return new Response(JSON.stringify({ error: 'wall unavailable' }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/wall' };
