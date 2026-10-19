#!/usr/bin/env bash
# Cut a Common Voice locale down to a handful of booth-length clips.
#
#   bash tools/prepare-clips.sh <extracted-locale-dir> <out-dir> [count]
#
# <extracted-locale-dir> is the folder from a Common Voice download that has
# validated.tsv and clips/ inside it. Needs ffmpeg.
#
# Only validated clips are used: those have been checked by other
# contributors, which is the difference between a fair question and six
# seconds of somebody's doorbell. Clips shorter than the target are skipped
# rather than padded — a three-second clip is a harder question than the
# booth means to ask.
set -euo pipefail

SRC=${1:?usage: prepare-clips.sh <locale-dir> <out-dir> [count]}
OUT=${2:?usage: prepare-clips.sh <locale-dir> <out-dir> [count]}
COUNT=${3:-12}
SECS=${CLIP_SECS:-6}

command -v ffmpeg >/dev/null || { echo "ffmpeg not found"; exit 1; }
[ -f "$SRC/validated.tsv" ] || { echo "no validated.tsv in $SRC"; exit 1; }

mkdir -p "$OUT"
INDEX="$OUT/index.json"
echo "[" > "$INDEX"

# Columns vary between releases, so find path and sentence by name rather
# than by position.
PATH_COL=$(head -1 "$SRC/validated.tsv" | tr '\t' '\n' | grep -n '^path$'     | cut -d: -f1)
SENT_COL=$(head -1 "$SRC/validated.tsv" | tr '\t' '\n' | grep -n '^sentence$' | cut -d: -f1)
[ -n "$PATH_COL" ] && [ -n "$SENT_COL" ] || { echo "validated.tsv has no path/sentence columns"; exit 1; }

n=0
first=1
# Shuffle so a rebuild does not always take the same twelve speakers, and so
# the bank is not twelve clips by the same prolific contributor.
while IFS=$'\t' read -r -a row; do
  [ "$n" -ge "$COUNT" ] && break
  file="${row[$((PATH_COL-1))]}"
  sent="${row[$((SENT_COL-1))]}"
  [ -f "$SRC/clips/$file" ] || continue

  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC/clips/$file" 2>/dev/null || echo 0)
  awk -v d="$dur" -v s="$SECS" 'BEGIN { exit !(d+0 >= s+0) }' || continue

  base="${file%.*}.mp3"
  # Start half a second in: Common Voice recordings often open on the click
  # of the record button and a breath.
  ffmpeg -nostdin -v error -y -ss 0.5 -t "$SECS" -i "$SRC/clips/$file" \
         -ac 1 -ar 32000 -b:a 64k "$OUT/$base"

  esc=$(printf '%s' "$sent" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
  [ "$first" = 1 ] || echo "," >> "$INDEX"
  first=0
  printf '  {"file": %s, "sentence": %s}' "\"$base\"" "$esc" >> "$INDEX"
  n=$((n+1))
done < <(tail -n +2 "$SRC/validated.tsv" | shuf)

printf '\n]\n' >> "$INDEX"
echo "$n clips -> $OUT"
