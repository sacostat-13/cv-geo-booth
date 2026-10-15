/* SAMPLE DATA — invented figures, for looking at the panel while the real
   cv-detail.js is still empty. Never deploy with this file in use.

   To see the full panel locally, point display.html at this file instead:
     <script src="cv-detail.sample.js"></script>
   and change it back before committing. Everything below is made up. */
window.CV_DETAIL = {
  release: { name: 'Common Voice 00.0 (sample)', date: '', source: 'SAMPLE — not real' },
  world: { languages: 7000, source: 'SAMPLE — not real' },
  pageUrl: 'https://commonvoice.mozilla.org/{locale}',
  langs: {
    en: {
      iso: 'eng',
      scs: { hours: 3841 }, sps: { hours: 112 },
      variants: [], accents: ['England', 'Scottish', 'United States'],
      demographics: {
        gender: [{ label: 'male_masculine', pct: 58 }, { label: 'female_feminine', pct: 37 }, { label: 'not stated', pct: 5 }],
        age: [{ label: '19 - 29', pct: 31 }, { label: '30 - 39', pct: 24 }, { label: '40 - 49', pct: 16 }],
        accent: [{ label: 'United States', pct: 45 }, { label: 'England', pct: 21 }],
      },
      needs: 'SAMPLE: short on voices over 60.',
      source: 'SAMPLE — not real',
    },
    cy: {
      iso: 'cym',
      scs: { hours: 221 }, sps: { hours: 0 },
      variants: ['Gogledd', 'De'], accents: ['Cardiff', 'Valleys'],
      demographics: {
        gender: [{ label: 'male_masculine', pct: 61 }, { label: 'female_feminine', pct: 34 }],
        age: [{ label: '19 - 29', pct: 28 }, { label: '50 - 59', pct: 12 }],
        accent: [{ label: 'Cardiff', pct: 40 }],
      },
      needs: 'SAMPLE: short on voices from the north.',
      source: 'SAMPLE — not real',
    },
    sw: { iso: 'swh', scs: { hours: 412 }, sps: { hours: 0 }, variants: [], accents: [], source: 'SAMPLE — not real' },
  },
};
