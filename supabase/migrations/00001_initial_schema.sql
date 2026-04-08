create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function user_org_ids()
returns setof uuid as $$
  select org_id from org_members where user_id = auth.uid();
$$ language sql security definer stable;

-- orgs

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  tier text not null default 'free' check (tier in ('free', 'pro', 'autonomous')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger orgs_updated_at before update on orgs
  for each row execute function update_updated_at();

alter table orgs enable row level security;

create policy "orgs_select" on orgs for select
  using (id in (select user_org_ids()));

create policy "orgs_update" on orgs for update
  using (id in (select user_org_ids()));

-- org_members

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, user_id)
);

create trigger org_members_updated_at before update on org_members
  for each row execute function update_updated_at();

alter table org_members enable row level security;

create policy "org_members_select" on org_members for select
  using (
    user_id = auth.uid()
    or org_id in (select user_org_ids())
  );

create policy "org_members_insert" on org_members for insert
  with check (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "org_members_delete" on org_members for delete
  using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- projects

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  slug text not null,
  repo_url text,
  site_url text,
  framework text,
  description text,
  allowed_domains text[] default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, slug)
);

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();

alter table projects enable row level security;

create policy "projects_select" on projects for select
  using (org_id in (select user_org_ids()));

create policy "projects_insert" on projects for insert
  with check (org_id in (select user_org_ids()));

create policy "projects_update" on projects for update
  using (org_id in (select user_org_ids()));

create policy "projects_delete" on projects for delete
  using (org_id in (select user_org_ids()));

-- signals

create table signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null check (type in ('feedback', 'voice', 'analytics', 'error', 'builder')),
  title text,
  content text not null,
  metadata jsonb default '{}',
  source_user_hash text,
  dedup_group_id uuid,
  weight real not null default 1,
  processed boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index signals_project_created on signals (project_id, created_at desc);
create index signals_project_processed on signals (project_id, processed);
create index signals_project_type on signals (project_id, type);

create trigger signals_updated_at before update on signals
  for each row execute function update_updated_at();

alter table signals enable row level security;

create policy "signals_select" on signals for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "signals_insert" on signals for insert
  with check (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "signals_update" on signals for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

-- roadmap_items

create table roadmap_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null check (category in ('bug', 'feature', 'improvement', 'infrastructure')),
  origin text not null default '',
  confidence integer not null default 50 check (confidence between 0 and 100),
  scope text not null default 'medium' check (scope in ('small', 'medium', 'large')),
  strategy text not null default '',
  impact integer not null default 5 check (impact between 1 and 10),
  upside text not null default '',
  size integer not null default 5 check (size between 1 and 10),
  roi_score real not null default 0,
  evidence_trail jsonb default '[]',
  thinking_traces jsonb default '[]',
  acceptance_criteria jsonb default '[]',
  files_to_modify jsonb default '[]',
  risks jsonb default '[]',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'building', 'shipped', 'archived', 'dismissed')),
  rank integer not null default 0,
  feedback_up integer not null default 0,
  feedback_down integer not null default 0,
  dismiss_reason text,
  prd_content jsonb,
  generation_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index roadmap_items_project_status on roadmap_items (project_id, status);
create index roadmap_items_project_rank on roadmap_items (project_id, rank);

create trigger roadmap_items_updated_at before update on roadmap_items
  for each row execute function update_updated_at();

alter table roadmap_items enable row level security;

create policy "roadmap_items_select" on roadmap_items for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "roadmap_items_update" on roadmap_items for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

-- shipped_changes

create table shipped_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  roadmap_item_id uuid not null references roadmap_items(id) on delete cascade,
  pr_url text,
  pr_number integer,
  commit_sha text,
  risk_score real,
  approval_method text not null default 'manual' check (approval_method in ('manual', 'auto_approved', 'auto_merged')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'merged', 'reverted')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index shipped_changes_project_status on shipped_changes (project_id, status);

create trigger shipped_changes_updated_at before update on shipped_changes
  for each row execute function update_updated_at();

alter table shipped_changes enable row level security;

create policy "shipped_changes_select" on shipped_changes for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

-- project_settings

create table project_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  automation_roadmap_enabled boolean default true,
  automation_roi_focus text default 'balanced' check (automation_roi_focus in ('balanced', 'impact', 'effort', 'confidence')),
  automation_implement_enabled boolean default false,
  automation_auto_approve boolean default false,
  automation_auto_merge boolean default false,
  safety_risk_threshold integer default 70 check (safety_risk_threshold between 0 and 100),
  safety_require_tests boolean default true,
  safety_max_files integer default 10,
  safety_max_lines integer default 500,
  safety_blocked_paths text[] default '{}',
  safety_daily_cap integer default 5,
  ai_model_roadmap text default 'claude-sonnet-4-6',
  ai_model_prd text default 'claude-sonnet-4-6',
  ai_model_approval text default 'claude-haiku-4-5-20251001',
  widget_enabled boolean default true,
  widget_color text default '#6366f1',
  widget_position text default 'bottom-right' check (widget_position in ('bottom-right', 'bottom-left')),
  widget_style text default 'pill' check (widget_style in ('pill', 'button', 'tab')),
  widget_button_text text default 'Feedback',
  widget_tags text[] default '{"bug","feature","improvement","question"}',
  voice_enabled boolean default false,
  voice_system_prompt text,
  voice_screen_capture boolean default false,
  posthog_api_key text,
  sentry_dsn text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger project_settings_updated_at before update on project_settings
  for each row execute function update_updated_at();

alter table project_settings enable row level security;

create policy "project_settings_select" on project_settings for select
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

create policy "project_settings_update" on project_settings for update
  using (
    project_id in (
      select id from projects where org_id in (select user_org_ids())
    )
  );

-- auto-create project_settings on project insert

create or replace function create_project_settings()
returns trigger as $$
begin
  insert into project_settings (project_id) values (new.id);
  return new;
end;
$$ language plpgsql;

create trigger projects_create_settings after insert on projects
  for each row execute function create_project_settings();
