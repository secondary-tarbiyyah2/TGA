-- 0206: calendar events (owner feedback 11 Nov 2026, item 4: "the calendar
-- page needs improvement in terms of organisation and also categorisation").
--
-- Until now the calendar could only show what other tables held (lessons,
-- homework, assessments, term dates). Staff can now add their own entries,
-- each in a category the calendar colours and filters by:
--   school_event  school events (sports day, a trip, a talk)
--   meeting       meetings (staff meeting, a parents' meeting)
--   assessment    assessments and exams (a mock week, a class test)
--   deadline      deadlines (reports due, a form to return)
--   holiday       holidays and term dates (an extra closure day, a trip abroad)
--   admissions    admissions (open mornings, interviews, offer deadlines)
--   islamic       Islamic dates the school marks (a talk for Ramadan)
--
-- Who sees an entry (audience):
--   everyone  every signed-in member of the school
--   staff     staff only
--   families  staff, parents and pupils
--   class     staff who teach the class, its pupils and their parents
-- Admissions entries are always staff only (enforced below).
--
-- Who adds and changes entries: the office (head teacher, admin, admissions)
-- any entry; other staff add staff-only entries and entries for classes they
-- teach, and change or delete their own. RLS on, default deny.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (category in ('school_event', 'meeting', 'assessment', 'deadline', 'holiday', 'admissions', 'islamic')),
  starts_on date not null,
  ends_on date,
  start_time time,
  end_time time,
  audience text not null default 'everyone' check (audience in ('everyone', 'staff', 'families', 'class')),
  class_id uuid references public.classes(id) on delete cascade,
  location text check (location is null or char_length(location) <= 200),
  link_url text check (link_url is null or (link_url ~* '^https://[^[:space:]]+$' and char_length(link_url) <= 500)),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_dates check (ends_on is null or ends_on >= starts_on),
  constraint calendar_events_times check (end_time is null or (start_time is not null and (end_time > start_time or coalesce(ends_on, starts_on) > starts_on))),
  constraint calendar_events_class check ((audience = 'class') = (class_id is not null)),
  constraint calendar_events_admissions_staff check (category <> 'admissions' or audience = 'staff')
);

create index if not exists calendar_events_dates_idx on public.calendar_events (starts_on, ends_on);
create index if not exists calendar_events_class_idx on public.calendar_events (class_id) where class_id is not null;

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon;

create or replace function public.calendar_event_visible(p_audience text, p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_staff_member(auth.uid())
    or p_audience = 'everyone'
    or (p_audience = 'families' and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('parent', 'student')))
    or (p_audience = 'class' and p_class_id is not null and (
          public.class_has_parents_child(p_class_id)
          or public.class_has_students_own_enrolment(p_class_id)))
  );
$$;

-- May the caller add (or move an entry to) this audience?
create or replace function public.calendar_event_writable(p_audience text, p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null and public.is_staff_member(auth.uid()) and (
    public.current_has_role(array['head_teacher', 'admin', 'admissions'])
    or p_audience = 'staff'
    or (p_audience = 'class' and p_class_id is not null and public.class_taught_by_current_user(p_class_id))
  );
$$;

revoke all on function public.calendar_event_visible(text, uuid) from public, anon;
revoke all on function public.calendar_event_writable(text, uuid) from public, anon;
grant execute on function public.calendar_event_visible(text, uuid) to authenticated;
grant execute on function public.calendar_event_writable(text, uuid) to authenticated;

drop policy if exists "calendar_events: read by audience" on public.calendar_events;
create policy "calendar_events: read by audience" on public.calendar_events
  for select to authenticated
  using (public.calendar_event_visible(audience, class_id));

drop policy if exists "calendar_events: staff add" on public.calendar_events;
create policy "calendar_events: staff add" on public.calendar_events
  for insert to authenticated
  with check (created_by = auth.uid() and public.calendar_event_writable(audience, class_id));

drop policy if exists "calendar_events: own or office change" on public.calendar_events;
create policy "calendar_events: own or office change" on public.calendar_events
  for update to authenticated
  using (created_by = auth.uid() or public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.calendar_event_writable(audience, class_id));

drop policy if exists "calendar_events: own or office delete" on public.calendar_events;
create policy "calendar_events: own or office delete" on public.calendar_events
  for delete to authenticated
  using (created_by = auth.uid() or public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create or replace function public.calendar_events_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.created_by := old.created_by; -- the author never changes
  return new;
end;
$$;
drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function public.calendar_events_touch();

drop trigger if exists audit_calendar_events on public.calendar_events;
create trigger audit_calendar_events
  after insert or update or delete on public.calendar_events
  for each row execute function public.audit_row_change();
