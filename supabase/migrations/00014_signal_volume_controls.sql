-- ---------------------------------------------------------------------------
-- 00014: Signal volume controls
-- ---------------------------------------------------------------------------
--
-- Two levers to tame noise once the brain is running daily:
--
--   1. signal_volume_cap_per_day on project_settings — hard cap on the
--      number of new signals minted per project per UTC day. Anything
--      above the cap gets short-circuited to processed=true with a skip
--      reason so it doesn't drag the synthesis queue.
--
--   2. anomaly_auto_resolve_days on project_settings — open
--      funnel_anomalies older than this auto-flip to status='expired'.
--      Their linked signals get processed=true so synthesis stops
--      re-triaging stale movements.
--
-- Both have sensible defaults. Per-project overrides via the settings
-- form (added in a follow-up commit).

alter table project_settings
  add column if not exists signal_volume_cap_per_day integer not null default 200,
  add column if not exists anomaly_auto_resolve_days integer not null default 14;

-- The cap should be a positive integer with a reasonable ceiling.
alter table project_settings
  add constraint project_settings_signal_cap_check
    check (signal_volume_cap_per_day between 0 and 10000);

alter table project_settings
  add constraint project_settings_anomaly_resolve_check
    check (anomaly_auto_resolve_days between 1 and 90);

-- Index used by the volume-cap query in funnel-rollup (count today's signals).
create index if not exists signals_project_created_at_brin
  on signals using brin (project_id, created_at);
