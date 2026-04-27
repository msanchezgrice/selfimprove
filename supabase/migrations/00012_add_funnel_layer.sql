-- Project Brain v1.1.5 — funnel-shaped analytics layer for products with
-- real ad/traffic/funnel data (not zero-to-one feedback streams).
--
-- The original signals model treats every PostHog event firing as a discrete
-- piece of evidence. For a landing page that produces 3,000+ events per
-- week, that inflates volume without information. This migration adds:
--
--   1. funnel_stops          — rolling per-event counts + rates + trends
--   2. funnel_anomalies      — discrete rate-movement events that mint signals
--   3. signals.type extended — adds 'funnel_anomaly' as a first-class kind
--   4. posthog_subscriptions — real-time HogQL alert delivery targets
--
-- See docs/brain/project-brain-v1.md > Refactor: generateRoadmap() and the
-- gap analysis that motivated this layer.

-- ---------------------------------------------------------------------------
-- 1. funnel_stops — one row per (project, event_name); updated nightly + on
--    webhook. Rates are computed against an upstream stop where defined.
-- ---------------------------------------------------------------------------

create table funnel_stops (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  event_name text not null,

  -- Funnel position. upstream_event lets us compute conversion rates
  -- (this stop's count divided by upstream's count) and detect rate drops.
  upstream_event text,
  funnel_role text not null default 'event' check (
    funnel_role in ('top', 'middle', 'bottom', 'error', 'engagement', 'event')
  ),

  -- Rolling counts. Updated by /api/cron/funnel-rollup and the webhook.
  count_24h int not null default 0,
  count_7d int not null default 0,
  count_28d int not null default 0,

  -- Conversion rate vs upstream over the same window. Null when upstream
  -- isn't set or upstream count is 0.
  rate_vs_upstream_7d numeric(6, 4),
  rate_vs_upstream_28d numeric(6, 4),

  -- Week-over-week trend in the rolling 7d count: (this_week - last_week) / last_week.
  -- A value of 0.15 means +15% week-over-week.
  trend_count_7d numeric(6, 4),
  trend_rate_7d numeric(6, 4),

  -- Bookkeeping.
  last_observed timestamptz,
  last_rolled_up_at timestamptz,
  metadata jsonb not null default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, event_name)
);

create index funnel_stops_project on funnel_stops (project_id);
create index funnel_stops_project_role on funnel_stops (project_id, funnel_role);
create index funnel_stops_project_count on funnel_stops (project_id, count_7d desc);

create trigger funnel_stops_updated_at before update on funnel_stops
  for each row execute function update_updated_at();

alter table funnel_stops enable row level security;

create policy "funnel_stops_select" on funnel_stops for select
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "funnel_stops_insert" on funnel_stops for insert
  with check (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "funnel_stops_update" on funnel_stops for update
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

-- ---------------------------------------------------------------------------
-- 2. funnel_anomalies — discrete rate-movement records. Each one mints
--    exactly one signals row (linked back via metadata.funnel_anomaly_id)
--    so the synthesis pipeline operates on anomalies, not raw events.
-- ---------------------------------------------------------------------------

create table funnel_anomalies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  funnel_stop_id uuid not null references funnel_stops(id) on delete cascade,

  -- What kind of movement triggered this anomaly.
  kind text not null check (
    kind in ('rate_drop', 'rate_spike', 'count_drop', 'count_spike', 'new_event', 'first_seen')
  ),

  -- The numbers. baseline = previous window value, observed = current.
  baseline numeric not null,
  observed numeric not null,
  delta_pct numeric not null,
  window_start timestamptz not null,
  window_end timestamptz not null,

  -- Severity drives signal weight. 1=minor, 5=critical.
  severity int not null default 2 check (severity between 1 and 5),

  -- Lifecycle.
  status text not null default 'open' check (
    status in ('open', 'acknowledged', 'resolved', 'expired', 'duplicate')
  ),
  resolved_at timestamptz,
  resolution_note text,

  -- Source: 'cron' (rollup), 'webhook' (PostHog alert), 'backtest' (replay).
  source text not null default 'cron' check (source in ('cron', 'webhook', 'backtest', 'manual')),

  -- Linked signal. Not foreign-keyed because the signal is created in the
  -- same transaction; both rows reference each other.
  signal_id uuid references signals(id) on delete set null,

  metadata jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index funnel_anomalies_project_created on funnel_anomalies (project_id, created_at desc);
create index funnel_anomalies_project_status on funnel_anomalies (project_id, status);
create index funnel_anomalies_stop on funnel_anomalies (funnel_stop_id);
create index funnel_anomalies_signal on funnel_anomalies (signal_id);

create trigger funnel_anomalies_updated_at before update on funnel_anomalies
  for each row execute function update_updated_at();

alter table funnel_anomalies enable row level security;

create policy "funnel_anomalies_select" on funnel_anomalies for select
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "funnel_anomalies_insert" on funnel_anomalies for insert
  with check (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "funnel_anomalies_update" on funnel_anomalies for update
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

-- ---------------------------------------------------------------------------
-- 3. signals.type extension — first-class 'funnel_anomaly' kind.
--    Existing analytics rows stay intact; new ingestion writes 'funnel_anomaly'.
-- ---------------------------------------------------------------------------

alter table signals drop constraint signals_type_check;
alter table signals add constraint signals_type_check check (
  type in ('feedback', 'voice', 'analytics', 'error', 'builder', 'funnel_anomaly')
);

-- ---------------------------------------------------------------------------
-- 4. posthog_subscriptions — destinations PostHog HogQL Alerts post to.
--    One row per project; the `secret` is HMAC'd against the webhook body.
-- ---------------------------------------------------------------------------

create table posthog_subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,

  -- Identity of the PostHog org/project on PostHog's side.
  posthog_host text not null default 'https://us.posthog.com',
  posthog_project_id text not null,

  -- Shared secret. Webhook payload signature is HMAC-SHA256(secret, body).
  secret text not null,

  -- Bookkeeping.
  hogql_alert_ids jsonb not null default '[]',
  last_event_at timestamptz,
  last_rollup_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'errored')),
  metadata jsonb not null default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id)
);

create index posthog_subscriptions_project on posthog_subscriptions (project_id);

create trigger posthog_subscriptions_updated_at before update on posthog_subscriptions
  for each row execute function update_updated_at();

alter table posthog_subscriptions enable row level security;

create policy "posthog_subscriptions_select" on posthog_subscriptions for select
  using (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "posthog_subscriptions_insert" on posthog_subscriptions for insert
  with check (project_id in (select id from projects where org_id in (select user_org_ids())));

create policy "posthog_subscriptions_update" on posthog_subscriptions for update
  using (project_id in (select id from projects where org_id in (select user_org_ids())));
