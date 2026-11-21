-- Keep-alive for the Free plan's inactivity pause: each ping is a real write plus table reads.
create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  pings bigint not null default 0
);
insert into public.keepalive (id) values (1) on conflict do nothing;
alter table public.keepalive enable row level security; -- no policies: only keepalive() touches it

create or replace function public.keepalive() returns json
language sql security definer set search_path = public as $$
  update public.keepalive set pinged_at = now(), pings = pings + 1 where id = 1
  returning json_build_object(
    'pinged_at', pinged_at,
    'pings', pings,
    'saves', (select count(*) from public.saves),
    'leaderboard', (select count(*) from public.leaderboard)
  );
$$;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
