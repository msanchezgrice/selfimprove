#!/usr/bin/env bash
# Render the next /pilot episode from the season continuity chain:
#   seed video → choice → render (Devon stays the same person)
#
# Uses the previous episode's last frame (or the seed face) as the i2v start
# image so character identity carries forward.
#
# Requires: higgsfield CLI auth, ffmpeg, CRON_SECRET, APP_BASE_URL
#
# Usage:
#   CRON_SECRET=… APP_BASE_URL=https://selfimprove-iota.vercel.app ./scripts/pilot-render-once.sh

set -euo pipefail

BASE="${APP_BASE_URL:-${1:-}}"
KEY="${CRON_SECRET:-}"

if [[ -z "$BASE" || -z "$KEY" ]]; then
  echo "Set APP_BASE_URL and CRON_SECRET" >&2
  exit 1
fi

if ! command -v higgsfield >/dev/null 2>&1; then
  echo "higgsfield CLI not found on PATH" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg required to pull the previous episode's last frame" >&2
  exit 1
fi

PENDING=$(curl -fsS "$BASE/api/pilot/render?key=$KEY&pending=1")
EPISODE_ID=$(echo "$PENDING" | python3 -c 'import sys,json; p=json.load(sys.stdin).get("pending"); print(p["episodeId"] if p else "")')
if [[ -z "$EPISODE_ID" ]]; then
  echo "No pending episode"
  exit 0
fi

PROMPT=$(echo "$PENDING" | python3 -c 'import sys,json; print(json.load(sys.stdin)["pending"]["videoPrompt"])')
PREV_VIDEO=$(echo "$PENDING" | python3 -c 'import sys,json; print(json.load(sys.stdin)["pending"].get("previousVideoUrl") or "")')
START_STILL=$(echo "$PENDING" | python3 -c 'import sys,json; p=json.load(sys.stdin)["pending"]; print(p.get("startImageUrl") or p.get("seedImageUrl") or "")')

WORKDIR=$(mktemp -d /tmp/pilot-render.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

START_PATH="$WORKDIR/start.png"

# Prefer last frame of the previous episode video — that's the continuity lock.
if [[ -n "$PREV_VIDEO" ]]; then
  echo "Pulling last frame from previous episode for Devon continuity…"
  curl -fsSL "$PREV_VIDEO" -o "$WORKDIR/prev.mp4"
  # -sseof seeks from end; one frame near the hold on Devon's face.
  ffmpeg -y -sseof -0.4 -i "$WORKDIR/prev.mp4" -frames:v 1 -q:v 2 "$START_PATH" >/dev/null 2>&1 \
    || ffmpeg -y -i "$WORKDIR/prev.mp4" -vf "select=eq(n\,0)" -frames:v 1 -q:v 2 "$START_PATH" >/dev/null 2>&1 \
    || true
fi

# Fallback: seed / prior poster still.
if [[ ! -s "$START_PATH" ]]; then
  echo "Falling back to start still…"
  curl -fsSL "$START_STILL" -o "$START_PATH"
fi

echo "Rendering $EPISODE_ID (character-locked from continuity frame)…"

OUT=$(higgsfield generate create kling2_6 \
  --prompt "$PROMPT" \
  --image "$START_PATH" \
  --aspect_ratio 9:16 \
  --duration 10 \
  --wait --json)

URL=$(echo "$OUT" | python3 -c '
import sys,json
data=json.load(sys.stdin)
jobs = data if isinstance(data, list) else [data]
for j in jobs:
  if j.get("result_url"):
    print(j["result_url"]); raise SystemExit
  for k in ("url","video_url"):
    if j.get(k):
      print(j[k]); raise SystemExit
')

if [[ -z "$URL" ]]; then
  echo "Render produced no URL — marking failed"
  curl -fsS "$BASE/api/pilot/attach?key=$KEY&episodeId=$EPISODE_ID&failed=1" >/dev/null
  exit 1
fi

# Capture this episode's last frame as its poster for tomorrow's continuity.
curl -fsSL "$URL" -o "$WORKDIR/new.mp4"
POSTER="$WORKDIR/poster.png"
ffmpeg -y -sseof -0.3 -i "$WORKDIR/new.mp4" -frames:v 1 -q:v 2 "$POSTER" >/dev/null 2>&1 || true

ENC=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$URL")
ATTACH_URL="$BASE/api/pilot/attach?key=$KEY&episodeId=$EPISODE_ID&url=$ENC"

# Optional poster upload via data URL is too large — pass poster only if we host it.
# For now attach video; poster stays prior continuity still until we add upload.
curl -fsS "$ATTACH_URL"
echo
echo "Attached $URL → $EPISODE_ID"
