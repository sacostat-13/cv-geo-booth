/* Booth configuration — the only file you need to edit to go live. */
window.BOOTH = {
  // "demo"     seeded sample data + a Simulate button (no backend)
  // "local"    this browser only, via localStorage (good for a single-machine test)
  // "supabase" the real thing: anonymous inserts from phones, polled by the screen
  mode: 'demo',

  supabase: {
    url: '',        // https://xxxxxxxx.supabase.co
    anonKey: '',    // the anon/publishable key — safe in the client, see supabase.sql
    table: 'submissions',
    pollMs: 3000,
  },

  // The URL the QR code points at (the phone page). Used by make-qr.py.
  phoneUrl: 'https://voices.mozfest.example/',

  event: {
    name: 'MozFest 2026',
    booth: 'Common Voice',
    // Reset the wall at the start of each day instead of accumulating all festival.
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

  // Where the CTA sends people. {locale} is replaced with the Common Voice locale.
  contributeUrl: 'https://commonvoice.mozilla.org/{locale}/speak',
  addLanguageUrl: 'https://commonvoice.mozilla.org/en/languages',
};
