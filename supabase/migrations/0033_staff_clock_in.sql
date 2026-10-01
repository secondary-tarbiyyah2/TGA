-- 0033: staff clock-in. Staff must clock in before using the portal (gate is
-- client-side UX; the shifts themselves are RLS-protected and audited).

-- ── settings ────────────────────────────────────────────────────────────
alter table public.lms_settings
  add column if not exists require_clock_in boolean not null default true,
  add column if not exists clock_in_roles text[] not null default '{teacher,teaching_assistant_cover,admissions,admin}',
  add column if not exists auto_clock_out_hours int not null default 12 check (auto_clock_out_hours between 1 and 48);

-- lms_settings is readable only by head_teacher/admin/manage_academic/safeguarding
-- leads, but every staff member needs to know whether the gate applies to them.
create or replace function public.clock_in_policy()
returns table (require_clock_in boolean, clock_in_roles text[], auto_clock_out_hours int)
language sql
security definer
stable
set search_path = public
as $$
  select s.require_clock_in, s.clock_in_roles, s.auto_clock_out_hours
  from public.lms_settings s
  where s.id;
$$;

revoke all on function public.clock_in_policy() from public, anon;
grant execute on function public.clock_in_policy() to authenticated;

-- ── shifts ──────────────────────────────────────────────────────────────
create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  note text,
  clocked_out_by uuid references public.profiles(id), -- set when an admin closes someone's shift
  auto_closed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint staff_shifts_out_after_in check (clocked_out_at is null or clocked_out_at >= clocked_in_at)
);

-- At most one open shift per person.
create unique index staff_shifts_one_open_per_user on public.staff_shifts (user_id) where clocked_out_at is null;
create index staff_shifts_user_in_idx on public.staff_shifts (user_id, clocked_in_at desc);
create index staff_shifts_in_idx on public.staff_shifts (clocked_in_at desc);

alter table public.staff_shifts enable row level security;

create policy "staff_shifts: clock in for yourself"
  on public.staff_shifts for insert
  to authenticated
  with check (user_id = auth.uid() and clocked_out_at is null and public.is_staff_member(auth.uid()));

create policy "staff_shifts: read own"
  on public.staff_shifts for select
  to authenticated
  using (user_id = auth.uid());

create policy "staff_shifts: head_teacher/admin read all"
  on public.staff_shifts for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create policy "staff_shifts: clock out your own open shift"
  on public.staff_shifts for update
  to authenticated
  using (user_id = auth.uid() and clocked_out_at is null)
  with check (user_id = auth.uid());

create policy "staff_shifts: head_teacher/admin update any"
  on public.staff_shifts for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- No delete policy: shifts are a record, corrected rather than removed.

-- Ordinary staff can't back-date: the server stamps the times and locks the
-- other columns. Head teacher/admin edits and the stale-shift closer (which
-- runs as the function owner) pass through untouched.
create or replace function public.staff_shifts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- (not SECURITY DEFINER: current_user must be the calling role)
  if current_user not in ('authenticated', 'anon') or public.current_has_role(array['head_teacher', 'admin']) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.clocked_in_at := now();
    new.auto_closed := false;
    new.clocked_out_by := null;
  else
    new.user_id := old.user_id;
    new.clocked_in_at := old.clocked_in_at;
    new.auto_closed := old.auto_closed;
    new.clocked_out_by := old.clocked_out_by;
    if new.clocked_out_at is not null then
      new.clocked_out_at := greatest(now(), old.clocked_in_at);
    end if;
  end if;
  return new;
end;
$$;

create trigger staff_shifts_guard
  before insert or update on public.staff_shifts
  for each row execute function public.staff_shifts_guard();

create trigger audit_staff_shifts
  after insert or update on public.staff_shifts
  for each row execute function public.audit_row_change();

-- Shifts left open longer than auto_clock_out_hours are closed at
-- clocked_in_at + hours. The client calls this before every gate check.
create or replace function public.close_stale_shifts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours int;
  v_count int;
begin
  select auto_clock_out_hours into v_hours from public.lms_settings where id;
  if v_hours is null then
    return 0;
  end if;
  update public.staff_shifts
  set clocked_out_at = clocked_in_at + make_interval(hours => v_hours),
      auto_closed = true
  where clocked_out_at is null
    and clocked_in_at + make_interval(hours => v_hours) < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_stale_shifts() from public, anon;
grant execute on function public.close_stale_shifts() to authenticated;
