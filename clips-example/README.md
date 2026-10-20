# What a clips folder looks like

Hand this folder to anyone cutting clips. It is the shape
`tools/build-bank.mjs --clips` expects, and `tools/check-clips.mjs` is the
thing that tells you whether yours matches before you waste a build on it.

```
clips/
  ca/
    index.json
    common_voice_ca_41773421.mp3
    common_voice_ca_41773508.mp3
    …
  cy/
    index.json
    common_voice_cy_39882014.mp3
    …
  sw/
    …
```

One folder per **Common Voice locale code** — `ca`, `cy`, `sw`, `nan-tw`,
`rm-sursilv`. Not language names, not English names, not your own
abbreviations: the code has to match `tools/languages.json`, because that is
what ties a clip to the hours and the demographics the big screen puts next
to it. `tools/check-clips.mjs` will tell you if one is wrong.

## index.json

An array, one entry per clip in that folder.

```json
[
  { "file": "common_voice_ca_41773421.mp3",
    "sentence": "No havien passat ni deu minuts des que havia deixat caure el mocador." }
]
```

| Field | Required | What it is |
|---|---|---|
| `file` | yes | The audio file's name, in this same folder. Not a path — just the name |
| `sentence` | yes | What is actually said, exactly as the corpus has it |

Anything else is ignored, so extra columns you happen to have are harmless.

**`sentence` is not optional in practice.** It is the caption shown after the
answer, which is what a visitor who could not hear the clip gets, and it is
the best part of the teaching moment for everyone else. A clip with no
sentence still plays; it just arrives on the pad with nothing to show. The
validator warns about every one.

**Do not include contributor identifiers.** `client_id` is in the Common
Voice TSVs and has no business in a file we publish to a website. The
validator rejects it.

## The clips

- **Six seconds**, cut. `CLIP_SECS` in `tools/prepare-clips.sh` if that ever
  changes, but it must match `run.clipSecs` in `defaults.js` or the pad will
  cut the audio off early.
- **From `validated.tsv`**, not `other.tsv`. Validated clips have been checked
  by other contributors, which is the difference between a fair question and
  six seconds of somebody's doorbell.
- **mp3**, mono, 32kHz, 64kbps is what `prepare-clips.sh` produces — about
  50kB a clip. `.m4a`, `.ogg` and `.wav` also work if you have them already.
- **Twelve per language** is the default the bank build takes. More is fine;
  it uses what it needs and ignores the rest.
- **Different speakers.** Twelve clips by one prolific contributor teaches
  visitors that one person's voice, not a language. `prepare-clips.sh`
  shuffles, which mostly handles it, but it is worth a look for the small
  languages where one person may be most of the corpus.

## Which languages

Any of the 114 in `tools/languages.json`. Every language you add is also a
plausible **wrong** answer for the others, so a handful makes a thin game —
thirty is comfortable, and all 114 is about 100MB of mp3, which is fine for a
static site and fine for an iPad to hold.

Favour the ones the booth is for. A visitor who has never heard Kabyle and
now knows what it sounds like is the entire point; another six seconds of
English is not.

## Check it before you send it

```
node tools/check-clips.mjs ./clips
```

It checks locale codes, index shape, that every file named exists and every
file present is named, duplicates, formats, contributor ids, and — if
`ffprobe` is on your path — that the durations are what they should be.
Nothing is written; it only reports.

Then:

```
node tools/build-bank.mjs --sentences ../common-voice/server/data --clips ./clips
node tools/build-fonts.mjs
```

Both, in that order. The fonts are cut to the characters in the bank, so a
new language with the old font set renders as boxes.
