# Deploying the PoC on Netlify

Roughly 20 minutes, no build step, no framework. The pages are plain HTML and
JavaScript; Netlify serves them as static files and Supabase holds the one table
they share.

## 1. Supabase (5 min)

1. Create a project at supabase.com. Any region near the venue is fine.
2. SQL Editor → paste `supabase.sql` → Run.
3. Project Settings → API → copy the **Project URL** and the **anon / publishable
   key**. The anon key belongs in the client; that is what it is for. The RLS
   policies in the SQL are what keep it safe — insert and select only, no update,
   no delete, length caps on every text column.

## 2. Netlify (5 min)

The fastest route is app.netlify.com → **Add new site → Deploy manually**, then
drag the whole folder onto the drop zone. Netlify reads `netlify.toml` and serves
it as is.

For a repo-backed site instead: push the folder, connect it, leave the build
command empty and set the publish directory to the folder root.

You get a URL like `https://musing-curie-1a2b3c.netlify.app`. Rename it to
something readable under Site configuration → Change site name — people will see
it under the QR code on the big screen.

- `/` is the phone page (the QR target)
- `/screen` is the booth display

## 3. Point everything at itself (5 min)

Edit `config.js`:

```js
mode: 'supabase',
supabase: {
  url: 'https://YOUR-PROJECT.supabase.co',
  anonKey: 'eyJ...',
  table: 'submissions',
  pollMs: 3000,
},
phoneUrl: 'https://your-site.netlify.app/',
```

Then regenerate the QR and redeploy:

```bash
pip install segno
python3 make-qr.py https://your-site.netlify.app/
```

`config.js` and `qr.js` are served with `no-store`, so a redeploy reaches the
screen on the next refresh rather than sitting in a cache.

## 4. Check the loop end to end

Open `/screen` on a laptop and `/` on your phone — on cellular, not the same
wifi, so you are testing the real path. Submit a language. Within about three
seconds the country should light up, a pin should drop, and the card should show
that language's figures.

Then test the two things that actually go wrong at a booth:

- **Reload the screen.** It should come back with the accumulated map and sit
  quietly, not replay every submission one at a time. (It used to do exactly
  that; it is fixed, but it is the first thing to re-check after any change.)
- **Turn the laptop's wifi off for ten seconds.** The screen should say
  "Reconnecting to the booth" and recover on its own when the network returns,
  with nothing lost — the map is rebuilt from the table on every poll.

## Does any of this need React?

No. The screen is a canvas being drawn by hand and the phone page is four steps
of plain DOM; a framework would add a build step and a bundle without changing
what either one does. The things you might reasonably want next — a live
WebSocket feed instead of polling, a moderation queue, an admin view — are all
additions to the same static pages.

The one case for rebuilding is if this stops being a booth prototype and becomes
something Common Voice maintains and extends. At that point the argument is for
the team's existing stack rather than for React in the abstract.

## Live updates: polling vs. realtime

The screen polls every 3 seconds. At a booth that is indistinguishable from live,
and it has the useful property of healing itself — every poll rebuilds the whole
wall, so a dropped connection costs you nothing but a few seconds.

Supabase Realtime over WebSocket is the alternative. It is genuinely instant and
it is a two-line change to `store.js`, but a dropped socket needs reconnect and
catch-up logic that polling gets for free. For three days in a hall with shared
wifi, polling is the safer choice. If you want sub-second response, lower
`pollMs` to 1000 before reaching for WebSockets — a submission every few seconds
at a busy booth is nowhere near a rate that matters to Supabase's free tier.

## Cost

Netlify's free tier covers this comfortably — the whole site is about 450 KB and
the screen loads it once. Supabase's free tier covers the table; the screen makes
roughly 1,200 reads an hour at the default poll rate, which is well inside it.

## Before the festival

- Rebuild the Common Voice snapshot (`build/make-data.js`) so the figures on the
  screen are current.
- Decide who owns the Supabase project. Right now it would be a personal account,
  which is the one piece of this that is not on Mozilla infrastructure.
- Clear the table between the test run and the real event:
  `delete from public.submissions;`
