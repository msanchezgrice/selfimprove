create table brain_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null,
  kind text not null check (
    kind in (
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
  ),
  title text not null,
  summary text not null default '',
  status text not null default 'active' check (status in ('active', 'stale', 'archived')),
  importance integer not null default 50 check (importance between 0 and 100),
  freshness_score integer not null default 100 check (freshness_score between 0 and 100),
  stale_reason text,
  last_compacted_at timestamptz,
  last_signal_at timestamptz,
  last_shipped_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, slug)
);

create index brain_pages_project_kind on brain_pages (project_id, kind);
create index brain_pages_project_status on brain_pages (project_id, status);

create trigger brain_pages_updated_at before update on brain_pages
  for each row execute function update_updated_at();

alter table brain_pages enable row level security;

create policy "brain_pages_select" on brain_pages for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "brain_pages_insert" on brain_pages for insert
  with check (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "brain_pages_update" on brain_pages for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create table brain_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references brain_pages(id) on delete cascade,
  version integer not null,
  content_md text not null,
  outline jsonb not null default '[]',
  key_facts jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  change_summary text not null default '',
  compiled_from jsonb not null default '{}',
  created_by text not null default 'system',
  created_at timestamptz default now(),
  unique (page_id, version)
);

create index brain_page_versions_page_created on brain_page_versions (page_id, created_at desc);

alter table brain_page_versions enable row level security;

create policy "brain_page_versions_select" on brain_page_versions for select
  using (
    page_id in (
      select id from brain_pages
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create policy "brain_page_versions_insert" on brain_page_versions for insert
  with check (
    page_id in (
      select id from brain_pages
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create table brain_page_sources (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references brain_pages(id) on delete cascade,
  page_version_id uuid references brain_page_versions(id) on delete set null,
  source_kind text not null check (
    source_kind in ('signal', 'roadmap_item', 'shipped_change', 'manual_note', 'scan_finding')
  ),
  signal_id uuid references signals(id) on delete set null,
  roadmap_item_id uuid references roadmap_items(id) on delete set null,
  shipped_change_id uuid references shipped_changes(id) on delete set null,
  citation text not null default '',
  excerpt text,
  weight real not null default 1,
  created_at timestamptz default now(),
  check (
    (
      case when signal_id is not null then 1 else 0 end
    ) + (
      case when roadmap_item_id is not null then 1 else 0 end
    ) + (
      case when shipped_change_id is not null then 1 else 0 end
    ) <= 1
  )
);

create index brain_page_sources_page on brain_page_sources (page_id, created_at desc);
create index brain_page_sources_signal on brain_page_sources (signal_id);
create index brain_page_sources_roadmap on brain_page_sources (roadmap_item_id);

alter table brain_page_sources enable row level security;

create policy "brain_page_sources_select" on brain_page_sources for select
  using (
    page_id in (
      select id from brain_pages
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create policy "brain_page_sources_insert" on brain_page_sources for insert
  with check (
    page_id in (
      select id from brain_pages
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create table brain_chunks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references brain_pages(id) on delete cascade,
  page_version_id uuid references brain_page_versions(id) on delete set null,
  chunk_index integer not null,
  content text not null,
  token_estimate integer,
  metadata jsonb not null default '{}',
  created_at timestamptz default now(),
  unique (page_version_id, chunk_index)
);

create index brain_chunks_page on brain_chunks (page_id, chunk_index);
create index brain_chunks_search on brain_chunks using gin (to_tsvector('english', content));

alter table brain_chunks enable row level security;

create policy "brain_chunks_select" on brain_chunks for select
  using (
    page_id in (
      select id from brain_pages
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create policy "brain_chunks_insert" on brain_chunks for insert
  with check (
    page_id in (
      select id from brain_pages
      where project_id in (
        select id from projects where org_id in (select user_org_ids())
      )
    )
  );

create table brain_skill_files (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  task_type text not null check (
    task_type in (
      'generate_roadmap',
      'generate_prd',
      'scan_codebase',
      'implement_roadmap_item',
      'review_pr',
      'measure_impact'
    )
  ),
  content_md text not null,
  input_schema jsonb not null default '{}',
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger brain_skill_files_updated_at before update on brain_skill_files
  for each row execute function update_updated_at();

alter table brain_skill_files enable row level security;

create policy "brain_skill_files_select" on brain_skill_files for select using (true);

create table brain_resolver_rules (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (
    task_type in (
      'generate_roadmap',
      'generate_prd',
      'scan_codebase',
      'implement_roadmap_item',
      'review_pr',
      'measure_impact'
    )
  ),
  page_kind text not null check (
    page_kind in (
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
  ),
  priority integer not null,
  required boolean not null default false,
  reason text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (task_type, page_kind)
);

create index brain_resolver_rules_task_priority on brain_resolver_rules (task_type, priority);

create trigger brain_resolver_rules_updated_at before update on brain_resolver_rules
  for each row execute function update_updated_at();

alter table brain_resolver_rules enable row level security;

create policy "brain_resolver_rules_select" on brain_resolver_rules for select using (true);

create table brain_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_type text not null check (
    task_type in (
      'generate_roadmap',
      'generate_prd',
      'scan_codebase',
      'implement_roadmap_item',
      'review_pr',
      'measure_impact'
    )
  ),
  skill_slug text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  resolved_context jsonb not null default '[]',
  input_summary jsonb not null default '{}',
  result_summary jsonb not null default '{}',
  writes_planned jsonb not null default '[]',
  writes_completed jsonb not null default '[]',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index brain_runs_project_created on brain_runs (project_id, created_at desc);
create index brain_runs_project_status on brain_runs (project_id, status);

create trigger brain_runs_updated_at before update on brain_runs
  for each row execute function update_updated_at();

alter table brain_runs enable row level security;

create policy "brain_runs_select" on brain_runs for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "brain_runs_insert" on brain_runs for insert
  with check (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "brain_runs_update" on brain_runs for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );
