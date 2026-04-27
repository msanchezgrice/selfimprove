# Project Brain / Project Memory V1.1

SelfImprove currently treats `roadmap_items` and `prd_content` as both output artifacts and memory. V1.1 separates those concerns and adds a stronger governance layer.

## Goal

Insert a durable knowledge layer and a resolver layer between raw `signals` and generated artifacts:

`signals -> project memory -> opportunity clusters -> ranked roadmap -> PRDs / build jobs`

## What Changed Since V1

1. Resolver is now treated as governance, not just context loading.
   It routes skills, filing, context, and next actions.
2. Dominant need is first-class.
   `current_focus` tells the system whether the product is optimizing for UX quality, conversion, virality, performance, retention, or another active mode.
3. The backlog is intentionally long, but structured.
   The main backlog unit becomes an `opportunity_cluster`, not a one-off brief generated from a signal batch.
4. Routing must be tested.
   Trigger evals and a weekly `check-resolvable` audit catch dark capabilities and resolver drift before users do.

## Principles

1. The harness stays thin.
   The app resolves context, applies guardrails, records runs, and writes structured outputs.
2. Skills stay fat.
   Reusable markdown procedures encode judgment for enrichment, roadmap synthesis, PRD authoring, implementation packets, impact review, and resolver audits.
3. Deterministic work stays deterministic.
   Ranking math, focus weighting, duplicate suppression, resolver selection, and run logging happen in code and SQL.
4. Memory is inspectable.
   Canonical project truths live in pages and page versions with citations back to the source evidence.
5. Routing is explicit.
   No skill should invent its own filing logic or hide its own invocation path.

## Terminology

- `project memory` / `project brain`
  The durable, inspectable memory layer for one product and repo.
- `opportunity cluster`
  A canonical long-backlog object that groups repeated evidence by theme and dominant need.
- `ranked roadmap`
  A projection over the long backlog, not the memory layer itself.
- `current_focus`
  The dominant product need right now. Example: `conversion` or `ux_quality`.

## Core Tables

### Shipped in `00009_add_project_brain.sql`

- `brain_pages`
  Canonical project truths such as current focus, pain map, repo map, open decisions, and safety rules.
- `brain_page_versions`
  Append-only compiled snapshots of each page.
- `brain_page_sources`
  Source graph from pages back to signals, roadmap items, and shipped changes.
- `brain_chunks`
  Retrieval surface for exact search now and semantic search later.
- `brain_skill_files`
  Versioned markdown skills stored in the database for auditability and future editing workflows.
- `brain_resolver_rules`
  Task-specific context rules that decide which pages must load.
- `brain_runs`
  Invocation log for every AI task with resolved context and completed writes.

### Proposed for V1.1

- `opportunity_clusters`
  Canonical long-backlog objects grouped by theme and dominant need.
- `opportunity_cluster_sources`
  Evidence graph from each cluster back to signals, pages, and shipped work.
- `resolver_triggers`
  Trigger table for task routing, fallback skills, and overlap management.
- `resolver_audits`
  Reachability and trigger-eval output for weekly resolver hygiene.

## Resolver Layers

Resolvers compose. They exist at multiple layers of the system.

### 1. Skill Resolver

Lives in agent config plus trigger tables.

Purpose:
- route user requests, cron events, and webhook events to the right skill
- keep capabilities reachable
- avoid overlap between similar skills

Failure mode:
- the skill exists, but nobody can invoke it

### 2. Filing Resolver

Lives in `docs/brain/RESOLVER.md` plus shared filing rules.

Purpose:
- decide whether new evidence updates a page, updates a cluster, creates a new cluster, or queues a review
- keep memory MECE enough to stay usable

Failure mode:
- every skill invents its own filing logic and memory degrades into a junk drawer

### 3. Context Resolver

Lives in `brain_resolver_rules`.

Purpose:
- load the smallest correct context set for a task
- put `current_focus` first for roadmap work

Failure mode:
- giant prompts, stale assumptions, and noisy context

### 4. Action Resolver

Lives in runtime policy and approval rules.

Purpose:
- decide whether a changed cluster should only rerank, refresh a brief, generate a PRD, queue implementation, or ask for approval

Failure mode:
- the system jumps straight from evidence to execution without the right gate

## Resolver Rules

### `generate_roadmap`

Load, in order:

1. `current_focus`
2. `project_overview`
3. `user_pain_map`
4. `active_experiments`
5. `open_decisions`
6. `release_notes`

### `generate_prd`

Load, in order:

1. `project_overview`
2. `current_focus`
3. `repo_map`
4. `implementation_patterns`
5. `safety_rules`
6. `metric_definitions`

## Backlog Model

### Signals

Raw evidence only. Never rank directly from here if a maintained cluster should exist.

### Opportunity Clusters

The long backlog.

Examples:
- onboarding friction
- landing-page clarity
- playback reliability
- pricing confusion

Every cluster should carry:
- `theme`
- `primary_need`
- `need_vector`
- `evidence_strength`
- `freshness_score`
- `confidence_score`
- `effort_score`
- `status`
- `latest_brief_md`

### Ranked Roadmap

A focus-weighted projection over opportunity clusters. This stays small enough to review.

### Now / Next

The execution slice with PRDs, approvals, and implementation packets.

## Refactor: `generateRoadmap()`

### Today

1. Fetch unprocessed signals.
2. Deduplicate.
3. Summarize.
4. Ask Claude to create ranked items.
5. Mark signals processed.

### V1.1

1. Resolve `current_focus` plus the required project pages.
2. Run the filing resolver on fresh signals:
   - attach to existing cluster
   - create a new cluster
   - update a project page
   - mark a page stale
3. Compute evidence strength, freshness, confidence, effort, and focus weighting in deterministic code.
4. Invoke `roadmap-synthesis` only on changed or high-uncertainty clusters.
5. Refresh cluster briefs.
6. Refresh the ranked roadmap slice.
7. Write `brain_runs`.
8. Update changed pages and citations.

Key policy:

The default action for a new signal is to update an existing cluster, not to create a new brief.

## Refactor: `generatePRD()`

### Today

1. Load a roadmap row.
2. Feed its evidence and traces back to Claude.
3. Save `prd_content` on the roadmap row.

### V1.1

1. Resolve project overview, current focus, repo map, implementation patterns, safety rules, and metric definitions.
2. Load the selected opportunity cluster and roadmap row.
3. Load recent shipped changes that touch the same area.
4. Invoke `prd-author`.
5. Write `brain_runs`.
6. Save `prd_content`.
7. Update affected memory pages with new constraints, questions, or implementation notes.

## Learning Loop

Shipped work should feed back into the system:

1. Collect actual metrics.
2. Compare them to PRD forecasts.
3. Update cluster strength and dominant-need weighting.
4. Run `impact-review`.
5. Update pages.
6. Propose skill or resolver changes.

If the same judgment is needed twice, it should become a skill update, filing rule, or resolver rule.

## Resolver Hygiene

Resolvers decay unless they are maintained.

V1.1 therefore assumes:

1. Trigger evals for real user/task phrasing.
2. A weekly `check-resolvable` audit.
3. Logging unmatched prompts and wrong-skill matches through `brain_runs`.
4. A nightly or weekly review loop that suggests trigger and priority edits.

The roadmap system should not only learn what to build. It should also learn whether its own routing table is still accurate.
