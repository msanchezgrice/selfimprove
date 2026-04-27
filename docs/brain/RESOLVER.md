# SelfImprove Resolver

Purpose: route work, memory writes, and next actions without stuffing everything into one giant instruction file.

## Chain of Authority

1. Agent config routes requests into the right skill family.
2. This resolver decides where evidence and knowledge belong.
3. `skills/_filing-rules.md` clarifies common ambiguities.
4. `brain_resolver_rules` decides which pages load for a given task.
5. Runtime approval policy decides whether the system may act automatically.

## Skill Routing

When the task is:

- "refresh the roadmap", "what should we build next", "rerank backlog"
  -> `roadmap-synthesis`
- "expand this into a PRD", "make this implementation-ready"
  -> `prd-author`
- "ingest feedback", "pull in scans", "refresh repo understanding"
  -> `project-enrichment`
- "did this ship work", "was the forecast right"
  -> `impact-review`
- "why didn't the right skill fire", "audit the resolver", "find dark capabilities"
  -> `check-resolvable`

## Filing Rules

When new evidence arrives, prefer the smallest existing home:

1. If it clearly strengthens or weakens an existing opportunity cluster
   -> attach to that cluster
2. If it changes durable project truth
   -> update the relevant `brain_page`
3. If it changes both product truth and backlog relevance
   -> update the page and the cluster
4. If no cluster fits and the evidence repeats a real theme
   -> create a new `opportunity_cluster`
5. If the evidence is thin or ambiguous
   -> attach to a page or queue for review; do not mint a cluster by default

## Focus First

Before roadmap work, always load `current_focus`.

Example:

- `conversion`
  raises landing clarity, pricing friction, CTA visibility, signup drop-off
- `ux_quality`
  raises navigation friction, empty states, confusing flows, poor error recovery
- `performance`
  raises slow paths, crash loops, render blocking, reliability problems

## Action Routing

When a cluster changes:

1. If evidence changed but priority did not materially move
   -> rerank only
2. If the cluster thesis changed
   -> refresh the brief
3. If the cluster enters the roadmap slice
   -> allow PRD generation
4. If a PRD is approved
   -> emit implementation packet
5. If blast radius or policy threshold is high
   -> require manual approval

## Resolver Hygiene

- Every new skill must add trigger examples here or in the trigger registry.
- Every memory-writing skill must read this resolver before creating anything new.
- Weekly: run `check-resolvable`.
- Nightly: inspect unmatched prompts and trigger misses from `brain_runs`.
