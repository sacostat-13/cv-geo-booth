# Deploying and running the booth

## Netlify

Connect the repo. The build command is `node tools/build-config.js` and the
publish directory is `.` — both are already in `netlify.toml`, so a fresh
site needs nothing typed in.

One function, `netlify/functions/quiz.mjs`, serving `/api/quiz/*`. State lives
in Netlify Blobs; there is no database and nothing to provision.

### Environment variables

All optional. The booth runs with none of them set.

| Variable | Default | What it is |
|---|---|---|
| `BOOTH_EVENT_NAME` | `MozFest 2026` | Shown across the top of the screen |
| `BOOTH_EVENT_SLUG` | `mozfest-2026` | Which bucket of scores this booth writes to. **Change it for a rehearsal** so practice runs do not land on the festival board |
| `BOOTH_QUESTIONS` | `5` | Questions per run |
| `BOOTH_ANSWER_MS` | `20000` | Clock per question |
| `BOOTH_REVEAL_MS` | `3500` | How long the answer holds the pad |
| `BOOTH_CLIP_SECS` | `6` | Must match how the clips were cut |
| `BOOTH_REPLAYS` | `2` | Replays per clip |
| `BOOTH_LEVEL` | `normal` | Where both pads sit between visitors: `easy`, `normal` or `hard` |
| `BOOTH_MULT_NORMAL` | `2` | What one right answer on Normal is worth, counted in Easy answers |
| `BOOTH_MULT_HARD` | `5` | The same for Hard |
| `BOOTH_PERFECT_BONUS` | `2` | The perfect-run bonus, counted in right answers at that level (so `2` on Hard is +1,000) |
| `BOOTH_DUEL_WINDOW_MS` | `3500` | How long a pad waits for a challenger |
| `BOOTH_DUEL_READY_MS` | `5000` | The shared countdown before question one |
| `BOOTH_POLL_MS` | `1000` | Screen poll while someone is playing |
| `BOOTH_IDLE_POLL_MS` | `3000` | Screen poll while nobody is |
| `BOOTH_HOUR_TOP` | `10` | Rows on the hour board |
| `BOOTH_DAY_TOP` | `3` | Rows on the day board |
| `BOOTH_LANGUAGE_URL` | Common Voice datasets page | Where the QR points; `{locale}` is substituted |

### What the free plan can take

The binding limit on this repo's history has been **production deploys at 15
credits each**, out of 300 a month — about twenty deploys. Deploy
deliberately; use deploy previews while building.

Function invocations are the other number worth watching, and the screen is
the only thing polling continuously. At 1s while someone is playing and 3s
while nobody is, a seven-hour day is roughly 20,000 calls, so a three-day
festival sits near 60,000 against a 125,000/month allowance. The pads are
cheap: a run is one `join`, a few `pair` polls during the duel window, five
`round` posts and one `finish`.

If it looks tight, raise `BOOTH_IDLE_POLL_MS` first — nobody is watching the
screen closely when nobody is playing.

## Before the festival

1. **Rebuild the bank from a current release.** Download the newest
   `cv-corpus-*.json` and `sps-corpus-*.json` from
   `github.com/common-voice/cv-dataset` into `data/`, then
   `node tools/build-bank.mjs --sentences ../common-voice/server/data --clips ./clips`.
   The hours and contributor counts are on a two-metre screen with a QR code
   beside them; a visitor can check them.
2. **Add the clips.** `tools/fetch-clips.md`. Without them Listen mode is
   disabled and half the booth is missing.
3. **Rehearse against `netlify dev --live`** with the real iPads on the real
   stand, including a duel. The multi-language and duel paths have been
   tested against the local store and the function's own code, but not yet
   against deployed Netlify Blobs.
4. **Set `BOOTH_EVENT_SLUG` to something else while rehearsing**, then change
   it back.
5. **Decide whose Netlify account owns the site.** It is a personal account
   today.

## On the day

- Open `/a` on the left pad and `/b` on the right, **add each to the home
  screen** and launch from there: full screen, no address bar, nothing to
  swipe back to. Guided Access locks a visitor out of the rest of the iPad.
- Set both pads to never sleep, plug them in, and turn the volume up to where
  the headphones are comfortable. Lock the volume if Guided Access allows it.
- Open `/screen` on the 42", full screen, and leave it.
- All three must point at the **same origin**. A pad on `localhost` and a pad
  on the deployed URL are two different booths and will never duel.
- Headphones on both pads. Wipes beside them.

## If something goes wrong

**The board is offline.** The screen says so in the bottom strip and keeps
the last picture it had. The pads keep working: the quiz, the corrections and
the end card are all local. Scores posted while the backend is down are lost,
and the pad tells the player so rather than pretending.

**A pad is stuck mid-run.** It returns to the start screen by itself after 90
seconds of no touches. Reloading is harmless; the station is remembered.

**The big screen stopped showing the language mid-question.** It should not:
the pad keeps the run alive with two keep-alives, the backend's stale window
clears a whole question, and the reveal panel is sticky while anyone is
playing. If it happens anyway, check the clocks — the screen measures ages
against the server's `now`, so this should be immune, but a pad whose clock
is badly wrong can still time its own question oddly. `BOOTH_POLL_MS` and
`padLiveMs` in `defaults.js` are the knobs.

**A duel will not start.** Both pads must choose the *same mode* within
`BOOTH_DUEL_WINDOW_MS` of each other. Different modes, or four seconds apart,
is two solo runs — which is the intended behaviour, not a fault.

**Someone has put something unpleasant on the board.** There is no remove
button yet. Delete the `<event-slug>/board` blob from the Netlify Blobs UI;
the individual runs under `<event-slug>/runs/` survive, so the day's totals
can be rebuilt by hand if it matters.

**Start the day clean.** The day board filters to today, so yesterday drops
off by itself. To clear mid-day, delete the `board` blob.
