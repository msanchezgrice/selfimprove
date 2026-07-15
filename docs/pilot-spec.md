# Patch Notes — the show that ships itself (/pilot)

A self-improving episodic video experiment running inside SelfImprove. Devon,
26, lives one episode per night. The audience votes on what he does next; an
AI writes the beat, renders the video, and opens the next poll — autonomously.

## The loop (one "night")

1. Poll closes → winner tallied (`POST /api/pilot/cycle`, nightly cron later;
   the "Run cycle" button on /pilot fast-forwards nights for testing).
2. Claude writes the next beat from **persistent character state** (job,
   savings, energy, social, mood) + episode history + the winning choice.
   Structured output via `callClaude` (same wrapper as roadmap/PRD gen).
3. State deltas are applied — consequences compound, nothing resets.
4. Video render (default = **consumer app**, not platform API keys):
   - Cycle leaves the episode as `rendering` and returns `videoPrompt` +
     `seedImageUrl`.
   - The Higgsfield consumer render session (CLI / MCP on the funded account)
     generates the clip and attaches it:
     `GET /api/pilot/attach?key=CRON_SECRET&episodeId=…&url=…`
   - Client polls `/api/pilot/state` until `videoUrl` lands.
   - Opt-in cloud API: set `PILOT_RENDER_MODE=api` + `HF_API_KEY` /
     `HF_API_SECRET` (platform.higgsfield.ai is a **separate** product and
     often has 0 credits — do not confuse with consumer account balance).
5. The next poll opens.

## Storage

`pilot_state` Postgres row (jsonb + optimistic `version`) with a Supabase
Storage blob fallback (`pilot/state.json`). Votes are deduped per browser via
a `pilot_voter` cookie.

## Env vars (Vercel)

| Var | Purpose |
|---|---|
| `PILOT_RENDER_MODE` | `session` (default, consumer→attach), `api` (platform keys), or `off` (script-only) |
| `CRON_SECRET` | Auth for keyed cycle / attach / pending-render endpoints |
| `HF_API_KEY` / `HF_API_SECRET` | Only if `PILOT_RENDER_MODE=api`. Not the consumer account. |
| `ANTHROPIC_API_KEY` | Beat writing |

Helper for a local consumer render pass:
`CRON_SECRET=… APP_BASE_URL=https://… ./scripts/pilot-render-once.sh`

## Distribution: X/Twitter (to implement)

Every episode also posts to a dedicated X account, and **voting happens in a
native X poll** — zero-friction voting where the audience already is.

- **Post**: after render completes, upload the clip via X API v2 media upload
  (chunked, `media_category=tweet_video`), then create a post: episode title +
  logline + a native poll (3 options, `duration_minutes` until 9pm close).
- **Tally**: at cycle time, read the poll results
  (`GET /2/tweets/:id?expansions=attachments.poll_ids&poll.fields=options`) and
  merge with site votes (site + X, simple sum to start).
- **Reply chain**: post the winner announcement + next episode as a reply so
  the season reads as one thread.
- **Requirements**: X API paid tier (media upload + polls), env vars
  `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
- **Code home**: `src/lib/pilot/x.ts` (post, poll-read), called from
  `/api/pilot/cycle` after render completion (move posting into the render
  poller so the video is attached).
- **QA gate idea**: run Higgsfield's virality predictor on each clip before
  posting; below-threshold clips get one automatic rewrite+rerender.

## Later

- Nightly Vercel cron (`/api/pilot/cycle` at 9pm CT) instead of the button.
- Feature leaderboard (currently "coming soon"): viewer-voted platform
  features shipped as real PRs by the existing SelfImprove worker — the
  platform improves itself alongside the show.
- Train Devon as a Higgsfield Soul for tighter face consistency.
- Multi-character scenes, locations unlocked by story progress.
