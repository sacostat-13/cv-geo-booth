# Deploying from the repo to Netlify

No framework, no bundler. The only build step turns the site's environment
variables into `config.js`, because static pages cannot read environment
variables at runtime.

## 1. Supabase (5 min)

1. Create a project at supabase.com.
2. SQL Editor → paste `supabase.sql` → Run.
3. Project Settings → API → copy the **Project URL** and the **anon /
   publishable key**. The anon key is meant to ship in the client; the RLS
   policies in that SQL are what constrain it — insert and select only, no
   update, no delete, length caps on every text column.

## 2. Connect the repo (5 min)

In Netlify: **Add new site → Import an existing project** → pick your Git
provider → choose the repo.

Netlify reads `netlify.toml` and fills the rest in itself:

| Setting | Value | Where it comes from |
|---|---|---|
| Build command | `node tools/build-config.js` | `netlify.toml` |
| Publish directory | repo root | `netlify.toml` |
| Node version | 20 | `netlify.toml` |

Leave all three alone. Every push to the production branch redeploys, and every
pull request gets its own deploy preview with its own URL.

## 3. Environment variables (5 min)

Site configuration → **Environment variables** → Add a variable, for each of:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` |
| `BOOTH_EVENT_NAME` | `MozFest 2026` |
| `BOOTH_NAME` | `Common Voice` |

Setting the URL and the key is what switches the site from browser-local storage
to the shared table real phones write to; you do not set a mode flag. `.env.example` lists the optional ones — poll interval,
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

**If the pin does not appear and the phone showed no error, the site has no
backend configured.** Both pages fall back to the browser's own storage, so the
phone saves it locally and the screen never hears about it. The screen says
"Not connected to a shared wall — this screen only" across the top, and the
phone says so on its confirmation. Open `https://your-site/config.js` — if it
does not contain a `supabase` block with your URL and key, set the two
environment variables and **trigger a redeploy**; variables are read at build
time, so setting them is not enough on its own.

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

## Cost

Netlify's free tier covers this — the site is about 500 KB and the screen loads
it once. Supabase's free tier covers the table; the screen makes roughly 1,200
reads an hour at the default poll rate.

## Before the festival

- Rebuild the Common Voice snapshot (`node build/make-data.js`) so the figures
  are current.
- Decide who owns the Supabase project and the Netlify site. Both would currently
  be personal accounts.
- Clear the table between the test run and the real event:
  `delete from public.submissions;`
