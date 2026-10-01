-- Supervised enrichment blocks.
--
-- 0066 made enrichment a teacher-less block. For an online school every
-- enrichment block still needs a named adult in the room, and a register of
-- who joined. This migration adds:
--   * timetable_periods.supervisor_user_id: the member of staff who runs the
--     block. The editor warns (it does not block) if that person is teaching
--     a lesson at the same time.
--   * period_supervisor_names(): the supervisor's display name for every
--     supervised period. Students and families cannot read other people's
--     profiles, so this SECURITY DEFINER function returns ONLY the name, and
--     only for periods that have a supervisor.
--   * enrichment_attendance: the supervisor ticks who joined, per period and
--     date. One row per (period, date, child).
--   * enrichment_roster(): the children a supervisor may tick for a block
--     (every enrolled child whose year group the block is for). Only the
--     block's supervisor and Headteacher/Admin get rows back.
--
-- Idempotent. RLS conventions follow 0066/0067. audit_row_change() reads
-- NEW/OLD.id unconditionally, so enrichment_attendance keeps a surrogate id.

alter table public.timetable_periods
  add column if not exists supervisor_user_id uuid references public.profiles(id) on delete set null;

create index if not exists timetable_periods_supervisor_idx
  on public.timetable_periods (supervisor_user_id)
  where supervisor_user_id is not null;

-- ── supervisor display names ─────────────────────────────────────────────
create or replace function public.period_supervisor_names()
returns table (period_id uuid, supervisor_name text)
language sql
security definer
stable
set search_path = public
as $$
  select tp.id, coalesce(nullif(btrim(p.full_name), ''), 'A member of staff')
  from public.timetable_periods tp
  join public.profiles p on p.id = tp.supervisor_user_id
  where tp.supervisor_user_id is not null;
$$;

revoke all on function public.period_supervisor_names() from public;
grant execute on function public.period_supervisor_names() to authenticated;

-- ── audience tokens of a year group name ────────────────────────────────
-- Mirrors audiencesOf() in src/lib/learn/timetable.ts: 'Year 10' becomes
-- {all, year 10, gcse}; 'Reception' becomes {all, reception, primary}.
create or replace function public.year_group_audiences(p_name text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when p_name is null or btrim(p_name) = '' then array['all']::text[]
    else array['all', lower(btrim(p_name))]::text[] ||
      case
        when lower(btrim(p_name)) like 'reception%' then array['primary']::text[]
        when substring(p_name from '[0-9]+') is null then array[]::text[]
        when substring(p_name from '[0-9]+')::int <= 6 then array['primary']::text[]
        when substring(p_name from '[0-9]+')::int <= 9 then array['ks3']::text[]
        when substring(p_name from '[0-9]+')::int <= 11 then array['gcse']::text[]
        else array[]::text[]
      end
  end;
$$;

grant execute on function public.year_group_audiences(text) to authenticated;

-- ── is the caller the supervisor of this period? ─────────────────────────
create or replace function public.period_supervised_by_me(p_period_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.timetable_periods tp
    where tp.id = p_period_id
      and tp.kind = 'enrichment'
      and tp.supervisor_user_id is not null
      and tp.supervisor_user_id = auth.uid()
  );
$$;

revoke all on function public.period_supervised_by_me(uuid) from public;
grant execute on function public.period_supervised_by_me(uuid) to authenticated;

-- ── roster: who the supervisor may tick ──────────────────────────────────
create or replace function public.enrichment_roster(p_period_id uuid)
returns table (child_id uuid, child_name text, year_group text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_supervisor uuid;
  v_applies text[];
begin
  select tp.supervisor_user_id, tp.applies_to
    into v_supervisor, v_applies
  from public.timetable_periods tp
  where tp.id = p_period_id and tp.kind = 'enrichment';
  if not found then
    return;
  end if;
  if not (coalesce(v_supervisor = auth.uid(), false) or public.current_has_role(array['head_teacher', 'admin'])) then
    return;
  end if;
  return query
    select c.id, c.name, yg.name
    from public.children c
    left join public.year_groups yg on yg.id = c.year_group_id
    where exists (select 1 from public.enrolments e where e.child_id = c.id)
      and ('all' = any(v_applies) or v_applies && public.year_group_audiences(yg.name))
    order by c.name;
end;
$$;

revoke all on function public.enrichment_roster(uuid) from public;
grant execute on function public.enrichment_roster(uuid) to authenticated;

-- ── enrichment_attendance ───────────────────────────────────────────────
create table if not exists public.enrichment_attendance (
  id bigint generated always as identity primary key,
  period_id uuid not null references public.timetable_periods(id) on delete cascade,
  attendance_date date not null,
  child_id uuid not null references public.children(id) on delete cascade,
  present boolean not null default true,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (period_id, attendance_date, child_id)
);

create index if not exists enrichment_attendance_date_idx
  on public.enrichment_attendance (attendance_date, period_id);

alter table public.enrichment_attendance enable row level security;

drop policy if exists "enrichment_attendance: head/admin all" on public.enrichment_attendance;
create policy "enrichment_attendance: head/admin all"
  on public.enrichment_attendance for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "enrichment_attendance: supervisor manages own block" on public.enrichment_attendance;
create policy "enrichment_attendance: supervisor manages own block"
  on public.enrichment_attendance for all to authenticated
  using (public.period_supervised_by_me(enrichment_attendance.period_id))
  with check (
    public.period_supervised_by_me(enrichment_attendance.period_id)
    and exists (
      select 1 from public.enrichment_roster(enrichment_attendance.period_id) r
      where r.child_id = enrichment_attendance.child_id
    )
  );

drop policy if exists "enrichment_attendance: manage_academic read" on public.enrichment_attendance;
create policy "enrichment_attendance: manage_academic read"
  on public.enrichment_attendance for select to authenticated
  using (public.current_has_permission('manage_academic'));

create or replace function public.enrichment_attendance_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.marked_by := coalesce(auth.uid(), new.marked_by);
  new.marked_at := now();
  return new;
end;
$$;

drop trigger if exists enrichment_attendance_guard on public.enrichment_attendance;
create trigger enrichment_attendance_guard
  before insert or update on public.enrichment_attendance
  for each row execute function public.enrichment_attendance_guard();

drop trigger if exists audit_enrichment_attendance on public.enrichment_attendance;
create trigger audit_enrichment_attendance
  after insert or update or delete on public.enrichment_attendance
  for each row execute function public.audit_row_change();
