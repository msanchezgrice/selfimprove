-- Seed the Project Brain v1.1 resolver tables with the defaults that live in
-- src/lib/brain/design.ts so the DB stays in sync with the typed spec.
--
-- Uses ON CONFLICT DO UPDATE so this migration is idempotent and safe to
-- re-run (or to re-apply after editing design.ts).

-- ---------------------------------------------------------------------------
-- brain_resolver_rules seed (Context Resolver)
-- ---------------------------------------------------------------------------

insert into brain_resolver_rules (task_type, page_kind, priority, required, reason)
values
  ('generate_roadmap', 'current_focus', 5, true,
    'Roadmap ranking should start with the dominant need of the product right now, not a generic ROI prompt.'),
  ('generate_roadmap', 'project_overview', 10, true,
    'Anchor the roadmap in the project''s current goals, scope, and product stage.'),
  ('generate_roadmap', 'user_pain_map', 20, true,
    'Repeated user pain should outrank isolated raw signal snippets.'),
  ('generate_roadmap', 'active_experiments', 30, true,
    'Avoid duplicating ideas that are already being measured or rolled out.'),
  ('generate_roadmap', 'open_decisions', 40, true,
    'A roadmap item should not violate unresolved product or technical decisions.'),
  ('generate_roadmap', 'release_notes', 50, false,
    'Recent shipped work helps distinguish regressions from already-addressed pain.'),

  ('generate_prd', 'project_overview', 10, true,
    'The PRD needs a stable product frame before it starts specifying work.'),
  ('generate_prd', 'current_focus', 15, false,
    'The PRD should preserve why this item matters now, especially when the roadmap is a long backlog.'),
  ('generate_prd', 'repo_map', 20, true,
    'File-level plans should come from a maintained repo map rather than ad hoc guesses.'),
  ('generate_prd', 'implementation_patterns', 30, true,
    'PRDs should reflect known conventions, test patterns, and deployment constraints.'),
  ('generate_prd', 'safety_rules', 40, true,
    'Guardrails belong in deterministic context, not improvised inside the prompt body.'),
  ('generate_prd', 'metric_definitions', 50, false,
    'Success metrics should use the canonical names and instrumentation rules.'),

  ('implement_roadmap_item', 'repo_map', 10, true,
    'Implementation should load the narrowest possible repo context first.'),
  ('implement_roadmap_item', 'safety_rules', 20, true,
    'Execution packets should always include blocked paths, test requirements, and blast-radius caps.'),

  ('measure_impact', 'current_focus', 5, false,
    'Reviewing outcomes against the active focus helps explain why an item was promoted and whether that was still right.'),
  ('measure_impact', 'metric_definitions', 10, true,
    'Impact reviews are only meaningful if the metric names and collection rules are consistent.'),
  ('measure_impact', 'active_experiments', 20, true,
    'The learning loop needs experiment status, forecast deltas, and unresolved questions.')
on conflict (task_type, page_kind) do update set
  priority = excluded.priority,
  required = excluded.required,
  reason = excluded.reason;

-- ---------------------------------------------------------------------------
-- resolver_triggers seed (Skill Resolver)
-- ---------------------------------------------------------------------------

insert into resolver_triggers (resolver_type, trigger_phrase, trigger_kind, target_skill_slug, priority, fallback_skill_slug, notes, status)
values
  ('skill', 'refresh the roadmap', 'user_phrase', 'roadmap-synthesis', 10, null,
    'Explicit request to rerank the long backlog under the current focus.', 'active'),
  ('skill', 'what should we build next', 'user_phrase', 'roadmap-synthesis', 20, null,
    'Leadership phrasing: asks for the ranked slice.', 'active'),
  ('skill', 'rerank backlog', 'user_phrase', 'roadmap-synthesis', 30, null,
    'Operator phrasing for the ranked roadmap refresh.', 'active'),

  ('skill', 'expand this into a PRD', 'user_phrase', 'prd-author', 10, null,
    'Primary request to promote a brief to an implementation-ready PRD.', 'active'),
  ('skill', 'make this implementation-ready', 'user_phrase', 'prd-author', 20, null,
    'Alternative phrasing for PRD authoring.', 'active'),

  ('skill', 'ingest feedback', 'user_phrase', 'project-enrichment', 10, null,
    'Writes raw evidence into pages + clusters; the filing step for enrichment.', 'active'),
  ('skill', 'pull in scans', 'user_phrase', 'project-enrichment', 20, null,
    'Scan-driven enrichment when the repo or site changed.', 'active'),
  ('skill', 'refresh repo understanding', 'user_phrase', 'project-enrichment', 30, null,
    'Repo-map-focused enrichment; typically cron or merged-PR webhook.', 'active'),
  ('skill', 'scan.codebase.completed', 'webhook', 'project-enrichment', 40, null,
    'Webhook: scan worker finished and findings are ready to file.', 'active'),
  ('skill', 'nightly.enrich', 'cron', 'project-enrichment', 50, null,
    'Nightly sweep that compacts new signals into pages and clusters.', 'active'),

  ('skill', 'did this ship work', 'user_phrase', 'impact-review', 10, null,
    'Primary phrasing for post-ship review.', 'active'),
  ('skill', 'was the forecast right', 'user_phrase', 'impact-review', 20, null,
    'Explicit forecast-vs-actual review request.', 'active'),
  ('skill', 'shipped_change.metrics_ready', 'webhook', 'impact-review', 30, null,
    'Webhook: actual metrics are in; close the learning loop.', 'active'),

  ('skill', 'implement this', 'user_phrase', 'implementation-brief', 10, null,
    'Kicks off the execution packet after an approved PRD.', 'active'),
  ('skill', 'queue build', 'user_phrase', 'implementation-brief', 20, null,
    'Operator phrasing to dispatch the coding agent.', 'active'),
  ('skill', 'roadmap_item.approved', 'webhook', 'implementation-brief', 30, null,
    'Webhook: a PRD was approved; emit the build packet.', 'active'),

  ('skill', 'audit the resolver', 'user_phrase', 'check-resolvable', 10, null,
    'Primary audit request.', 'active'),
  ('skill', 'why didn''t the right skill fire', 'user_phrase', 'check-resolvable', 20, null,
    'Debugging a resolver miss with a concrete example.', 'active'),
  ('skill', 'find dark capabilities', 'user_phrase', 'check-resolvable', 30, null,
    'Reachability audit across the skill registry.', 'active'),
  ('skill', 'weekly.check_resolvable', 'cron', 'check-resolvable', 40, null,
    'Weekly resolver hygiene sweep.', 'active')
on conflict (resolver_type, trigger_phrase, target_skill_slug) do update set
  trigger_kind = excluded.trigger_kind,
  priority = excluded.priority,
  fallback_skill_slug = excluded.fallback_skill_slug,
  notes = excluded.notes,
  status = excluded.status;
