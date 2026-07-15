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

# Image-to-video via consumer models. Prefer kling / seedance when available;
# fall back to whatever the CLI exposes for i2v.
OUT=$(higgsfield generate create kling2_6 \
  --prompt "$PROMPT" \
  --start-image "$SEED" \
  --wait --json 2>/dev/null || true)

URL=$(echo "$OUT" | python3 -c '
import sys,json
try:
  data=json.load(sys.stdin)
except Exception:
  sys.exit(0)
# CLI --wait --json returns a job array or object
jobs = data if isinstance(data, list) else [data]
for j in jobs:
  for k in ("url","video_url","result_url"):
    if j.get(k):
      print(j[k]); sys.exit(0)
  results=j.get("results") or j.get("output") or {}
  if isinstance(results, dict):
    for k in ("url","raw","video"):
      v=results.get(k)
      if isinstance(v, str) and v.startswith("http"):
        print(v); sys.exit(0)
      if isinstance(v, dict) and v.get("url"):
        print(v["url"]); sys.exit(0)
' || true)

if [[ -z "$URL" ]]; then
  echo "Render produced no URL — marking failed"
  curl -fsS "$BASE/api/pilot/attach?key=$KEY&episodeId=$EPISODE_ID&failed=1" >/dev/null
  exit 1
fi

ENC=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$URL")
curl -fsS "$BASE/api/pilot/attach?key=$KEY&episodeId=$EPISODE_ID&url=$ENC"
echo
echo "Attached $URL → $EPISODE_ID"
