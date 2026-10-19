# Common Voice booth — guess the language

Two iPads and a 42" screen. A visitor listens to a six-second recording, or
reads a sentence, and picks which of four languages it is. The screen tells
them what it was, who has recorded it for Common Voice, and who has not.

If both pads start at the same moment it becomes a duel.

```
/a        pad, station A        /pad.html?station=A
/b        pad, station B        /pad.html?station=B
/screen   the 42"               /display.html
/         which is which        index.html
```

## Why it is built this way

**The booth does not depend on the venue.** Every question, every clip and
every figure on the screen is in the repo, generated once by
`tools/build-bank.mjs` and deployed. The only thing that crosses the network
is the handful of calls that let the three devices agree on what is
happening. If all of those fail the quiz still plays, still corrects a wrong
answer and still teaches; it just does not reach the board. That is the right
failure for a booth and the wrong one to discover on the day.

**Every wrong answer is corrected, in under three seconds, by name.** Testing
with no feedback leaves people remembering the option they picked: in Butler
and Roediger's work, intrusions from the wrong lure outnumbered correct
answers in the no-feedback condition, and about three quarters of those
intrusions were the specific wrong option the person had chosen. A guess-the-
language quiz with no correction actively teaches people that Tagalog is
Indonesian. So the pad names the answer every time, says why the mistake was
a fair one, and shows the missed languages again on the end card — immediate
correction plus a second look, inside ninety seconds, which is all the
"later" a booth has.

**Distractors are chosen, not drawn.** One of the three wrong answers is
always from the same family as the right one. That is the confusion worth
having — someone who picks Portuguese for Catalan has learned something when
the screen explains it; someone who picks Korean for Catalan has only learned
that they were guessing. In read mode a second distractor shares the script
where one exists, so an Armenian sentence with three Latin-script options is
not answerable by recognising the alphabet.

**Six-second clips.** Past about six seconds a listener who does not know the
language gains very little, and every extra second comes straight out of the
queue. Two replays, no time penalty.

**Five questions, twenty seconds each.** Roughly a 75–90 second turn, which
is where expo operators put anything with a line behind it. Two pads at that
rate serve about 80 people an hour.

**The run ramps.** The first two questions come from languages most people
have heard spoken; the last from one they probably have not. Nobody should
walk away from a Common Voice booth having scored zero, and nobody should
walk away without having met a language they did not know was in there.

**Two boards, two rules.** `This hour` keeps each set of initials' *best*
single run, so playing six times cannot fill the top six and the board stays
a reason for the next person in the queue to play. `Today`, which is the one
with swag attached, *adds runs up* under the same initials — which is what
makes "go and get your friend to play for you" work. The social mechanic
lives on the day board where it cannot crowd out the live one.

**A duel is a scoreline, not a takeover.** When two people race, the band
across the top of the panel carries the two scores and one short line about
who took it — and the language just answered keeps the rest of the screen.
Who won matters for ten seconds; what Setswana is matters after they have
left. The band comes down twelve seconds after the result.

**Light, not dark.** A hall is lit and the screen is large: dark panels at
three metres read as switched off, and near-black text on paper beats pale
text on black at that distance. The brand reds are darkened from `#FF4F5E`,
which is about 3:1 on white and under the line for text. The pads match —
one booth should not be black on the table and white on the wall, and at
arm's length a near-black iPad is a mirror of the room.

**No welcome splash.** A full-screen call to action is the worst-performing
attract screen there is; people look at it and walk past. The screen stays
live — reacting to whatever the pads are doing — and the instruction sits in
a strip along the bottom.

## Reading mode is not a fallback

It is offered first, beside Listen, with the same scoring and the same board.
A festival hall is loud, and a visitor who cannot use the audio should not be
sorted onto a separate leaderboard. Clips are captioned with their transcript
after the answer, which doubles as the teaching moment for everyone.

Headphones on both pads, with the pad's own volume control. Speakers are both
an access problem and a sound-overlap problem in a hall.

## Running it

```
npm install
node tools/build-config.js
npx http-server -p 8080          # or any static server
```

Open `/pad.html?station=A`, `/pad.html?station=B` and `/display.html` in three
tabs of the same browser. In local mode the three pages talk over a
BroadcastChannel and run the same pairing and scoring rules in the page, so
the whole booth — duels included — rehearses on a laptop with no deploy and
no network.

With the real backend:

```
netlify dev                      # functions + blobs, mode=netlify
netlify dev --live               # same, over an HTTPS tunnel
```

## Rebuilding the question bank

```
node tools/build-bank.mjs --sentences ../common-voice/server/data
node tools/build-bank.mjs --sentences ../common-voice/server/data --clips ./clips
```

`--sentences` points at `server/data` from a clone of
`github.com/common-voice/common-voice` — CC0 sentence files, one folder per
locale. `--clips` is described in `tools/fetch-clips.md`; without it the
booth is read-only and says so.

Writes `bank.js` (the questions) and `quiz-data.js` (per-language hours,
contributor counts and the gender, age, accent and variant splits the reveal
panel draws). Both come from the release JSONs in `data/`, downloaded from
`github.com/common-voice/cv-dataset`. **Drop in a newer release and rebuild
before the festival** — the figures on the screen are dated and visitors can
check them.

`tools/languages.json` is the curated language table: family, region, script
and how widely known each language is. Adding a language is a line there plus
a rebuild.

## Layout

```
index.html        which URL goes on which device
pad.html/js/css   the iPad quiz
display.html/js/css   the 42" screen
quiz.js           run building, scoring, and the facts — shared by both
store.js          transport: netlify, or local for rehearsal
defaults.js       every number the booth runs on, with the reason for it
config.js         generated per deploy from environment variables
bank.js           generated: the questions
quiz-data.js      generated: Common Voice figures per language
data/             the Common Voice release JSONs the above are built from
media/clips/      generated: the audio, when there is any
netlify/functions/quiz.mjs   the whole API: join, pair, round, finish, state
tools/            the generators, the language table, the clip notes
```

`defaults.js` is the file to read first. Every timing, score and threshold is
there with a sentence saying why it has that value, and every one of them can
be overridden by an environment variable at deploy time — see
`tools/build-config.js`.

## What is not done

- **No clips yet.** Listen mode is built and tested but `media/clips/` is
  empty until someone runs `tools/prepare-clips.sh` against a Common Voice
  download. See `tools/fetch-clips.md`. The pads disable the Listen button
  and say so.
- **No designer pass.** The palette is a stand-in and `img/common-voice.svg`
  does not exist yet; the header holds space for the real mark.
- **`/api/quiz/*` is open** — no auth, no rate limit. Fine for a booth on a
  URL nobody has; not fine for a public link.
- **The initials denylist is short.** It covers the obvious three-letter
  combinations and folds anything blocked to `CV` rather than arguing with
  someone at a booth. There is no staff "remove this entry" control yet; the
  way to clear a bad entry today is to delete the `board` blob.
- **Two copies of the scoring rules** — `netlify/functions/quiz.mjs` and the
  local half of `store.js`. Change one, change the other.
