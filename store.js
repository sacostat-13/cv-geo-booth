/* Store: one small interface, three backends.
   A submission is { id, ts, country, locale, langName, dialect, initials, missing }
   The wall starts empty in every mode; the only way in is the phone page.
   `missing` is the typed-in name when the language is not in Common Voice yet. */
(function () {
  const CFG = window.BOOTH;
  const KEY = 'cvbooth.submissions.v1';

  function dayStamp(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function withinScope(s) {
    if (!CFG.event.resetDaily) return true;
    return dayStamp(s.ts) === dayStamp(Date.now());
  }
  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // ---- localStorage helpers (demo + local) --------------------------------
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function writeLocal(rows) {
    try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-5000))); } catch (e) { /* private mode */ }
  }

  function LocalStore() {
    let rows = readLocal();
    const listeners = new Set();
    let channel = null;
    try { channel = new BroadcastChannel('cvbooth'); } catch (e) { /* unsupported */ }
    const emit = () => { const snap = rows.filter(withinScope); listeners.forEach(fn => fn(snap)); };
    if (channel) channel.onmessage = e => {
      if (e.data && e.data.type === 'add') { rows.push(e.data.row); emit(); }
      if (e.data && e.data.type === 'clear') { rows = []; emit(); }
    };
    window.addEventListener('storage', e => {
      if (e.key === KEY) { rows = readLocal(); emit(); }
    });
    return {
      kind: 'local',
      async add(sub) {
        const row = Object.assign({ id: newId(), ts: Date.now() }, sub);
        rows.push(row); writeLocal(rows);
        if (channel) channel.postMessage({ type: 'add', row });
        emit();
        return row;
      },
      async all() { return rows.filter(withinScope); },
      subscribe(fn) { listeners.add(fn); fn(rows.filter(withinScope)); return () => listeners.delete(fn); },
      async clear() { rows = []; writeLocal(rows); if (channel) channel.postMessage({ type: 'clear' }); emit(); },
    };
  }

  // ---- Supabase (PostgREST over fetch; no SDK, no CDN) --------------------
  function SupabaseStore() {
    const { url, anonKey, table, pollMs } = CFG.supabase;
    const endpoint = url.replace(/\/$/, '') + '/rest/v1/' + table;
    const headers = { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' };
    const listeners = new Set();
    let rows = [];
    let timer = null;
    let failures = 0;
    // Until the first poll lands we have nothing to say. Handing a subscriber an
    // empty list first would make the screen treat the whole festival's history
    // as new arrivals and replay it one celebration at a time.
    let primed = false;

    function mapRow(r) {
      return {
        id: r.id, ts: new Date(r.created_at).getTime(), country: r.country, locale: r.locale,
        langName: r.lang_name, dialect: r.dialect || '', initials: r.initials || '', missing: r.missing || '',
      };
    }
    async function pull() {
      const since = CFG.event.resetDaily ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString() : '1970-01-01T00:00:00Z';
      const q = endpoint + '?select=*&created_at=gte.' + since + '&order=created_at.asc&limit=5000';
      const res = await fetch(q, { headers });
      if (!res.ok) throw new Error('supabase ' + res.status + ' ' + (await res.text()).slice(0, 200));
      rows = (await res.json()).map(mapRow);
      primed = true;
      if (failures) window.dispatchEvent(new CustomEvent('booth:online'));
      failures = 0;
      listeners.forEach(fn => fn(rows));
    }
    function loop() {
      clearTimeout(timer);
      pull().catch(err => {
        failures++;
        console.warn('[booth] poll failed', err.message);
        window.dispatchEvent(new CustomEvent('booth:offline', { detail: { failures } }));
      }).finally(() => { timer = setTimeout(loop, pollMs); });
    }
    return {
      kind: 'supabase',
      async add(sub) {
        const body = {
          country: sub.country, locale: sub.locale, lang_name: sub.langName,
          dialect: sub.dialect || null, initials: sub.initials || null, missing: sub.missing || null,
          event: CFG.event.name,
        };
        const res = await fetch(endpoint, { method: 'POST', headers: Object.assign({ Prefer: 'return=representation' }, headers), body: JSON.stringify(body) });
        if (!res.ok) throw new Error('could not save (' + res.status + ')');
        return mapRow((await res.json())[0]);
      },
      async all() { return rows; },
      subscribe(fn) { listeners.add(fn); if (primed) fn(rows); if (!timer) loop(); return () => listeners.delete(fn); },
      async clear() { throw new Error('clear the table in Supabase, not from the booth'); },
    };
  }

  window.Store = (function () {
    if (CFG.mode === 'supabase') {
      if (!CFG.supabase.url || !CFG.supabase.anonKey) {
        console.warn('[booth] supabase mode without credentials — falling back to local');
        return LocalStore();
      }
      return SupabaseStore();
    }
    return LocalStore();
  })();
})();
