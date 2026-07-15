-- Patch Notes (/pilot) durable state.
-- Single-row JSON document with optimistic locking so concurrent votes
-- don't clobber each other (the Storage blob prototype could).

create table if not exists pilot_state (
  id text primary key default 'main' check (id = 'main'),
  state jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table pilot_state enable row level security;

-- Service role only — no anon/authenticated policies on purpose.
-- The app reads/writes via SUPABASE_SERVICE_ROLE_KEY.

comment on table pilot_state is
  'Singleton JSON document for /pilot episodes, votes, and character state.';
