-- v1.1.5 generalization: the metrics layer isn't only PostHog-event funnels.
-- It also covers cohort retention curves, traffic-source mix shifts, page
-- speed metrics, custom HogQL trends, and anything else the user wants the
-- brain to react to. This migration:
--
--   1. Adds `metric_kind` to funnel_stops so the same table can carry
--      non-funnel metrics. Keeps the table name (table renames are churn).
--   2. Adds `metric_definitions` so the user can name a metric (e.g.
--      "ad_cpa", "d7_retention") and tell the rollup how to compute it.
--   3. Loosens the funnel_anomalies kind enum to also carry softer trends
--      (count_trend, rate_trend) that aren't anomalies but are worth
--      surfacing to the brain.

alter table funnel_stops
  add column if not exists metric_kind text not null default 'funnel_event'
  check (metric_kind in (
    'funnel_event',          -- a single PostHog event (existing behaviour)
    'funnel_rate',            -- conversion rate vs upstream stop
    'cohort_retention',       -- D1 / D7 / D28 retention from a saved insight
    'traffic_mix',            -- top traffic sources distribution
    'page_speed',             -- $performance_event aggregates
    'ad_efficiency',          -- ad spend / conversion (when ad data plumbed)
    'custom_hogql',           -- user-defined HogQL query
    'posthog_insight'         -- a saved PostHog Insight (Trend/Funnel/Retention)
  ));

create index if not exists funnel_stops_project_metric_kind on funnel_stops (project_id, metric_kind);

-- Loosen funnel_anomalies.kind to include softer trend-class signals.
alter table funnel_anomalies drop constraint funnel_anomalies_kind_check;
alter table funnel_anomalies add constraint funnel_anomalies_kind_check check (
  kind in (
    'rate_drop',
    'rate_spike',
    'count_drop',
    'count_spike',
    'count_trend',           -- moves between 7%-20% — surfaced but lower severity
    'rate_trend',            -- conversion-rate moves between 7%-15%
    'distribution_shift',    -- e.g. top traffic source went from organic to paid
    'cohort_regression',     -- D7 retention dropped vs prior cohort
    'new_event',
    'first_seen'
  )
)
;

-- ---------------------------------------------------------------------------
-- metric_definitions
--   Lets the user name a metric and tell the rollup how to compute it.
--   For PostHog-Insight-backed metrics, `posthog_insight_short_id` is enough.
--   For HogQL-backed metrics, the user supplies a query template.
-- ---------------------------------------------------------------------------

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null,
  display_name text not null,
  description text not null default '',

  metric_kind text not null check (metric_kind in (
    'funnel_event',
    'funnel_rate',
    'cohort_retention',
    'traffic_mix',
    'page_speed',
    'ad_efficiency',
    'custom_hogql',
    'posthog_insight'
  )),

  -- For posthog_insight kind.
  posthog_insight_short_id text,

  -- For custom_hogql kind. Must contain `{{since}}` and `{{until}}`
  -- placeholders. The rollup substitutes the window bounds.
  hogql_template text,

  -- Where the value should land. Most metrics map to a funnel_stops row;
  -- for ones that don't (cohort tables, distributions) we keep the raw
  -- snapshot in metadata.
  funnel_stop_event_name text,

  -- Threshold overrides for this metric's anomaly detection.
  trend_threshold numeric(6, 4) default 0.07,
  anomaly_threshold numeric(6, 4) default 0.2,

  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  metadata jsonb not null default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, slug)
);

create index metric_definitions_project_kind on metric_definitions (project_id, metric_kind);
create index metric_definitions_project_status on metric_definitions (project_id, status);

create trigger metric_definitions_updated_at before update on metric_definitions
  for each row execute function update_updated_at();

alter table metric_definitions enable row level security;

create policy "metric_definitions_select" on metric_definitions for select
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "metric_definitions_insert" on metric_definitions for insert
  with check (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "metric_definitions_update" on metric_definitions for update
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

-- ---------------------------------------------------------------------------
-- roadmap_filters
--   Saved per-project filters the user applies to the live ranking
--   (e.g. "show me only the conversion-focused, high-confidence revenue
--   items"). Filters don't change persisted scores; the query route
--   recomputes ordering with these constraints applied.
-- ---------------------------------------------------------------------------

create table roadmap_filters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  filter_focus text,                       -- override current_focus for this view
  filter_category text[],                  -- restrict to these categories
  filter_min_confidence integer,
  filter_min_focus_score integer,
  filter_cluster_slugs text[],
  filter_status text[],
  is_default boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index roadmap_filters_project on roadmap_filters (project_id);
-- One default filter per project; partial unique index makes that a constraint.
create unique index roadmap_filters_one_default on roadmap_filters (project_id) where is_default = true;

create trigger roadmap_filters_updated_at before update on roadmap_filters
  for each row execute function update_updated_at();

alter table roadmap_filters enable row level security;

create policy "roadmap_filters_select" on roadmap_filters for select
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "roadmap_filters_insert" on roadmap_filters for insert
  with check (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "roadmap_filters_update" on roadmap_filters for update
  using (project_id in (select id from projects where org_id in (select user_org_ids())));
