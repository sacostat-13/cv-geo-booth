// Builds cv-data.js (languages, countries, dialects) and world.js (geometry)
// from the frozen Common Voice snapshot + the curated country/dialect maps.
const fs = require('fs');
const P = __dirname + '/';

const OUT = require('path').join(__dirname, '..') + '/';

const enNames = require('i18n-iso-countries/langs/en.json').countries;
const codes = require('i18n-iso-countries/codes.json');
const world = require(P + 'world.json');
const locCountries = require(P + 'locale-countries.json');
const dialects = require(P + 'dialects.json');
delete dialects._note;

// ---- languages from the snapshot CSV -------------------------------------
function parseCSV(txt) {
  const rows = [];
  for (const line of txt.trim().split('\n').slice(1)) {
    const f = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ',' && !q) { f.push(cur); cur = ''; }
      else cur += c;
    }
    f.push(cur);
    rows.push(f);
  }
  return rows;
}
const langs = parseCSV(fs.readFileSync(P + 'cv-languages.csv', 'utf8')).map(r => ({
  l: r[0],
  n: r[1],
  o: +r[2],                     // open for contribution
  h: +r[3],                     // recorded hours
  v: +r[4],                     // validated hours
  s: +r[5],                     // speakers in Common Voice
}));

// ---- countries -----------------------------------------------------------
const nameOf = c => (typeof enNames[c] === 'string' ? enNames[c] : (enNames[c] && enNames[c][0])) || c;

// Small territories absent from the 50m geometry: give them a visible disc so
// a pin still has somewhere to land.
const EXTRA = {
  MT: [14.42, 35.9], MV: [73.47, 3.2], AG: [-61.8, 17.08], KY: [-81.25, 19.32],
  GI: [-5.35, 36.14], RE: [55.53, -21.12], MQ: [-61.02, 14.64], GP: [-61.55, 16.25],
  GF: [-53.2, 3.95], YT: [45.17, -12.82], KI: [-157.4, 1.87], MH: [171.18, 7.11],
  FM: [158.21, 6.92], PW: [134.58, 7.51], MP: [145.75, 15.19], TO: [-175.2, -21.18],
  TV: [179.2, -8.52], TK: [-171.85, -9.2], WF: [-176.2, -13.3], KN: [-62.73, 17.33],
  VC: [-61.19, 13.25], VG: [-64.62, 18.42], VI: [-64.9, 18.33], TC: [-71.8, 21.7],
  PM: [-56.33, 46.88], SH: [-5.72, -15.96], BQ: [-68.24, 12.18], CX: [105.68, -10.45],
  CC: [96.87, -12.17], SJ: [17.0, 78.0], BV: [3.41, -54.42], UM: [-160.0, 5.88],
};
function disc(lon, lat, r) {
  const ring = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push([+(lon + Math.cos(a) * r / Math.cos(lat * Math.PI / 180)).toFixed(2), +(lat + Math.sin(a) * r).toFixed(2)]);
  }
  ring.push(ring[0]);
  return ring;
}
const have = new Set(world.map(w => w.c));
for (const [c, [lon, lat]] of Object.entries(EXTRA)) {
  if (have.has(c)) continue;
  world.push({ c, n: nameOf(c), g: [disc(lon, lat, 0.55)], k: [lon, lat], r: 2, tiny: 1 });
}
world.sort((a, b) => a.c.localeCompare(b.c));
for (const w of world) w.n = nameOf(w.c) || w.n;

// Country list for the picker: only countries we can actually draw a pin in.
const countries = world.map(w => ({ c: w.c, n: w.n }));
const drawable = new Set(countries.map(c => c.c));

// ---- invert locale -> countries -----------------------------------------
const byCountry = {};
const global = [];
for (const [loc, cs] of Object.entries(locCountries)) {
  if (!cs.length) { global.push(loc); continue; }
  for (const c of cs) {
    if (!drawable.has(c)) continue;
    (byCountry[c] ||= []).push(loc);
  }
}
// order each country's languages by Common Voice size, biggest first
const hours = Object.fromEntries(langs.map(l => [l.l, l.h]));
for (const c of Object.keys(byCountry)) {
  byCountry[c].sort((a, b) => (hours[b] ?? 0) - (hours[a] ?? 0));
}

const unmapped = langs.filter(l => !(l.l in locCountries)).map(l => l.l);
const missingCountries = countries.filter(c => !byCountry[c.c]).map(c => c.c);

const meta = {
  source: 'https://commonvoice.mozilla.org/api/v1/stats/languages',
  fetched: '2026-10-08',
  locales: langs.length,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + 'cv-data.js',
  '/* Common Voice snapshot ' + meta.fetched + ' — ' + meta.source + ' */\n' +
  'window.CV = ' + JSON.stringify({ meta, langs, countries, byCountry, global, dialects }) + ';\n');
fs.writeFileSync(OUT + 'world.js', 'window.WORLD = ' + JSON.stringify(world) + ';\n');

console.log('locales:', langs.length, '| countries drawable:', countries.length);
console.log('locales with no country mapping:', unmapped.length ? unmapped.join(' ') : 'none');
console.log('countries with no suggested language:', missingCountries.length, missingCountries.join(' '));
console.log('cv-data.js', fs.statSync(OUT + 'cv-data.js').size, 'bytes | world.js', fs.statSync(OUT + 'world.js').size, 'bytes');
