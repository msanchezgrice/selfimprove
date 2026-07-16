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
4. Video render (default = **consumer HTTP** on click):
   - Continuity model: **seed video → choice → render**. Devon stays the same
     person; each night's clip starts from the previous episode's last frame
     (falling back to the seed face still).
   - Cycle submits a Kling job to `fnf.higgsfield.ai` using `HF_REFRESH_TOKEN`,
     stores `hfRequestId`, and returns. Client + `after()` poll until the mp4
     attaches.
   - Legacy `session` mode leaves `rendering` for an external CLI →
     `GET /api/pilot/attach?key=CRON_SECRET&episodeId=…&url=…`
   - Opt-in cloud API: set `PILOT_RENDER_MODE=api` + `HF_API_KEY` /
     `HF_API_SECRET` (platform.higgsfield.ai is a **separate** product and
     often has 0 credits — do not confuse with consumer account balance).
5. The next poll opens.

Character consistency is the product. Action/mood change with the vote; the
face should not. A later upgrade is training Devon as a Higgsfield Soul.

## Storage

`pilot_state` Postgres row (jsonb + optimistic `version`) with a Supabase
Storage blob fallback (`pilot/state.json`). Votes are deduped per browser via
a `pilot_voter` cookie.

## Env vars (Vercel)

| Var | Purpose |
|---|---|
| `PILOT_RENDER_MODE` | `auto` (default), `consumer`, `api`, `session`, or `off` |
| `HF_REFRESH_TOKEN` | Consumer OAuth refresh (from `~/.config/higgsfield/credentials.json`) — required for click-to-render |
| `HF_ACCESS_TOKEN` | Optional warm access token; refreshed automatically |
| `CRON_SECRET` | Auth for keyed cycle / attach / pending-render endpoints |
| `HF_API_KEY` / `HF_API_SECRET` | Only if `PILOT_RENDER_MODE=api` (platform keys — separate product) |
| `ANTHROPIC_API_KEY` | Beat writing |

With `HF_REFRESH_TOKEN` set, **Run one night** submits Kling i2v on the funded
consumer account and the page polls until the clip attaches. No local CLI step.

Legacy CLI helper (session mode only):
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
