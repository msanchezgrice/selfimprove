---
date: 2026-04-10T20:34:10Z
session_name: general
researcher: claude
git_commit: ce1b61b
branch: main
repository: selfimprove
topic: "SelfImprove Phase 1 Complete + Agent Onboarding + Worker Pipeline"
tags: [implementation, ai-product-manager, saas, supabase, vercel, fly-io, claude-code-worker]
status: complete
last_updated: 2026-04-10
last_updated_by: claude
type: implementation_strategy
root_span_id: ""
turn_span_id: ""
---

# Handoff: SelfImprove Phase 1 Complete — Full AI Product Manager SaaS

## Task(s)

### Completed
- **Full Phase 1 build** from bare Next.js scaffold to deployed SaaS (60+ commits)
- **Supabase schema** — 7 tables + build_jobs + migrations (00001-00008)
- **Auth** — GitHub/Google OAuth, auto org creation, GitHub token persistence in DB
- **Stripe billing** — checkout, webhooks, portal, tier enforcement, product catalog
- **AI pipeline** — callClaude, signal summarization, roadmap generation, PRD generation
- **Dashboard** — 6 tabs (Signals→Briefs→Roadmap→Building→Shipped→Archive), project selector, URL slugs
- **Widget** — vanilla JS, shadow DOM, voice companion (Gemini 2.5 Flash transcription), dynamic config from API
- **Auto-implementation** — Claude Code worker on Fly.io (4GB perf VM), creates branches + PRs
- **AI PR review** — approval agent reviews diffs, posts GitHub comments
- **Briefs pipeline** — signals → briefs (icebox) → roadmap (cap 25), auto-promotion
- **Quantified impact estimates** — baseline → predicted metrics on roadmap items
- **Experiment designs** in PRDs — A/B test hypothesis, control/variant, metrics
- **PostHog integration** — event ingestion, hourly sync, "Sync Now" button
- **Email digest system** — welcome, roadmap ready, daily digest, connect reminders (Resend)
- **GitHub webhook** for instant PR merge detection + 5-min sync cron
- **Periodic signal sources** — weekly site re-scan, weekly codebase re-scan, 6-hourly GitHub activity monitor
- **Agent-first CLI onboarding** — `POST /api/cli/init` with GitHub token auto-creates account + project
- **Magic login link** for new CLI users (no separate signup)
- **Moltbook-style one-liner** on landing page — `Read /setup and follow instructions`
- **72 unit tests** passing
- **OG image, favicon, site.webmanifest, full SEO metadata**

### In Progress / Known Issues
- Worker timeout at 15min may not be enough for very large repos
- Some PRD auto-generation still misses items (page-load fallback works)
- PostHog needs Personal API key (phx_), not Project key (phc_) — documented in UI

## Critical References
- Handoff specs: `~/.gstack/projects/msanchezgrice-asoprs/selfimprove-phase1-handoff.md`, `selfimprove-session2-handoff.md`
- Briefs/icebox spec: `~/.gstack/projects/msanchezgrice-asoprs/selfimprove-briefs-icebox-spec.html`
- CLI spec: `~/.gstack/projects/msanchezgrice-asoprs/selfimprove-cli-spec.html`

## Recent changes
- `src/app/api/cli/init/route.ts` — zero-signup onboarding via GitHub token, magic link for new users
- `src/app/setup/page.tsx` — instructions page for agent-first onboarding
- `src/app/_components/copy-prompt.tsx` — Moltbook-style one-liner + detailed prompt components
- `src/app/dashboard/_components/briefs-cards.tsx` — briefs tab with promote/archive/vote
- `src/lib/ai/generate-roadmap.ts` — briefs pipeline, auto-promotion, impact estimates
- `src/lib/ai/generate-prd.ts` — success metrics, analytics events, experiment designs
- `worker/process-job.ts` — 15min timeout, retry logic, CLAUDE.md constraints, git identity
- `src/lib/notifications.ts` — email digest system (Resend)
- `src/app/api/cron/` — 6 cron jobs (roadmap, sync-github, digest, github-activity, site-scan, codebase-scan)

## Learnings
- **Supabase provider_token expires after ~1 hour** — must store GitHub token in DB on login, not rely on session
- **Fly.io worker needs 4GB** for Claude Code CLI — 512MB and 2GB both OOM. Removed Bash from allowedTools and added CLAUDE.md to prevent npm install
- **Next.js 16 uses `proxy.ts`** not `middleware.ts` — read docs at `node_modules/next/dist/docs/`
- **RLS blocks first-time user setup** — use admin client for org/project creation in auth callback
- **`after()` from next/server** is the right pattern for background work after response (replaces fire-and-forget promises that timeout)
- **Briefs pipeline is critical** — without it, roadmap gets cluttered with low-confidence items from cold-start scans
- **Magic links via `auth.admin.generateLink({ type: 'magiclink', email })** work for CLI-created users to access dashboard without OAuth

## Post-Mortem

### What Worked
- **Agent-based implementation**: spawning sub-agents for multi-file changes preserved main context and produced clean results
- **Incremental deployment**: commit → push → deploy after each feature meant bugs were caught immediately
- **Supabase MCP tools**: applying migrations and querying data directly was much faster than manual SQL
- **Fly.io for worker**: persistent process with git + Claude Code CLI is the right pattern for code generation

### What Failed
- **Option A (Vercel Function + Claude API)**: one-shot code generation without repo exploration produced fragile output. Replaced with worker (Option C)
- **Worker at 512MB/2GB**: Claude Code CLI needs substantial memory. OOM'd repeatedly until scaled to 4GB performance VM
- **`execa` package**: incompatible with Node 22 + tsx in Docker. Replaced with `child_process.execSync`
- **Individual email notifications**: too noisy. Replaced with daily digest

### Key Decisions
- **Worker over Vercel Function for implementation**: Claude Code CLI needs persistent filesystem, git, and iterative exploration. Vercel Functions can't do this.
- **Briefs → Roadmap pipeline**: AI items land in Briefs first, only high-confidence items promote to Roadmap (cap 25). Prevents roadmap clutter.
- **GitHub token in DB**: Supabase doesn't persist provider_token after JWT refresh. Storing in org_members.github_token solves all token expiry issues.
- **Magic links for CLI users**: eliminates the "CLI creates account but user can't log in" problem without requiring separate OAuth flow.

## Artifacts
- `src/lib/ai/` — all AI pipeline modules (call-claude, generate-roadmap, generate-prd, approval-agent, cold-start, queue-build, implement, github-issue, transcribe-audio, summarize-signals, daily-cap, import-github-issues)
- `src/lib/notifications.ts` — email digest system
- `src/lib/github/get-token.ts` — GitHub token helper
- `src/lib/auth/api-key.ts` — API key auth for CLI
- `src/lib/stripe/` — client, tier-enforcement, products
- `src/lib/supabase/` — server, browser, admin, auth-helpers, get-active-project
- `worker/` — index.ts, process-job.ts, Dockerfile, fly.toml
- `public/widget.js` — feedback + voice widget
- `supabase/migrations/` — 00001 through 00008
- `vercel.json` — 6 cron jobs
- `README.md` — comprehensive project documentation

## Action Items & Next Steps

### High Priority
1. **Security audit (`/cso`)** — OWASP, secrets, dependencies before public launch
2. **Custom domain** — point selfimprove.dev to Vercel
3. **Test the full CLI onboarding flow** with a fresh GitHub account
4. **Signal dedup** — fuzzy match similar signals before generating briefs
5. **Sentry webhook endpoint** — receive error events as signals

### Medium Priority
6. **Post-ship measurement** — compare metrics before/after shipping, compute estimate accuracy
7. **Smart ranking** — compound ROI score with signal weight, recency, historical accuracy
8. **Image upload in widget** — camera icon for screenshot feedback
9. **`npx selfimprove` CLI package** — proper npm package with interactive setup
10. **SELFIMPROVE.md auto-detection** — GitHub webhook detects the file and auto-onboards

### Lower Priority
11. **@selfimprove/react** npm package
12. **Conversational voice** (Gemini 3.1 Live bidirectional)
13. **SSO / enterprise features**
14. **Landing page design polish** — compare to mockups

## Other Notes

### Infrastructure
- **Web**: Next.js 16 on Vercel, 35+ routes
- **DB**: Supabase `gsazgjlcyisllrncfsik` (us-east-1), 8 migrations applied
- **Worker**: Fly.io `selfimprove-worker` (performance-1x, 4GB RAM, iad region)
- **Email**: Resend (RESEND_API_KEY in Vercel)
- **Billing**: Stripe (all keys configured)

### Cron Schedule
| Schedule | Path | Purpose |
|----------|------|---------|
| Hourly | /api/cron/roadmap | Generate roadmaps + sync PostHog |
| Every 5 min | /api/cron/sync-github | Detect merged/closed PRs |
| Every 6 hours | /api/cron/github-activity | Import new GitHub issues |
| Daily 9AM | /api/cron/digest | Email digest + connect reminders |
| Weekly Sun 3AM | /api/cron/site-scan | Re-scan project sites |
| Weekly Sun 4AM | /api/cron/codebase-scan | Re-scan codebases via worker |

### Live URLs
- App: https://selfimprove-iota.vercel.app
- Worker: selfimprove-worker.fly.dev (internal only)
- Supabase: https://gsazgjlcyisllrncfsik.supabase.co
