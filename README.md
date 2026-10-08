# Voices in the Room — Common Voice booth prototype

Two pages that talk to each other through one table:

| File | Runs on | What it does |
|---|---|---|
| `display.html` | the 42″ screen, 1080p landscape | rotating globe or flat map, pins, live counters, QR code |
| `index.html` | visitors' phones (the QR target) | country → language → variety → initials → contribute |

`cv-booth-display.standalone.html` is the screen flattened into one file — handy
for a quick look or for a laptop with no web server. It cannot receive phone
submissions; use `display.html` for the real thing.

## Try it in 30 seconds

```bash
cd dist && python3 -m http.server 8080
```

Open `http://localhost:8080/display.html`. It starts in **demo mode** with seeded
data. Press **S** (or click the map) to fake a visitor, **P** to switch between
globe and flat map, **F** for fullscreen. Open `http://localhost:8080/` in a
second tab to walk the phone flow — in demo mode both tabs share the browser's
local storage, so a submission in one shows up on the other.

## Going live

1. **Database.** Run `supabase.sql` in your Supabase SQL editor. It creates one
   table with row-level security that allows anonymous `insert` and `select` and
   nothing else — no update, no delete.
2. **Config.** In `config.js` set `mode: 'supabase'`, paste the project URL and
   the anon key, and set `phoneUrl` to wherever you host `index.html`.
3. **QR.** `pip install segno && python3 make-qr.py https://your-url/` writes
   `qr.js`; the screen picks it up automatically.
4. **Hosting.** Both pages are static files. S3 + CloudFront works and keeps
   everything on Mozilla infrastructure; the only outbound call at runtime is
   the Supabase REST endpoint, plus Google Fonts (the pages fall back to system
   fonts if the venue blocks it).

Both pages must be served over **HTTPS** — phone cameras will not open an
`http://` QR target, and Supabase requires it.

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
headline numbers. Rebuild it from `build/make-data.js` when you want fresher
figures.

The country → language suggestions in the same file are hand-curated: for each
Common Voice locale, the countries where it is widely spoken. It is a starting
point for the picker, not a claim about who speaks what — anyone can search all
281 languages, or type a language that is not there at all.

Map geometry is Natural Earth 1:50m via
[world-atlas](https://github.com/topojson/world-atlas) (public domain),
simplified and projected with Equal Earth (flat) or orthographic (globe).

## What is not built

- No moderation queue. Initials and the typed-in language name reach the screen
  directly. The SQL caps their length; that is all.
- No analytics or export beyond "select from the table".
- The second-level variety list is curated for about 80 languages. Everything
  else gets the free-text field only.
