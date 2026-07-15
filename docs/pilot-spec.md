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
4. Higgsfield renders a 10s vertical clip from Devon's canonical seed image
   (`/v1/image2video` on platform.higgsfield.ai). The client polls
   `POST /api/pilot/render` until the video lands.
5. The next poll opens.

## Storage

Prototype persistence is a single JSON blob in Supabase Storage
(bucket `pilot`, `state.json`) — zero migrations. Graduate to real tables
(`pilot_episodes`, `pilot_votes` with RLS) once the loop is validated.
Votes are deduped per browser via a `pilot_voter` cookie.

## Env vars (Vercel)

| Var | Purpose |
|---|---|
| `HF_API_KEY` / `HF_API_SECRET` | Higgsfield platform API (video renders). Create at platform.higgsfield.ai. Alternatively `HF_CREDENTIALS="key:secret"`. |
| `HIGGSFIELD_VIDEO_PATH` | Optional; defaults to `/v1/image2video/dop` |
| `HIGGSFIELD_VIDEO_MODEL` | Optional; defaults to `dop-turbo` |
| `ANTHROPIC_API_KEY` | Already set — beat writing |

Without HF creds, cycles still run and produce script-only episodes (poster +
script shown in the player), so the vote loop is testable end to end.

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
