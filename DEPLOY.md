# Deploying from the repo to Netlify

No framework, no bundler. The only build step turns the site's environment
variables into `config.js`, because static pages cannot read environment
variables at runtime.

## 1. Connect the repo (5 min)

In Netlify: **Add new site → Import an existing project** → pick your Git
provider → choose the repo. `netlify.toml` supplies the build command, the
publish directory, the Node version and the functions directory, so leave all of
them alone.

That is the whole setup. On a Netlify build the site stores the wall in
**Netlify Blobs** through its own two functions — `POST /api/submit` and
`GET /api/wall` — which need no account, no credentials and no configuration.
The functions get the site's credentials automatically.

Every push to the production branch redeploys, and every pull request gets its
own deploy preview with its own URL and its own blob store.

### Clearing the wall between the test run and the real event

The wall is keyed by `BOOTH_EVENT_NAME`, so the simplest reset is to change that
variable — "MozFest 2026 day 1" and "MozFest 2026" are separate walls. To delete
the old entries properly, use the Netlify CLI:

```bash
netlify blobs:list cv-booth
netlify blobs:delete cv-booth "<key>"
```

## 2. If you would rather use Supabase

Netlify Blobs is the default and needs nothing. Supabase is worth moving to when
you want SQL over the results, or a wall that outlives the Netlify site.

1. Create a project at supabase.com. The free plan allows two active projects;
   pausing an idle one frees a slot and paused projects can be restored later.
2. SQL Editor → paste `supabase.sql` → Run.
3. Project Settings → API → copy the **Project URL** and the **anon /
   publishable key**. The anon key is meant to ship in the client; the RLS
   policies in that SQL are what constrain it — insert and select only.
4. Set the two variables below and redeploy. That switches the site from the
   Netlify functions to the Supabase table.

## 3. Optional environment variables

Site configuration → **Environment variables**. None of these are required.

| Variable | Value | Why |
|---|---|---|
| `BOOTH_EVENT_NAME` | `MozFest 2026` | names the wall; changing it starts a fresh one |
| `BOOTH_NAME` | `Common Voice` | the eyebrow text on the screen |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | from Supabase | switches off Netlify Blobs and uses Supabase instead |

You never set a mode flag. With no variables the site uses its own functions; set
the two Supabase ones and it uses Supabase. `.env.example` lists the optional ones — poll interval,
projection, highlight duration, pins per country, daily reset — all of which have
sensible defaults in `defaults.js`.

**Environment variables are read at build time, so changing one needs a
redeploy** (Deploys → Trigger deploy). That is a 20-second rebuild of a static
site, and it means the screen never has to be touched to change the booth's
behaviour — change `BOOTH_PROJECTION` to `map`, trigger a deploy, refresh the
screen.

Leave them unset on deploy previews and the preview keeps its submissions in the
viewer's own browser instead of the shared table — useful for showing the thing
to people without writing to the real wall. Set them per-context in Netlify if
you want previews pointed at a scratch Supabase project instead.

## 4. The URL takes care of itself

There is nothing to update when the Netlify URL changes. `phoneUrl` is empty by
default, which means "wherever this page is served from", and the QR code is
drawn in the browser from that. The same commit therefore works on:

- `https://random-name-1a2b3c.netlify.app` — straight after import
- `https://voices-mozfest.netlify.app` — after you rename the site
- `https://deploy-preview-7--voices-mozfest.netlify.app` — every PR preview
- `https://voices.mozillafoundation.org` — after a custom domain is attached

Rename the site under Site configuration → Change site name, and add a custom
domain under Domain management, whenever you like. The QR follows.

Set `BOOTH_PHONE_URL` only in the one case where that logic is wrong: if the
phone page is served from a different host than the screen.

- `/` is the phone page (the QR target)
- `/screen` is the booth display

## 5. Check the loop end to end

Open `/screen` on a laptop and `/` on your phone — on cellular, not the same
wifi, so you are testing the real path. Submit a language. Within about three
seconds the country should light up, a pin should drop, and the card should show
that language's figures.

**If the pin does not appear and the phone showed no error, the site is running
without a shared backend.** Both pages then fall back to the browser's own
storage, so the phone saves it locally and the screen never hears about it. The
screen says "Not connected to a shared wall — this screen only" across the top
and the phone says so on its confirmation, so this should be obvious rather than
mysterious. Open `https://your-site/config.js`: it should say `"mode":"netlify"`
(or `"supabase"` with your credentials). If it says `"mode":"local"`, the build
did not run on Netlify — check the deploy log for `[build-config] mode=`.

If the phone shows an error instead, the functions are the place to look:
`curl https://your-site/api/wall` should return `[]` on a fresh site.

Then the two things that actually go wrong at a booth:

- **Reload the screen.** It should come back with the accumulated map and sit
  quietly, not replay every submission one at a time.
- **Turn the laptop's wifi off for ten seconds.** It should say "Reconnecting to
  the booth" and recover on its own, with nothing lost — the map is rebuilt from
  the table on every poll.

## Working on it locally

```bash
node tools/build-config.js     # writes config.js; local mode with no env set
python3 -m http.server 8080
```

Then `http://localhost:8080/display.html` and `http://localhost:8080/`. To point
local work at Supabase, put the variables in your shell first:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... node tools/build-config.js
```

`config.js` is in `.gitignore` — it is generated on every deploy and should never
be committed.

## Does any of this need React?

No. The screen is a canvas drawn by hand and the phone page is four steps of
plain DOM; a framework would add a toolchain without changing what either one
does. The things you might want next — a WebSocket feed instead of polling, a
moderation queue, an admin view — are all additions to the same static pages.

The case for rebuilding comes if this stops being a booth prototype and becomes
something Common Voice maintains. The argument then is for the team's existing
stack, not for React in the abstract.

## Live updates: polling vs. realtime

The screen polls every 3 seconds and rebuilds the whole wall from each poll, so a
dropped connection costs a few seconds and nothing else. Supabase Realtime over
WebSocket is instant and is a short change in `store.js`, but a dropped socket
needs reconnect and catch-up logic that polling gets for free. For three days on
shared venue wifi, polling is the safer bet; if 3 seconds feels slow, set
`BOOTH_POLL_MS=1000` before reaching for sockets.

## Cost on Netlify's free plan

The free plan is 300 credits a month. What this site spends:

- **Production deploys cost 15 credits each**, so roughly 20 a month. This is the
  binding limit, not traffic — batch changes rather than pushing one-line fixes.
- Web requests are 2 credits per 10,000. The screen polls every 3 seconds, which
  is 1,200 requests an hour; a three-day festival at ten hours a day is about
  36,000 requests, or roughly 7 credits.
- Function compute is metered by GB-hour and is negligible at this volume.
- Blob storage is included; a submission is a few hundred bytes.

Supabase's free tier also covers this comfortably if you switch to it later.

## Known limits of this prototype

- `/api/submit` is open: anyone with the URL can add a voice, and there is no
  rate limit or moderation. The function caps field lengths and strips control
  characters, which is enough for a staffed booth and not enough for a link
  posted publicly.
- A screen reload re-reads the whole wall, so it costs one extra request, not a
  replay of every celebration.

## Before the festival

- Rebuild the Common Voice snapshot (`cd build && npm install && node make-data.js`)
  so the figures are current.
- Decide who owns the Netlify site. It would currently be a personal account.
- Clear the wall, either by changing `BOOTH_EVENT_NAME` or with
  `netlify blobs:delete`.
