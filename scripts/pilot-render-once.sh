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
VOICE_REF=$(echo "$PENDING" | python3 -c 'import sys,json; print(json.load(sys.stdin)["pending"].get("voiceReferenceUrl") or "")')

WORKDIR=$(mktemp -d /tmp/pilot-render.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

START_PATH="$WORKDIR/start.png"
PREV_PATH="$WORKDIR/prev.mp4"

# Prefer last frame of the previous episode video — that's the continuity lock.
if [[ -n "$PREV_VIDEO" ]]; then
  echo "Pulling last frame from previous episode for Devon continuity…"
  if curl -fsSL "$PREV_VIDEO" -o "$PREV_PATH"; then
    # -sseof seeks from end; one frame near the held script-supervisor boundary.
    ffmpeg -y -sseof -0.25 -i "$PREV_PATH" -frames:v 1 -q:v 2 "$START_PATH" >/dev/null 2>&1 \
      || true
  fi
fi

# Fallback: seed / prior poster still.
if [[ ! -s "$START_PATH" ]]; then
  echo "Falling back to start still…"
  curl -fsSL "$START_STILL" -o "$START_PATH"
fi

echo "Rendering $EPISODE_ID (character-locked from continuity frame)…"

HF_ARGS=(
  higgsfield generate create seedance_2_0
  --prompt "$PROMPT"
  --start-image "$START_PATH"
  --aspect_ratio 9:16
  --duration 10
  --resolution 720p
  --mode std
  --genre comedy
  --generate_audio true
)

# Live Seedance validation rejects a generic identity image plus a separate
# start image as duplicate start_image roles. The exact boundary is the visual
# anchor; the prior video carries Devon's identity and performance context.

# Prior video is a motion/performance/audio reference; the start image remains
# the exact spatial boundary and the identity image remains the canonical face.
if [[ -s "$PREV_PATH" ]]; then
  HF_ARGS+=(--video "$PREV_PATH")
fi

if [[ -n "$VOICE_REF" ]]; then
  if curl -fsSL "$VOICE_REF" -o "$WORKDIR/voice-source" && \
    ffmpeg -y -i "$WORKDIR/voice-source" -vn -ac 1 -ar 24000 "$WORKDIR/voice.wav" >/dev/null 2>&1; then
    HF_ARGS+=(--audio "$WORKDIR/voice.wav")
  fi
fi

HF_ARGS+=(--wait --wait-timeout 30m --json)
OUT=$("${HF_ARGS[@]}")

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

# Persist the exact final frame, not a provider thumbnail. It becomes the next
# episode's start image and is the visual source of truth for the shot ledger.
if [[ -s "$POSTER" ]]; then
  curl -fsS -X POST "$BASE/api/pilot/attach" \
    -F "key=$KEY" \
    -F "episodeId=$EPISODE_ID" \
    -F "url=$URL" \
    -F "lastFrame=@$POSTER;type=image/png"
else
  echo "Could not extract final frame; attaching video without a continuity frame" >&2
  ENC=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$URL")
  curl -fsS "$BASE/api/pilot/attach?key=$KEY&episodeId=$EPISODE_ID&url=$ENC"
fi
echo
echo "Attached $URL → $EPISODE_ID"
