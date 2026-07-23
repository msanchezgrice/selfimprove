# HANDOFF — "Patch Notes" self-improving episodic video pilot

_Last updated: July 15, 2026, ~5:30pm CT. Repo: `msanchezgrice/selfimprove` (PUBLIC — never commit secrets here). Live: **https://selfimprove-iota.vercel.app/pilot**_

## What this is

An experiment inside SelfImprove: a nightly AI-run video drama ("Patch Notes"). Devon, 26, lives one episode per night. The audience votes on what he does next; the winning vote becomes the next episode — script written by Claude, video rendered by Higgsfield, published autonomously. Persistent character state (job, savings, energy, social, mood) mutates with every choice; nothing resets. Concept docs: `docs/pilot-spec.md` (includes the X/Twitter distribution plan with native polls — not yet implemented).

## Architecture (all in this repo)

- **UI**: `src/app/pilot/` — episode player, vote card, character state, archive ("Previously" list loads any past episode's video), Run-cycle test button, feature leaderboard (coming-soon).
- **API**: `src/app/api/pilot/`
  - `state` (GET, public) — full public state.
  - `vote` (POST, public) — cookie-deduped (`pilot_voter`) vote on the open poll.
  - `cycle` (POST public; GET keyed with `?key=<CRON_SECRET>`) — closes poll, tallies winner, Claude writes next beat (structured output via `src/lib/ai/call-claude.ts`), applies state deltas, opens next poll, attempts Higgsfield **API** render. Keyed GET response also returns `cycle.videoPrompt` + `script` for external render sessions. 60s cooldown guard (429).
  - `render` (POST, public) — polls a Higgsfield API render and finalizes it.
  - `attach` (GET, keyed) — `&episodeId=..&url=<encoded mp4>` attaches a rendered video (or `&failed=1`). Used by the nightly session.
  - `reset` (GET, keyed) — `&episodeId=..` clears one episode's video for re-render; `&all=1&confirm=yes` wipes the show back to a fresh Episode 1 (owner explicitly requested this capability). **Status: written, in cloud workspace clone only — see "In flight".**
- **Lib**: `src/lib/pilot/` — `types.ts`, `seed.ts` (Episode 1 + Devon's canonical image), `store.ts` (state = single JSON blob in **Supabase Storage**, bucket `pilot`, object `state.json`, zero migrations; service-role via `createAdminClient`), `higgsfield.ts` (platform-API client; body must be wrapped in `{"params": {...}}` — a 422 taught us that).
- **Persistence caveat**: JSON-blob store has no locking; two rapid cycles can race (it happened — harmless dupes). Graduate to real tables (`pilot_episodes`, `pilot_votes`) when validated.

## The two Higgsfield accounts (critical)

1. **Consumer app** (higgsfield.ai, via the "Higgsfield mcp" claude.ai connector): ~5,800 Ultra credits. Has **kling3_0** with spoken audio. This is what renders episodes today (via Claude sessions, not the website).
2. **Platform API** (platform.higgsfield.ai, key in Vercel env `HF_API_KEY`/`HF_API_SECRET`, key name "PatchNotes Pilot (Vercel)"): **0 credits — API renders 403 "Not enough credits"**. Separate billing at cloud.higgsfield.ai. Only silent DoP motion models anyway. Buy credits there only if in-server rendering is wanted as fallback.

## Render pipeline (the one that works)

Two-step, via the MCP, per episode:
1. `generate_image` `nano_banana_pro`, 9:16, medias `[{value: "28d73e3b-67e5-45ec-9a92-63b27c3dbdf2", role: "image"}]` — that job id is **Devon's canonical face** (clean, no text). Prompt = cinematic still of the scene's opening moment. MUST include "ABSOLUTELY NO TEXT anywhere…" (models love burning in garbled fake captions — this bit us twice).
2. `generate_video` `kling3_0`, 9:16, 10s, mode pro, sound on, `start_image` = step-1 job id. Prompt starts with the NO TEXT clause, ≤2 spoken lines from the script, end on Devon's face, teal-and-amber grade. If a preset recommendation notice returns, retry with `declined_preset_id`.
3. Attach via the keyed `attach` endpoint (WebFetch GET works), or patch `state.json` directly.

Recurring cast so far: **Marcus** (warm, teasing friend), **Sam** (woman, late 20s, long dark hair, strained friendship — she was sober at the bar; it's a whole thing).

## Nightly automation

Scheduled task **`trig_01PWCJf8g74WgY3qWBsUq1Bs`** — "Patch Notes nightly episode (cycle + render)", cron `5 2 * * *` UTC (9:05pm CT). Fresh session each night: keyed GET cycle → two-step MCP render (connector confirmed available in its session config) → keyed GET attach → push notification. Test it anytime with `fire_trigger`. Note: `update_trigger` CAN edit the prompt in place — no need to delete/recreate (learned late).

## Environment / access map (for a Claude session)

- **Sandbox egress is blocked** to the Vercel app, Supabase, platform.higgsfield.ai, and CloudFront. Workarounds: WebFetch for GETs; for POST/PUT use the user's Chrome via Control_Chrome tools — open a **dedicated new tab and always pass `tab_id`** (the user browses actively; we collided). For Supabase Storage writes, open any `gsazgjlcyisllrncfsik.supabase.co` URL in that tab and fetch same-origin with the service-role key from `.env.local`.
- **git push**: only the user can (macOS keychain auth). Agent workflow: edit in cloud clone → `device_commit_files` into `/Users/miguel/selfimprove` → ask user to push (Vercel auto-deploys from main).
- **Vercel**: MCP connector works for deployments/logs (project `prj_zpcue7ZvHmqaIoqWUyulft6GsEQQ`, team `team_u0wDTS7c5LCJER7iJRLHOLWM`). No env-var tool — env changes go through the dashboard UI via Chrome (works fine).
- **Secrets**: `ANTHROPIC_API_KEY` in Vercel prod was rotated ~4pm CT today (old one was dead). ⚠️ The user's local `.env.local` still holds the DEAD Anthropic key — run `vercel env pull` locally to refresh. `CRON_SECRET` (keyed endpoints) is in `.env.local` and Vercel env. Never paste any of these into this public repo.

## Current live state (as of handoff)

Six episodes exist. Eps 1–4 have kling videos with audio attached (1 "One More Ticket", 2 "Last Call Lucidity", 3 "Nineteen Days, Said Aloud", 4 "The Laugh That Landed Wrong"). **Ep 5** "The Drink That Answered Back" — kling render was in flight: job `a1bf7f79-089e-4d17-9039-b39bf0423f58` (check `job_display`, then attach). **Ep 6** exists, unrendered, script unread — likely moot because the owner wants a full reset.

## In flight / immediate TODO

1. **Finish the new build the owner asked for** ("start from scratch + free input form"):
   - `reset` route: DONE in cloud clone (`/home/claude/repo/src/app/api/pilot/reset/route.ts`), not yet committed to the user's machine or pushed.
   - `suggest` route: NOT STARTED. Spec: `POST /api/pilot/suggest {episodeId, text}` — public; current open poll only; sanitize (trim, strip newlines, 5–80 chars); max ~5 write-ins/episode; adds option `{id: "w1".., label: text, detail: "Community write-in ✍️", votes: 1}`; the suggesting voter's cookie counts as their vote; reject if already voted. Write-ins are ordinary options — if one wins, the cycle route's beat-writer runs it (consider adding one prompt line: "if the chosen action is a community write-in, implement it faithfully, PG-13").
   - Client (`pilot-client.tsx`): add write-in input to the vote card; add a small collapsible "Showrunner" panel — password-type key field + "Start from scratch" (GET reset all) + "Reset this episode's video" (GET reset episodeId) with result messaging.
   - Type-check pattern: `/home/claude/tsconfig.pilot.json` + stubs in `/home/claude/stubs/` (`npx tsc -p tsconfig.pilot.json`).
   - Then `device_commit_files` → user pushes → verify deploy via Vercel MCP.
2. Attach ep-5's video if the reset isn't done first.
3. After deploy: owner resets, seeds a fresh Episode 1, and the community/write-in loop starts clean.
4. Test the nightly task with `fire_trigger` once and read its run summary.

## Roadmap (agreed, not started)

X/Twitter posting with native polls as the primary voting surface (spec in `docs/pilot-spec.md`; needs paid X API). Feature leaderboard goes live: viewer-voted platform features shipped as real PRs by the existing selfimprove worker (the dual-changelog hybrid). Devon as a trained Higgsfield Soul for tighter face consistency. Virality-predictor QA gate before publishing. Real DB tables for votes at scale.

## Hard-won gotchas

Anthropic-style `401 authentication_error` surfacing in the cycle route = the **Anthropic** key, not Higgsfield. Higgsfield REST wants `{"params": {...}}` wrappers. Image models bake garbled captions into frames unless told ABSOLUTELY NO TEXT (check seed images before animating from them — the caption propagates into every video). `create_trigger`/oversized MCP results need the saved-file + python parse trick. Vercel deploy of env-only changes = dashboard Redeploy button. The user's votes on a fresh poll default to a 0-0-0 tie → first option wins a no-vote cycle.
