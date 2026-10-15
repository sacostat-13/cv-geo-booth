/* Everything the booth wants to say about a language that the live stats
   endpoint does not carry: ISO code, which corpora it is collected in, hours
   in the most recent release, the variants and accents that exist for it, and
   the demographic shape of its data.

   WHY THIS FILE IS EMPTY
   ----------------------
   `cv-data.js` comes from api/v1/stats/languages and has six fields per
   language: locale, name, whether it is open, cumulative recorded and
   validated hours, and a speaker count. None of what this file describes is in
   there. So the panel is built to render every field below, and shows an
   em-dash for each one it does not have — nothing is invented, and nothing has
   to change in the code when the real data arrives.

   FILL IT FROM
   ------------
   Whatever the Common Voice team can export: the release datasheet for hours
   and demographics, the variants/accents tables, an ISO 639-3 mapping for the
   locales. Keep `source` on each record so the next person can check it. The
   booth is a frozen snapshot by design — this is built at deploy time, not
   fetched from the hall.

   SHAPE
   -----
   Every key is optional. Absent means "we do not know", which the panel shows
   as an em-dash; it never means zero. A figure of 0 means a real, measured
   zero, which reads very differently on a screen and is worth the distinction.

     langs['cy'] = {
       iso:      'cym',                  // ISO 639-3, not the CV locale
       scs:      { hours: 221.4 },       // scripted speech, this release
       sps:      { hours: 0 },           // spontaneous speech, this release
       variants: ['Gogledd', 'De'],      // [] means none exist, absent means unknown
       accents:  ['Cardiff', 'Valleys'],
       demographics: {                   // percentages of the released clips
         gender: [{ label: 'male_masculine', pct: 61 }, { label: 'female_feminine', pct: 34 }],
         age:    [{ label: '19 - 29', pct: 28 }, { label: '30 - 39', pct: 22 }],
         accent: [{ label: 'Cardiff', pct: 40 }],
       },
       needs:    'Short line on what this dataset is short of.',
       source:   'CV 23.0 datasheet, checked 2026-10',
     }
*/
window.CV_DETAIL = {
  // Which release the figures above describe. Shown next to the hours so
  // nobody reads a release number as a live total.
  release: { name: '', date: '', source: '' },

  // For the coverage grid. Left null, the grid does not render — the count of
  // the world's languages is a contested, licensed figure and the booth should
  // cite whichever one Common Voice stands behind.
  world: { languages: null, source: '' },

  // Where the language's own page lives, for the QR beside the panel.
  pageUrl: 'https://commonvoice.mozilla.org/{locale}',

  langs: {},
};
