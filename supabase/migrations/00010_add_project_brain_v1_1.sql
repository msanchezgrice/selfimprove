-- Project Brain v1.1: opportunity clusters, resolver triggers, resolver audits,
-- plus the current_focus page kind and audit_resolver task type that the v1.1
-- spec in docs/brain/project-brain-v1.md and src/lib/brain/design.ts assume.

-- ---------------------------------------------------------------------------
-- Expand existing enums
-- ---------------------------------------------------------------------------

alter table brain_pages drop constraint brain_pages_kind_check;
alter table brain_pages add constraint brain_pages_kind_check check (
  kind in (
    'current_focus',
    'project_overview',
    'user_pain_map',
    'product_constraints',
    'repo_map',
    'implementation_patterns',
    'open_decisions',
    'active_experiments',
    'release_notes',
    'safety_rules',
    'metric_definitions'
  )
);

alter table brain_skill_files drop constraint brain_skill_files_task_type_check;
alter table brain_skill_files add constraint brain_skill_files_task_type_check check (
  task_type in (
    'generate_roadmap',
    'generate_prd',
    'scan_codebase',
    'implement_roadmap_item',
    'review_pr',
    'measure_impact',
    'audit_resolver'
  )
);

alter table brain_resolver_rules drop constraint brain_resolver_rules_task_type_check;
alter table brain_resolver_rules add constraint brain_resolver_rules_task_type_check check (
  task_type in (
    'generate_roadmap',
    'generate_prd',
    'scan_codebase',
    'implement_roadmap_item',
    'review_pr',
    'measure_impact',
    'audit_resolver'
  )
);

alter table brain_resolver_rules drop constraint brain_resolver_rules_page_kind_check;
alter table brain_resolver_rules add constraint brain_resolver_rules_page_kind_check check (
  page_kind in (
    'current_focus',
    'project_overview',
    'user_pain_map',
    'product_constraints',
    'repo_map',
    'implementation_patterns',
    'open_decisions',
    'active_experiments',
    'release_notes',
    'safety_rules',
    'metric_definitions'
  )
);

alter table brain_runs drop constraint brain_runs_task_type_check;
alter table brain_runs add constraint brain_runs_task_type_check check (
  task_type in (
    'generate_roadmap',
    'generate_prd',
    'scan_codebase',
    'implement_roadmap_item',
    'review_pr',
    'measure_impact',
    'audit_resolver'
  )
);

-- ---------------------------------------------------------------------------
-- opportunity_clusters
--   Canonical long-backlog objects grouped by theme and dominant need.
--   The backlog layer described in docs/brain/project-brain-v1.md.
-- ---------------------------------------------------------------------------

create table opportunity_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null,
  title text not null,
  theme text not null default '',
  primary_need text not null default '',
  need_vector jsonb not null default '{}',
  evidence_strength integer not null default 0 check (evidence_strength between 0 and 100),
  freshness_score integer not null default 100 check (freshness_score between 0 and 100),
  confidence_score integer not null default 50 check (confidence_score between 0 and 100),
  effort_score integer not null default 50 check (effort_score between 0 and 100),
  focus_weighted_score integer not null default 0 check (focus_weighted_score between 0 and 100),
  status text not null default 'active' check (
    status in ('active', 'snoozed', 'archived', 'merged', 'shipped')
  ),
  merged_into_cluster_id uuid references opportunity_clusters(id) on delete set null,
  latest_brief_md text not null default '',
  last_signal_at timestamptz,
  last_refreshed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, slug)
);

create index opportunity_clusters_project_status on opportunity_clusters (project_id, status);
create index opportunity_clusters_project_theme on opportunity_clusters (project_id, theme);
create index opportunity_clusters_project_need on opportunity_clusters (project_id, primary_need);
create index opportunity_clusters_project_rank on opportunity_clusters (project_id, focus_weighted_score desc);

create trigger opportunity_clusters_updated_at before update on opportunity_clusters
  for each row execute function update_updated_at();

alter table opportunity_clusters enable row level security;

create policy "opportunity_clusters_select" on opportunity_clusters for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "opportunity_clusters_insert" on opportunity_clusters for insert
  with check (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "opportunity_clusters_update" on opportunity_clusters for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- opportunity_cluster_sources
--   Evidence graph: why each cluster exists, and which signals, brain pages,
--   roadmap rows, and shipped changes support or contradict it.
-- ---------------------------------------------------------------------------

create table opportunity_cluster_sources (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references opportunity_clusters(id) on delete cascade,
  source_kind text not null check (
    source_kind in (
      'signal',
      'brain_page',
      'roadmap_item',
      'shipped_change',
      'scan_finding',
      'manual_note'
    )
  ),
  signal_id uuid references signals(id) on delete set null,
  brain_page_id uuid references brain_pages(id) on delete set null,
  roadmap_item_id uuid references roadmap_items(id) on delete set null,
  shipped_change_id uuid references shipped_changes(id) on delete set null,
  citation text not null default '',
  excerpt text,
  weight real not null default 1,
  polarity text not null default 'supports' check (polarity in ('supports', 'contradicts', 'neutral')),
  created_at timestamptz default now(),
  check (
    (case when signal_id is not null then 1 else 0 end)
    + (case when brain_page_id is not null then 1 else 0 end)
    + (case when roadmap_item_id is not null then 1 else 0 end)
    + (case when shipped_change_id is not null then 1 else 0 end)
    <= 1
  )
);

create index opportunity_cluster_sources_cluster on opportunity_cluster_sources (cluster_id, created_at desc);
create index opportunity_cluster_sources_signal on opportunity_cluster_sources (signal_id);
create index opportunity_cluster_sources_page on opportunity_cluster_sources (brain_page_id);
create index opportunity_cluster_sources_roadmap on opportunity_cluster_sources (roadmap_item_id);
create index opportunity_cluster_sources_shipped on opportunity_cluster_sources (shipped_change_id);

alter table opportunity_cluster_sources enable row level security;

create policy "opportunity_cluster_sources_select" on opportunity_cluster_sources for select
  using (
    cluster_id in (
      select id from opportunity_clusters
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create policy "opportunity_cluster_sources_insert" on opportunity_cluster_sources for insert
  with check (
    cluster_id in (
      select id from opportunity_clusters
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- resolver_triggers
--   Explicit trigger table for skill routing, escalation priority, and
--   overlap management. Populated by skills registry and check-resolvable.
-- ---------------------------------------------------------------------------

create table resolver_triggers (
  id uuid primary key default gen_random_uuid(),
  resolver_type text not null check (
    resolver_type in ('skill', 'filing', 'context', 'action')
  ),
  trigger_phrase text not null,
  trigger_kind text not null default 'user_phrase' check (
    trigger_kind in ('user_phrase', 'cron', 'webhook', 'policy')
  ),
  target_skill_slug text not null,
  priority integer not null default 100,
  fallback_skill_slug text,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'draft', 'retired')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (resolver_type, trigger_phrase, target_skill_slug)
);

create index resolver_triggers_resolver_priority on resolver_triggers (resolver_type, priority);
create index resolver_triggers_skill on resolver_triggers (target_skill_slug);

create trigger resolver_triggers_updated_at before update on resolver_triggers
  for each row execute function update_updated_at();

alter table resolver_triggers enable row level security;

create policy "resolver_triggers_select" on resolver_triggers for select using (true);

-- ---------------------------------------------------------------------------
-- resolver_audits
--   Weekly check-resolvable output: false negatives, false positives, dark
--   capabilities, and proposed trigger/priority edits per project.
-- ---------------------------------------------------------------------------

create table resolver_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  audit_type text not null default 'check_resolvable' check (
    audit_type in ('check_resolvable', 'trigger_eval', 'dark_capability_scan')
  ),
  window_start timestamptz not null,
  window_end timestamptz not null,
  issues_found jsonb not null default '[]',
  suggested_fixes jsonb not null default '[]',
  applied_changes jsonb not null default '[]',
  summary text not null default '',
  run_id uuid references brain_runs(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (window_end >= window_start)
);

create index resolver_audits_project_created on resolver_audits (project_id, created_at desc);
create index resolver_audits_project_type on resolver_audits (project_id, audit_type);

create trigger resolver_audits_updated_at before update on resolver_audits
  for each row execute function update_updated_at();

alter table resolver_audits enable row level security;

create policy "resolver_audits_select" on resolver_audits for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "resolver_audits_insert" on resolver_audits for insert
  with check (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "resolver_audits_update" on resolver_audits for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- roadmap_items <-> opportunity_clusters link
--   Roadmap becomes a ranked projection over maintained clusters, not the
--   storage layer for every idea.
-- ---------------------------------------------------------------------------

alter table roadmap_items
  add column if not exists opportunity_cluster_id uuid references opportunity_clusters(id) on delete set null;

create index if not exists roadmap_items_cluster on roadmap_items (opportunity_cluster_id);
