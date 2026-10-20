-- 0101: withdrawal notices, two more register marks, and the Headteacher's
-- name (October 2026 policy decisions).
--
-- 1. Withdrawal notice (Fees Policy §7, Attendance Policy §10). A parent
--    gives notice in the Parent Portal (Fees → Leaving the Academy), saying
--    where the child will continue their education. One half term's notice
--    is required; the office records when the form was received, the date
--    the pupil can leave, any fees outstanding and when the last invoice goes.
--    Modelled on the TSS Pupil Removal Form.
-- 2. Register marks from the Attendance Policy (§4, §5):
--      not_engaged — logged in but not present (no camera, no response);
--                    counts as attended, flagged to the form tutor.
--      technical   — could not connect despite reasonable efforts; recorded
--                    separately, does not count against the attendance rate
--                    and does not trigger the unexplained-absence alert.
-- 3. Headteacher's name as the policies give it.

-- ── 1. withdrawal notices ────────────────────────────────────────────────
create table if not exists public.withdrawal_notices (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null default auth.uid() references public.profiles(id),
  last_day date not null,
  reason text not null,
  destination text not null check (destination in (
    'another_faith_school', 'state_school', 'independent_school', 'boarding_school',
    'home_education', 'moving_abroad', 'other'
  )),
  new_school_name text,
  new_school_address text,
  new_school_country text,
  home_education_reason text,
  forwarding_address text,
  second_parent_name text,
  second_parent_email text,
  signed_name text not null,
  notice_acknowledged boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'completed', 'cancelled')),
  -- office use only
  received_on date,
  eligible_to_leave_on date,
  fees_outstanding numeric(10, 2),
  last_invoice_on date,
  office_notes text,
  handled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint withdrawal_notices_destination_details check (
    destination not in ('another_faith_school', 'state_school', 'independent_school', 'boarding_school')
    or coalesce(trim(new_school_name), '') <> ''
  ),
  constraint withdrawal_notices_home_ed_reason check (
    destination <> 'home_education' or coalesce(trim(home_education_reason), '') <> ''
  ),
  constraint withdrawal_notices_ack check (notice_acknowledged)
);

create index if not exists withdrawal_notices_child_idx on public.withdrawal_notices (child_id);
create index if not exists withdrawal_notices_status_idx on public.withdrawal_notices (status);

alter table public.withdrawal_notices enable row level security;

drop policy if exists "withdrawal_notices: parent reads own children's" on public.withdrawal_notices;
create policy "withdrawal_notices: parent reads own children's"
  on public.withdrawal_notices for select to authenticated
  using (public.child_belongs_to_parent(withdrawal_notices.child_id));

drop policy if exists "withdrawal_notices: parent gives notice for own children" on public.withdrawal_notices;
create policy "withdrawal_notices: parent gives notice for own children"
  on public.withdrawal_notices for insert to authenticated
  with check (
    public.child_belongs_to_parent(withdrawal_notices.child_id)
    and parent_user_id = auth.uid()
    and status = 'submitted'
    and received_on is null and eligible_to_leave_on is null and fees_outstanding is null
    and last_invoice_on is null and office_notes is null and handled_by is null
  );

drop policy if exists "withdrawal_notices: office manages" on public.withdrawal_notices;
create policy "withdrawal_notices: office manages"
  on public.withdrawal_notices for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]))
  with check (public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]));

create or replace function public.withdrawal_notices_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists withdrawal_notices_touch on public.withdrawal_notices;
create trigger withdrawal_notices_touch
  before update on public.withdrawal_notices
  for each row execute function public.withdrawal_notices_touch();

drop trigger if exists audit_withdrawal_notices on public.withdrawal_notices;
create trigger audit_withdrawal_notices
  after insert or update or delete on public.withdrawal_notices
  for each row execute function public.audit_row_change();

-- A parent can take back a notice the office has not yet acted on.
create or replace function public.cancel_my_withdrawal_notice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.withdrawal_notices
  set status = 'cancelled'
  where id = p_id
    and status = 'submitted'
    and public.child_belongs_to_parent(child_id);
  if not found then
    raise exception 'This notice can no longer be withdrawn online. Please contact the office.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.cancel_my_withdrawal_notice(uuid) from public, anon;
grant execute on function public.cancel_my_withdrawal_notice(uuid) to authenticated;

-- ── 2. register marks ────────────────────────────────────────────────────
alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records
  add constraint attendance_records_status_check
  check (status in ('present', 'absent', 'late', 'excused', 'not_engaged', 'technical'));

-- Streaks: "present but not engaged" still counts as attending that day.
do $$
declare
  d text;
begin
  select pg_get_functiondef('public.child_streaks(uuid)'::regprocedure) into d;
  if position($q$ar.status in ('present', 'late')$q$ in d) > 0 then
    d := replace(d, $q$ar.status in ('present', 'late')$q$, $q$ar.status in ('present', 'late', 'not_engaged')$q$);
    execute d;
  end if;
end;
$$;

-- ── 3. Headteacher ───────────────────────────────────────────────────────
update public.site_settings set headteacher_name = 'Ustadh Abu Zayn Haneef Sandhar';
update public.team_profiles set name = 'Ustadh Abu Zayn Haneef Sandhar' where name = 'Hardeep Sandhar';

-- ── 4. FAQ: lessons are on Microsoft Teams, joined from the portal ───────
update public.faq_entries set answer = 'Yes. Every family has a Parent Portal and every pupil a Student Portal, with the timetable, homework, attendance, messages to teachers, reports and forms to sign. Live lessons are taught on Microsoft Teams: pupils press Join on the portal and go straight into the lesson. Accounts are created when you accept a place.'
where question = 'Will there be a separate parent/student portal to log into?';
update public.faq_entries set answer = replace(answer, 'microphone and headset;', 'microphone and headset, and Microsoft Teams installed (free);')
where question = 'What equipment does my child need?' and answer not like '%Microsoft Teams%';
