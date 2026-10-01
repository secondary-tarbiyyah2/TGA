-- Weekly parent digest + school houses.
--
--  * parent_preferences: one row per parent. `digest_opt_out` switches the
--    Friday family email off. A parent reads/writes only their own row;
--    Headteacher/Admin can read all (to see who opted out).
--  * weekly_digest_log: one row per (week, parent) written ONLY by the
--    weekly-digest Edge Function (service role) -- that unique key is what
--    makes the send idempotent per week. Headteacher/Admin read only.
--  * houses / house_members / house_point_awards: admin-defined houses
--    (name, colour), children assigned to one house each, plus bonus points
--    an admin can award. Merits (behaviour_records, 0039) count towards a
--    child's house AUTOMATICALLY: house_standings() derives the totals from
--    the live merit records, so there is nothing to keep in sync and a
--    voided merit stops counting immediately. Totals are aggregate-only (no
--    child is ever named), so they are safe to show everyone.
--
-- Conventions follow 0015/0039/0066-0068: RLS default deny, SECURITY DEFINER
-- helpers, audit_row_change() (which reads NEW/OLD.id, hence the surrogate
-- `id` on every audited table). Idempotent.

-- ── parent_preferences ──────────────────────────────────────────────────
create table if not exists public.parent_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  digest_opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.parent_preferences enable row level security;

drop policy if exists "parent_preferences: read own" on public.parent_preferences;
create policy "parent_preferences: read own"
  on public.parent_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "parent_preferences: create own" on public.parent_preferences;
create policy "parent_preferences: create own"
  on public.parent_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "parent_preferences: update own" on public.parent_preferences;
create policy "parent_preferences: update own"
  on public.parent_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "parent_preferences: head_teacher/admin read" on public.parent_preferences;
create policy "parent_preferences: head_teacher/admin read"
  on public.parent_preferences for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.parent_preferences_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists parent_preferences_guard on public.parent_preferences;
create trigger parent_preferences_guard
  before insert or update on public.parent_preferences
  for each row execute function public.parent_preferences_guard();

drop trigger if exists audit_parent_preferences on public.parent_preferences;
create trigger audit_parent_preferences
  after insert or update or delete on public.parent_preferences
  for each row execute function public.audit_row_change();

-- ── weekly_digest_log ───────────────────────────────────────────────────
-- week_start is the Monday of the UK week the digest covers. A row is
-- inserted as 'sending' to claim the (week, parent) slot before any email
-- goes out, then moved to 'sent' or 'failed' (a failed slot can be retried).
create table if not exists public.weekly_digest_log (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  detail text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (week_start, parent_user_id)
);

create index if not exists weekly_digest_log_week_idx on public.weekly_digest_log (week_start desc);

alter table public.weekly_digest_log enable row level security;

drop policy if exists "weekly_digest_log: head_teacher/admin read" on public.weekly_digest_log;
create policy "weekly_digest_log: head_teacher/admin read"
  on public.weekly_digest_log for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- No insert/update/delete policies: only the service role (Edge Function) writes.

-- ── houses ──────────────────────────────────────────────────────────────
create table if not exists public.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  colour text not null default '#B08E45' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  motto text check (motto is null or char_length(motto) <= 120),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists houses_name_key on public.houses (lower(btrim(name)));

alter table public.houses enable row level security;

drop policy if exists "houses: authenticated read" on public.houses;
create policy "houses: authenticated read"
  on public.houses for select
  to authenticated
  using (true);

drop policy if exists "houses: head_teacher/admin write" on public.houses;
create policy "houses: head_teacher/admin write"
  on public.houses for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop trigger if exists audit_houses on public.houses;
create trigger audit_houses
  after insert or update or delete on public.houses
  for each row execute function public.audit_row_change();

-- ── house_members (one house per child) ─────────────────────────────────
create table if not exists public.house_members (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  assigned_by uuid default auth.uid() references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);

create index if not exists house_members_house_idx on public.house_members (house_id);

alter table public.house_members enable row level security;

drop policy if exists "house_members: head_teacher/admin all" on public.house_members;
create policy "house_members: head_teacher/admin all"
  on public.house_members for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "house_members: teacher reads own children" on public.house_members;
create policy "house_members: teacher reads own children"
  on public.house_members for select
  to authenticated
  using (public.child_taught_by(house_members.child_id, auth.uid()));

drop policy if exists "house_members: parent reads own child's" on public.house_members;
create policy "house_members: parent reads own child's"
  on public.house_members for select
  to authenticated
  using (public.child_belongs_to_parent(house_members.child_id));

drop policy if exists "house_members: student reads own" on public.house_members;
create policy "house_members: student reads own"
  on public.house_members for select
  to authenticated
  using (public.child_belongs_to_student(house_members.child_id));

drop trigger if exists audit_house_members on public.house_members;
create trigger audit_house_members
  after insert or update or delete on public.house_members
  for each row execute function public.audit_row_change();

-- ── house_point_awards (admin bonus points) ─────────────────────────────
-- Positive only: bonus points celebrate, they never take points away. A
-- mistaken award is voided (kept for the audit trail), not deleted.
create table if not exists public.house_point_awards (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  points int not null check (points between 1 and 100),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  awarded_by uuid not null default auth.uid() references public.profiles(id),
  awarded_on date not null default current_date,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id)
);

create index if not exists house_point_awards_house_idx on public.house_point_awards (house_id, awarded_on desc);

alter table public.house_point_awards enable row level security;

drop policy if exists "house_point_awards: head_teacher/admin all" on public.house_point_awards;
create policy "house_point_awards: head_teacher/admin all"
  on public.house_point_awards for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- Only voiding is allowed after the fact.
create or replace function public.house_point_awards_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.house_id is distinct from old.house_id
     or new.points is distinct from old.points
     or new.reason is distinct from old.reason
     or new.awarded_by is distinct from old.awarded_by
     or new.awarded_on is distinct from old.awarded_on
     or new.created_at is distinct from old.created_at then
    raise exception 'Only voiding a house point award is allowed';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists house_point_awards_guard on public.house_point_awards;
create trigger house_point_awards_guard
  before update on public.house_point_awards
  for each row execute function public.house_point_awards_guard();

drop trigger if exists audit_house_point_awards on public.house_point_awards;
create trigger audit_house_point_awards
  after insert or update or delete on public.house_point_awards
  for each row execute function public.audit_row_change();

-- ── house_standings ─────────────────────────────────────────────────────
-- SECURITY DEFINER because families and students cannot read other
-- children's merits. Returns AGGREGATES per active house only (no child is
-- named), so it is the same for every viewer apart from is_mine. Allowed:
-- head_teacher/admin, teachers, and any parent or student. Admissions-only
-- staff and everyone else are refused.
--   p_days: null/0 = all time, otherwise the last N days.
create or replace function public.house_standings(p_days int default null)
returns table (
  house_id uuid,
  name text,
  colour text,
  motto text,
  merit_points int,
  bonus_points int,
  total_points int,
  member_count int,
  is_mine boolean,
  rank int
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_since date;
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to see the house table' using errcode = '42501';
  end if;

  v_since := case when p_days is null or p_days <= 0 then null else current_date - p_days end;

  v_ok := public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover'])
    or exists (
      select 1 from public.children c
      where c.parent_user_id = v_uid
         or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid)
    );
  if not v_ok then
    raise exception 'Not allowed to see the house table' using errcode = '42501';
  end if;

  return query
  with merit as (
    select hm.house_id as hid, sum(b.points)::int as pts
    from public.house_members hm
    join public.behaviour_records b on b.child_id = hm.child_id
    where b.kind = 'merit' and b.points > 0 and b.voided_at is null
      and (v_since is null or b.occurred_on >= v_since)
    group by hm.house_id
  ),
  bonus as (
    select a.house_id as hid, sum(a.points)::int as pts
    from public.house_point_awards a
    where a.voided_at is null and (v_since is null or a.awarded_on >= v_since)
    group by a.house_id
  ),
  members as (
    select hm.house_id as hid, count(*)::int as n
    from public.house_members hm
    group by hm.house_id
  ),
  mine as (
    select distinct hm.house_id as hid
    from public.house_members hm
    join public.children c on c.id = hm.child_id
    where c.parent_user_id = v_uid
       or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid)
  ),
  scored as (
    select
      h.id as hid, h.name as hname, h.colour as hcolour, h.motto as hmotto, h.sort_order as hsort,
      coalesce(m.pts, 0) as mp,
      coalesce(bo.pts, 0) as bp,
      coalesce(mem.n, 0) as n,
      (mine.hid is not null) as mine_flag
    from public.houses h
    left join merit m on m.hid = h.id
    left join bonus bo on bo.hid = h.id
    left join members mem on mem.hid = h.id
    left join mine on mine.hid = h.id
    where h.active
  )
  select
    s.hid, s.hname, s.hcolour, s.hmotto,
    s.mp, s.bp, s.mp + s.bp, s.n, s.mine_flag,
    (rank() over (order by s.mp + s.bp desc))::int
  from scored s
  order by (s.mp + s.bp) desc, s.hsort, s.hname;
end;
$$;

revoke all on function public.house_standings(int) from public, anon;
grant execute on function public.house_standings(int) to authenticated;
