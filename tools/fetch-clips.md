# Getting the audio for Listen mode

The read questions build themselves: the sentences are CC0 and live in the
Common Voice repo. The clips do not. Common Voice audio is behind an
agreement you accept by hand on the website, once, and no script can do that
for you — which is correct, and which is why `tools/build-bank.mjs` takes a
folder of clips rather than a download URL.

Until that folder exists the booth runs in read mode only. That is a working
booth: the Listen button says so plainly and nothing else changes.

## What build-bank.mjs wants

```
clips/
  ca/
    index.json          optional: [{ "file": "x.mp3", "sentence": "…" }, …]
    common_voice_ca_1234.mp3
    …
  cy/
  sw/
  …
```

One folder per Common Voice locale code, matching the codes in
`tools/languages.json`. Twelve clips per language is the default and is
plenty: `--listen-per-language` changes it.

`index.json` carries the transcript for each clip. It is optional, but
without it the pad cannot show what was actually said after the answer —
which is both the caption for anyone who could not hear the clip and the best
part of the teaching moment. Include it.

## Getting there

1. Go to <https://commonvoice.mozilla.org/en/datasets>, pick a language,
   accept the terms and download the **delta** segment rather than the full
   corpus. The deltas are a fraction of the size and a booth needs twelve
   clips, not nine hundred hours. For small languages the full corpus is
   already small enough.

2. Extract it. Inside you get `clips/` and a set of TSVs. `validated.tsv` is
   the one to use — those clips have been checked by other contributors,
   which is the difference between a fair question and a recording of someone
   coughing.

3. Cut each clip to six seconds and build the index. `tools/prepare-clips.sh`
   does both; it needs `ffmpeg` on the path.

   ```
   bash tools/prepare-clips.sh ~/Downloads/cv-corpus-27.0-2026-09-11/ca ./clips/ca 12
   ```

4. Repeat for each language you want in Listen mode, then rebuild:

   ```
   node tools/build-bank.mjs --sentences ../common-voice/server/data --clips ./clips
   ```

   The clips are copied into `media/clips/` and committed with the site, so
   the pads never fetch audio over the venue's wifi.

## How many languages

Every language you add to Listen mode has to be a plausible wrong answer for
the others, so a handful of Listen languages makes a thin game. Thirty is
comfortable; the whole table of 114 is better and is about 100MB of MP3 at
six seconds a clip, which is fine for a static site and fine for an iPad to
hold.

Favour the languages the booth is actually for. A visitor who has never heard
Kabyle and now knows what it sounds like is the whole point; another six
seconds of English is not.

## Licensing

Common Voice clips are CC0. Nothing stops you shipping them with the site.
Keep `media/clips/` out of any build that is not the booth, though — it is
the only large thing in the repo.
