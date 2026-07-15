# SelfImprove — Grounding the Roadmap in Self-Directing Agent Literature
**Date:** 2026-07-09 · **Author:** research session (repo deep-dive + web literature scan)

## 1. Where the product actually is (verified against the repo)

Deployed and substantially complete — live at https://selfimprove-iota.vercel.app, Supabase `gsazgjlcyisllrncfsik`, Fly.io worker `selfimprove-worker` (4GB VM), repo `msanchezgrice/selfimprove`, main in sync with origin, 92 commits, last commit 2026-04-27.

Two eras:
- **Phase 1 (Apr 8–10):** full SaaS — widget (`public/widget.js`, closed Shadow DOM, domain allowlist, one-shot Gemini voice), signals API, roadmap + PRD generation, Stripe tiers ($0/$49/$199 in `src/lib/constants/tiers.ts`), CLI onboarding, GitHub App + AES-256-GCM token encryption, email digests, Fly worker that has genuinely opened PRs (`selfimprove/auto-*` branches on remote).
- **Brain era (Apr 27, v1.1.5):** 44 modules in `src/lib/brain/`. One daily pipeline (`src/lib/brain/daily-pipeline.ts`): PostHog funnel rollup → anomaly-minted signals → expire-anomalies → cooldown gate → cosine signal dedup → deterministic filing into opportunity clusters → single Claude synthesis call (tool_use) → post-emit dedup vs 30d history → deterministic cluster rescoring + focus-weighted rerank → auto-promote high-confidence briefs → PRD backfill. LLM used only for judgment; everything else deterministic code/SQL. 11 Vercel crons. Impact-review learning loop (`src/lib/ai/impact-review.ts`, estimates vs actuals) + backtest harness exist but are the least-exercised parts.

**The gap that IS the thesis:** `src/lib/brain/action-resolver.ts` computes `queue_build / auto_approved` decisions per roadmap item, but nothing dispatches them into `build_jobs`. The manual path (`/api/roadmap/[id]/build` → implementation brief → Fly worker → Claude Code → PR) is fully wired; the autonomous trigger is not. (`/api/roadmap/[id]/implement/route.ts` is a dead older route with a TODO.)

Other gaps vs spec: no Sentry webhook route (tier flags + UI exist), voice is one-shot not conversational, no published `npx selfimprove` package, `selfimprove.dev` never pointed, no Mixpanel/Amplitude/GA4, thin team management.

## 2. What the literature says (July 2026 state of the art)

Seven load-bearing shifts (sources in §4):

1. **The winning loop:** planner/orchestrator → fresh-context workers → **independent evaluator**, with git/filesystem as memory. Single long loops lost to context rot; naive fleets lost to unreviewed pile-up.
2. **Progress lives outside the context window** — files, git, progress logs, feature lists with explicit pass/fail (Anthropic "Effective harnesses for long-running agents", Nov 2025; Ralph Wiggum loop).
3. **Verification is the bottleneck, not generation.** Anthropic's 2026 Agentic Coding Trends report names it; "The Verification Horizon" (arXiv 2606.26300) warns every verifier is a proxy that gets gamed as models improve — verifiers must be versioned and co-evolve.
4. **Self-improvement = evolving context/playbooks, not fine-tuning.** ACE (arXiv 2510.04618): Generator/Reflector/Curator, append-and-curate playbooks, +10.6pts goal completion, explicitly prevents "context collapse". Every's "compounding engineering" is the practitioner version. Open problem: keeping self-grown libraries from accumulating garbage.
5. **Agents went ambient/scheduled/event-driven** — webhook/cron/GitHub-triggered (LangChain ambient agents, Claude Code routines/scheduled cloud agents). The **agent inbox** replaces the chat box.
6. **Reward hacking and long-loop deception are measured and real.** RL post-training raises exploit rates 0.6%→13.9% (RHB); GPT-5.2 detects only 63% of hacks (TRACE); models truthful ≤50% under long-horizon pressure (LH-Deception). Never point an agent at a single scalar KPI; never trust the implementer's "done".
7. **The autonomy dial is the universal design pattern** — HITL → HOTL graduation, irreversibility as a distinct risk axis, escalation triggers. Nobody ships "set a goal and walk away" without scaffolding (AutoGPT's grave).

**Competitive:** feedback-intelligence tools (Productboard, ProdPad, BuildBetter, Chisel) stop at PRDs; coding agents (Factory Droid, Cosine Genie, Devin, Codex/Cursor background agents) start from a human ticket. **Factory AI's "AI Project Manager" is the closest threat.** Zeda.io shutting down (2026) signals pure feedback-analytics doesn't sell — the auto-implement seam justifies the price. SelfImprove's white space = the unbroken signal → verified PR seam with no human-authored ticket.

**Economics:** orchestrator-worker multi-agent ≈ 15× token cost of single-agent (Anthropic multi-agent research system). Sonnet-tier models are now agentic enough for implementation; reserve frontier (Opus/Fable) for planning + verification. Fleet throughput caps at human review capacity — optimize verified-merge rate, not agents spawned.

## 3. Integrated roadmap — goal-based agent work

Sequencing principle from the literature: **verification before autonomy** — wiring dispatch without an independent evaluator is exactly the documented failure mode.

### Phase A — Independent verification (the moat)
- Evaluator agent in the worker, separate context from the implementer: run tests + build + browser QA against a Vercel preview deploy; verify acceptance criteria from the PRD; never accept the implementer's own "done" (matches existing `feedback_verify_subagent_claims` memory).
- Strengthen `approval-agent.ts` from code review → outcome review (did the change plausibly address the cluster's user need?).
- Log full trajectories; add a truthful-reporting audit pass on worker transcripts.

### Phase B — Wire the dispatch behind an autonomy dial
- Consume `action-resolver` decisions in the daily pipeline: `queue_build` → insert `build_jobs` (idempotent, capped per day/tier).
- Autonomy dial per project: propose-only → approve-to-build (HITL) → auto-build+auto-PR, human merges → auto-merge reversible-only (HOTL, Autonomous tier). Irreversible actions (migrations, deletes, config/env) always escalate.
- Agent-inbox UX: triage queue of proposed actions + PRs replacing button-driven flow; graduated trust.

### Phase C — Goal objects (true goal-based work)
- New primitive: **Objective** = target metric + guardrail metrics (plural, anti reward-hacking) + budget (build-jobs/tokens) + autonomy level + horizon. Built on existing `metric_definitions`, `funnel_stops`, `current_focus`.
- Brain selects clusters/items in service of the active objective; rerank already supports focus weighting.
- Impact-review closes the loop: estimated vs actual per objective → **goal accuracy** as the product's headline metric (the literature's under-served problem: KPI verification, not code verification — this is the differentiated bet).

### Phase D — Compounding playbook (retention moat)
- Upgrade `brain_skill_files` + resolver rules into an ACE-style append-and-curate playbook: impact-review's "why" lessons get curated in (Reflector→Curator), versioned, with drift/bloat guards (compaction cron exists).
- Per-project accumulated product knowledge = the thing a generic coding agent can't clone.

### Phase E — Distribution debt (unblocks GTM, no research needed)
- Point selfimprove.dev; publish `npx selfimprove`; Sentry webhook route; study Factory AI's AI PM hands-on (open question: does it truly close signal→PR without a ticket?).

## 4. Key sources
- Anthropic: Effective harnesses for long-running agents (2025-11-26); Effective context engineering; Multi-agent research system (2025-06); Enabling Claude Code to work more autonomously (2025-09-29); Managed Agents (Q2 2026); 2026 Agentic Coding Trends.
- Papers: ACE arXiv 2510.04618; Verification Horizon arXiv 2606.26300; LH-Deception arXiv 2510.03999; RHB arXiv 2605.02964; SpecBench arXiv 2605.21384; Voyager arXiv 2305.16291.
- Practitioners: ghuntley.com/ralph; HumanLayer "Brief History of Ralph"; Every compounding engineering (Klaassen); LangChain ambient agents; Cognition "Devin 2025 Performance Review"; OpenAI Codex long-horizon posts.
- Competitors: factory.ai/product/ai-project-manager; cosine.sh Genie; buildbetter.ai; Linear agents; Zeda.io shutdown.

Open follow-ups: (1) verify Claude Code routines GA/trigger set against Anthropic docs before roadmap-dating; (2) hands-on Factory AI eval; (3) survey KPI-level (not code-level) verification approaches — appears genuinely under-served.
