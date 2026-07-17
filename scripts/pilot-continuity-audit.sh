#!/usr/bin/env bash
# Build visual boundary evidence for every adjacent /pilot episode pair.
# This is diagnostic: pixel similarity cannot judge a deliberate camera change,
# but the side-by-side first/last frames make motion, wardrobe, prop, location,
# and screen-direction breaks immediately reviewable.

set -euo pipefail

BASE="${APP_BASE_URL:-${1:-https://shipsitself.com}}"
OUT="${2:-/tmp/pilot-continuity-audit-$(date +%Y%m%d-%H%M%S)}"

for command_name in curl jq ffmpeg ffprobe; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required" >&2
    exit 1
  fi
done

mkdir -p "$OUT"
STATE="$OUT/state.json"
curl -fsS "$BASE/api/pilot/state" -o "$STATE"

EPISODES=()
while IFS= read -r row; do
  EPISODES+=("$row")
done < <(jq -r '.episodes[] | select(.videoUrl != null) | [.number, .id, .videoUrl] | @tsv' "$STATE")

if (( ${#EPISODES[@]} < 2 )); then
  echo "Need at least two rendered episodes; state saved to $STATE"
  exit 0
fi

for row in "${EPISODES[@]}"; do
  IFS=$'\t' read -r number episode_id video_url <<<"$row"
  video="$OUT/ep-${number}.mp4"
  curl -fsSL "$video_url" -o "$video"
  ffmpeg -y -ss 0.05 -i "$video" -frames:v 1 "$OUT/ep-${number}-first.png" >/dev/null 2>&1
  ffmpeg -y -sseof -0.25 -i "$video" -frames:v 1 "$OUT/ep-${number}-last.png" >/dev/null 2>&1
  echo "Extracted Episode $number ($episode_id)"
done

for (( index=1; index<${#EPISODES[@]}; index++ )); do
  IFS=$'\t' read -r prior_number _ _ <<<"${EPISODES[$((index-1))]}"
  IFS=$'\t' read -r next_number _ _ <<<"${EPISODES[$index]}"
  prior="$OUT/ep-${prior_number}-last.png"
  next="$OUT/ep-${next_number}-first.png"
  pair="$OUT/boundary-ep-${prior_number}-to-${next_number}.png"

  ffmpeg -y -i "$prior" -i "$next" \
    -filter_complex \
    "[0:v]scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black[left];[1:v]scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black[right];[left][right]hstack=inputs=2" \
    -frames:v 1 "$pair" >/dev/null 2>&1

  ssim=$(
    ffmpeg -i "$prior" -i "$next" \
      -lavfi "[0:v]scale=540:960[a];[1:v]scale=540:960[b];[a][b]ssim" \
      -f null - 2>&1 |
      sed -n 's/.*All:\([0-9.]*\).*/\1/p' |
      tail -1
  )
  echo "Ep $prior_number final | Ep $next_number first → $pair (diagnostic SSIM ${ssim:-n/a})"
done

echo "Continuity audit: $OUT"
