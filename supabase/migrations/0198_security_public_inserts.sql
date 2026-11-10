-- 0198: closes the open database findings from the November security audit
-- (docs/security-audit-2026-11.md), owner, 10 November 2026: "address all
-- vulnerabilities".
--
-- M10. Public tables a visitor can write to without signing in.
--   * quiz_sessions, quiz_events and eligibility_responses: the current site
--     never writes to them (the fit check sends only a consented quiz_leads
--     row), so the anonymous insert and update policies are removed. Staff
--     can still read the old rows.
--   * quiz_leads, admissions_families and admissions_applications are still
--     written by the public forms. Each now has a per-network rate limit
--     (counted per request, not per row, so one application for six children
--     counts once): quiz_leads 10 an hour, admissions_families 5 an hour,
--     admissions_applications 5 an hour. The network is read from the
--     request headers the API passes on (Cloudflare's connecting IP, else the
--     first forwarded address) and stored only as a hash. If no address is
--     available the limit is skipped rather than shared by everyone.
--
-- L3. Helper functions anyone could call through the API. is_staff_member,
--   thread_participant, child_taught_by and class_teacher_names answer
--   yes/no or names for the portal; they are now callable only by signed-in
--   users (and the service role), as their original grants intended.
--   run_status stays public: the public sample timetable relies on it.

-- ── M10 (a): unused anonymous write policies ─────────────────────────────
drop policy if exists "quiz_sessions: anyone can start/update by knowing the token" on public.quiz_sessions;
drop policy if exists "quiz_sessions: anyone can update by token (no PII, write-only from the client)" on public.quiz_sessions;
drop policy if exists "quiz_events: anyone can record" on public.quiz_events;
do $$
declare
  p record;
begin
  -- Whatever their exact names, no anonymous insert/update policy is left on these three tables.
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('quiz_sessions', 'quiz_events', 'eligibility_responses')
      and cmd in ('INSERT', 'UPDATE', 'ALL')
      and (roles @> array['anon']::name[] or roles @> array['public']::name[])
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- ── M10 (b): rate limit on the public forms' inserts ─────────────────────
create table if not exists public.anon_insert_log (
  bucket text not null,
  network text not null, -- md5 of the address, never the address itself
  at timestamptz not null default now()
);
create index if not exists anon_insert_log_lookup on public.anon_insert_log (bucket, network, at desc);
alter table public.anon_insert_log enable row level security;
-- No policies: only the trigger below (as its owner) and the service role touch it.
revoke all on public.anon_insert_log from anon, authenticated;

create or replace function public.anon_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int := tg_argv[0]::int;
  v_bucket text := tg_table_name;
  v_headers json;
  v_ip text;
  v_net text;
  v_count int;
begin
  -- Signed-in users and server jobs are not limited here.
  if coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') <> 'anon' then
    return null;
  end if;
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(coalesce(
    v_headers ->> 'cf-connecting-ip',
    split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
    v_headers ->> 'x-real-ip',
    ''
  )), '');
  if v_ip is null then
    return null;
  end if;
  v_net := md5(v_bucket || ':' || v_ip);
  delete from public.anon_insert_log where bucket = v_bucket and network = v_net and at < now() - interval '1 hour';
  select count(*) into v_count from public.anon_insert_log where bucket = v_bucket and network = v_net;
  if v_count >= v_max then
    raise exception 'Too many submissions from this network. Please try again in an hour, or email the school.'
      using errcode = '53400';
  end if;
  insert into public.anon_insert_log (bucket, network) values (v_bucket, v_net);
  return null;
end;
$$;
revoke execute on function public.anon_insert_rate_limit() from public, anon, authenticated;

drop trigger if exists quiz_leads_rate_limit on public.quiz_leads;
create trigger quiz_leads_rate_limit
  before insert on public.quiz_leads
  for each statement execute function public.anon_insert_rate_limit('10');

drop trigger if exists admissions_families_rate_limit on public.admissions_families;
create trigger admissions_families_rate_limit
  before insert on public.admissions_families
  for each statement execute function public.anon_insert_rate_limit('5');

drop trigger if exists admissions_applications_rate_limit on public.admissions_applications;
create trigger admissions_applications_rate_limit
  before insert on public.admissions_applications
  for each statement execute function public.anon_insert_rate_limit('5');

-- ── L3: helpers for signed-in users only ─────────────────────────────────
revoke execute on function public.is_staff_member(uuid) from public, anon;
grant execute on function public.is_staff_member(uuid) to authenticated, service_role;
revoke execute on function public.thread_participant(uuid, uuid) from public, anon;
grant execute on function public.thread_participant(uuid, uuid) to authenticated, service_role;
revoke execute on function public.child_taught_by(uuid, uuid) from public, anon;
grant execute on function public.child_taught_by(uuid, uuid) to authenticated, service_role;
revoke execute on function public.class_teacher_names(uuid) from public, anon;
grant execute on function public.class_teacher_names(uuid) to authenticated, service_role;
