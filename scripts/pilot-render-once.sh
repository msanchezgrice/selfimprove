#!/usr/bin/env bash
# Pick up the oldest pending /pilot episode and render it via the Higgsfield
# *consumer* CLI (funded account), then attach the mp4.
#
# Requires:
#   - higgsfield CLI authenticated (`higgsfield account status`)
#   - CRON_SECRET + APP_BASE_URL (or pass BASE as $1)
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

PENDING=$(curl -fsS "$BASE/api/pilot/render?key=$KEY&pending=1")
EPISODE_ID=$(echo "$PENDING" | python3 -c 'import sys,json; p=json.load(sys.stdin).get("pending"); print(p["episodeId"] if p else "")')
if [[ -z "$EPISODE_ID" ]]; then
  echo "No pending episode"
  exit 0
fi

PROMPT=$(echo "$PENDING" | python3 -c 'import sys,json; print(json.load(sys.stdin)["pending"]["videoPrompt"])')
SEED=$(echo "$PENDING" | python3 -c 'import sys,json; print(json.load(sys.stdin)["pending"]["seedImageUrl"])')

echo "Rendering $EPISODE_ID via consumer CLI…"

SEED_PATH="$SEED"
if [[ "$SEED" == http://* || "$SEED" == https://* ]]; then
  SEED_PATH=$(mktemp /tmp/pilot-seed.XXXXXX.png)
  curl -fsSL "$SEED" -o "$SEED_PATH"
fi

# Vertical image-to-video on the funded consumer account (not platform API keys).
OUT=$(higgsfield generate create kling2_6 \
  --prompt "$PROMPT" \
  --image "$SEED_PATH" \
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

ENC=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$URL")
curl -fsS "$BASE/api/pilot/attach?key=$KEY&episodeId=$EPISODE_ID&url=$ENC"
echo
echo "Attached $URL → $EPISODE_ID"
