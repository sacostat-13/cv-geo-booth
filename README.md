# Voices in the Room — Common Voice booth prototype

Two pages that talk to each other through one table:

| File | Runs on | What it does |
|---|---|---|
| `display.html` (`/screen`) | the 42″ screen, 1080p landscape | rotating globe or flat map, pins, live counters, QR code |
| `index.html` (`/`) | visitors' phones (the QR target) | country → language → variety → initials → contribute |

`cv-booth-display.standalone.html` is the screen flattened into one file — handy
for a quick look or for a laptop with no web server. It cannot receive phone
submissions; use `display.html` for the real thing.

Nothing ever appears on the wall except what someone submits from a phone. There
is no seeded data and no simulate key, so what you see on the screen is real.

## Try it in 30 seconds

```bash
node tools/build-config.js    # writes config.js — local mode with no env vars set
python3 -m http.server 8080
```

Open `http://localhost:8080/display.html` for the screen and
`http://localhost:8080/` in a second tab for the phone flow. The wall starts
empty; add a language on the phone tab and watch it land. In local mode the two
tabs share the browser's own storage, so no backend is needed to walk through it.

On the screen: **P** switches between globe and flat map, **F** is fullscreen.

## Going live

`DEPLOY.md` has the full walkthrough. In short: connect the repo to Netlify and
deploy. **Nothing else is required** — on a Netlify build the site uses its own
two functions, backed by Netlify Blobs, as the wall.

## The three backends

| Mode | Where the wall lives | When it is chosen |
|---|---|---|
| `local` | the browser's own storage | a plain static server, no Netlify |
| `netlify` | Netlify Blobs, via `/api/submit` and `/api/wall` | automatically on a Netlify build |
| `supabase` | a Postgres table | when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set |

`local` is the only one that is not shared between devices: a phone's submission
stays on that phone. Both pages say so plainly when that happens, because a
silent failure here looks exactly like a working booth.


There is no URL to configure. `phoneUrl` defaults to empty, meaning "wherever
this page is served from", and the QR code is generated in the browser from that
— so the same commit works on a deploy preview, the renamed site and a custom
domain with nothing to change.

Both pages must be served over **HTTPS** — phone cameras will not open an
`http://` QR target, and Supabase requires it.

## Configuration

`defaults.js` holds every setting and is committed. `config.js` is generated on
each deploy by `tools/build-config.js` from the site's environment variables and
overrides the defaults; it is gitignored and should never be edited by hand.
`.env.example` lists the variables.

## Things worth knowing before the festival

- **The screen polls, it does not stream.** Default is every 3 seconds
  (`supabase.pollMs`). At a booth that is indistinguishable from live and it
  survives a flaky connection — a failed poll shows "Reconnecting" and retries
  rather than going blank.
- **The queue.** Submissions are celebrated one at a time for 10 seconds. When
  more than 5 are waiting the hold compresses toward 4 seconds so the wall never
  falls behind a queue of visitors. Both numbers are in `config.js`.
- **Pins then intensity.** Up to 40 pins per country (`display.pinMax`); above
  that the country fills with colour and shows a count instead, so the UK does
  not turn into a blob on day two.
- **Pin positions are stable.** Each pin's spot is derived from its row id, so
  reloading the screen does not reshuffle the map. New pins are placed as far as
  possible from the ones already in that country.
- **Gold means missing.** A language that is not in Common Voice is a gold pin
  and a gold card. That is the most useful thing this collects: a list of
  languages people at MozFest speak that Common Voice cannot yet hear.

## The data

`cv-data.js` is a frozen snapshot of the Common Voice language statistics
(`https://commonvoice.mozilla.org/api/v1/stats/languages`), taken **2026-10-08**:
281 locales with recorded hours, validated hours and speaker counts. It is baked
in on purpose — the booth should not depend on venue wifi to draw its own
headline numbers. Rebuild it with `node build/make-data.js` when you want fresher
figures.

The country → language suggestions in the same file are hand-curated: for each
Common Voice locale, the countries where it is widely spoken. It is a starting
point for the picker, not a claim about who speaks what — anyone can search all
281 languages, or type a language that is not there at all.

The QR code is drawn at runtime by
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT),
vendored under `vendor/` so the booth never depends on a CDN.

Map geometry is Natural Earth 1:50m via
[world-atlas](https://github.com/topojson/world-atlas) (public domain),
simplified and projected with Equal Earth (flat) or orthographic (globe).

## What is not built

- No moderation queue. Initials and the typed-in language name reach the screen
  directly. The SQL caps their length; that is all.
- No analytics or export beyond "select from the table".
- The second-level variety list is curated for about 80 languages. Everything
  else gets the free-text field only.
