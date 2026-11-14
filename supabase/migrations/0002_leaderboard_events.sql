-- Per-level leaderboards: one best run per player and level.
-- Players can only read; the submit-run edge function writes after replaying the run.
create table if not exists public.leaderboard (
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id int not null check (level_id between 1 and 100),
  name text not null check (char_length(name) between 1 and 24),
  distance int not null check (distance >= 0),
  rules_version text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, level_id)
);
create index if not exists leaderboard_level_distance on public.leaderboard (level_id, distance desc);
alter table public.leaderboard enable row level security;
drop policy if exists "Anyone reads the leaderboards" on public.leaderboard;
create policy "Anyone reads the leaderboards" on public.leaderboard for select using (true);

-- Anonymous gameplay stats and crash reports. Insert-only for players; read them in the dashboard.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) <= 64),
  name text not null check (char_length(name) <= 40),
  props jsonb not null default '{}' check (pg_column_size(props) <= 4000),
  app_version text not null default '' check (char_length(app_version) <= 40)
);
create index if not exists events_name_created on public.events (name, created_at desc);
alter table public.events enable row level security;
drop policy if exists "Players send anonymous events" on public.events;
create policy "Players send anonymous events" on public.events for insert to anon, authenticated with check (true);

-- Ready-made reports (not exposed through the API).
create schema if not exists analytics;
revoke all on schema analytics from anon, authenticated;

create or replace view analytics.daily_sessions as
  select date_trunc('day', created_at)::date as day, count(distinct session_id) as sessions
  from public.events where name = 'session_start' group by 1 order by 1 desc;

create or replace view analytics.tutorial_funnel as
  select props ->> 'step' as step, count(distinct session_id) as sessions
  from public.events where name = 'tutorial_step' group by 1 order by 2 desc;

create or replace view analytics.level_stats as
  select (props ->> 'levelId')::int as level,
    count(*) as flights,
    round(avg((props ->> 'distance')::numeric)) as avg_distance,
    round(100.0 * avg(((props ->> 'targetReached')::boolean)::int), 1) as completion_pct,
    count(*) filter (where props ->> 'reason' = 'destroyed') as destroyed
  from public.events where name = 'flightFinished' group by 1 order by 1;

create or replace view analytics.recent_errors as
  select created_at, app_version, props ->> 'source' as source, props ->> 'message' as message, props ->> 'stack' as stack
  from public.events where name = 'error' order by created_at desc limit 200;
