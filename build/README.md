# Data build

Only needed when you want to refresh the Common Voice figures or rebuild the map
geometry. Deploying the site does not run any of this.

```bash
cd build
npm install
node world.js        # countries-50m -> world.json (simplified, with angular radii)
node make-data.js    # world.json + the CSV + the curated maps -> ../cv-data.js, ../world.js
node bundle.js       # optional: flatten the screen into one standalone file
```

## Refreshing the Common Voice snapshot

`cv-languages.csv` is a frozen copy of
`https://commonvoice.mozilla.org/api/v1/stats/languages` (281 locales, taken
2026-10-08). Replace it with a fresh pull — keep the same six columns — then run
`node make-data.js`.

`locale-countries.json` maps each Common Voice locale to the countries where it
is widely spoken, and `dialects.json` holds the curated variety lists. Both are
hand-maintained; edit and re-run.
