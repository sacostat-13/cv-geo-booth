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
  // "supabase" the real thing: anonymous inserts from any phone, polled by the screen.
  mode: 'local',

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
    projection: 'globe',   // "globe" or "map" — press P on the screen to switch
    highlightMs: 10000,    // how long one submission holds the screen
    minHighlightMs: 4000,  // compressed to this when the queue backs up
    queuePressure: 5,      // queue length at which compression starts
    pinMax: 40,            // pins per country; above this the country fills with intensity
    idleSpinSpeed: 2.6,    // degrees per second
  },

  contributeUrl: 'https://commonvoice.mozilla.org/{locale}/speak',
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
