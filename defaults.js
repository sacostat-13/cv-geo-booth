/* Booth defaults. Committed, and safe to open with no configuration at all —
   with nothing set the pages run against this browser's own storage.

   Netlify overrides these at build time: tools/build-config.js reads the site's
   environment variables and writes config.js, which calls BOOTH_CONFIGURE below.
   The wall always starts empty — the phone page is the only way onto it.
   Nothing here is secret; the Supabase anon key is a publishable key whose
   permissions are set by the row-level security policies in supabase.sql. */
window.BOOTH = {
  // "local"    no backend: submissions live in this browser's localStorage, so the
  //            screen only sees phones in the same browser. Fine for a walkthrough.
  // "netlify"  two functions in this same site, storing the wall in Netlify Blobs.
  //            Nothing to sign up for; chosen automatically on a Netlify build.
  // "supabase" a Postgres table, for when the booth outgrows the above.
  mode: 'local',

  netlify: {
    base: '/api',   // where submit.mjs and wall.mjs are served
    pollMs: 3000,   // how often the screen asks for the wall
  },

  supabase: {
    url: '',
    anonKey: '',
    table: 'submissions',
    pollMs: 3000,
  },

  // Where the phone page lives. Empty means "wherever this page is served from",
  // so the same commit works on a deploy preview, the live site and a custom
  // domain with nothing to change. The QR code is drawn from this at runtime.
  phoneUrl: '',

  event: {
    name: 'MozFest 2026',
    booth: 'Common Voice',
    resetDaily: false,
  },

  display: {
    // The phone no longer asks where people are from, so the wall is the live
    // view; the map is still here (press V) and still draws older rows.
    scene: 'wall',         // "wall" (languages) or "geo" (the map) — press V to switch
    projection: 'globe',   // "globe" or "map" — press P on the screen to switch
    highlightMs: 10000,    // how long one submission holds the screen
    minHighlightMs: 4000,  // compressed to this when the queue backs up
    queuePressure: 5,      // queue length at which compression starts
    pinMax: 40,            // pins per country; above this the country fills with intensity
    idleSpinSpeed: 2.6,    // degrees per second
    idleRestMs: 25000,     // the globe simply turns for this long between languages
    idleTourMs: 7000,      // how long one language holds the screen before the globe returns
    pickHoldMs: 20000,     // how long a country someone tapped stays up
    debutMs: 3600,         // extra time for a language Common Voice has never heard
    captionMs: 13000,      // how long one vulnerable-language caption holds, within a rest
  },

  // Where the phone sends people next. {locale} is replaced with the Common
  // Voice locale they picked.
  loginUrl: 'https://commonvoice.mozilla.org/login',
  writeUrl: 'https://commonvoice.mozilla.org/{locale}/write',
  addLanguageUrl: 'https://commonvoice.mozilla.org/en/languages',
};

/* Merge an override object over the defaults, one level deep per section. */
window.BOOTH_CONFIGURE = function (over) {
  for (const key in over) {
    const v = over[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && window.BOOTH[key] && typeof window.BOOTH[key] === 'object') {
      Object.assign(window.BOOTH[key], v);
    } else if (v !== undefined && v !== null && v !== '') {
      window.BOOTH[key] = v;
    }
  }
  return window.BOOTH;
};
