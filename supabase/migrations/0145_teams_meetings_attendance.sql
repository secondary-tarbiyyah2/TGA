-- Microsoft Teams meetings for lessons, and Teams attendance suggestions.
--
-- Written ONLY by the teams-sync Edge Function (service role); see
-- supabase/functions/_shared/teamsMeetings.ts and docs/microsoft-365-setup.md.
--
-- lesson_teams_meetings: one row per lesson instance that has (or had) a
--   Teams meeting created for it as a calendar event in an organiser's
--   mailbox. lesson_instance_id is ON DELETE SET NULL, not cascade, so if a
--   lesson disappears (its timetable slot is deleted) the row survives long
--   enough for the next sync to cancel the Outlook/Teams event; it is then
--   kept as 'cancelled' for the audit trail.
-- lesson_teams_attendance: per-pupil totals from the meeting's Teams
--   attendance report, matched by email. A SUGGESTION shown on the teacher's
--   register; it never marks attendance itself. Only times and minutes are
--   stored — no Teams display names, and unmatched attendees are kept only
--   as a count.
-- children.microsoft_email: optional Microsoft 365 / Teams sign-in for a
--   pupil (if the school gives pupils school accounts), used only for that
--   matching.

create table if not exists public.lesson_teams_meetings (
  id uuid primary key default gen_random_uuid(),
  lesson_instance_id uuid unique references public.lesson_instances(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'cancelled', 'failed')),
  teacher_user_id uuid references public.profiles(id) on delete set null, -- teacher when created; a change (cover) means re-create under the new organiser
  organiser text,                -- mailbox (UPN) whose calendar holds the event
  organiser_id text,             -- its Entra object id (needed for onlineMeetings / attendance)
  event_id text,
  join_url text check (join_url is null or join_url ~* '^https://'),
  online_meeting_id text,        -- resolved lazily when attendance is first fetched
  subject text,
  starts_at timestamptz,
  ends_at timestamptz,
  fingerprint text,              -- hash of what was last sent to Graph, to detect changes
  generation int not null default 0, -- bumps on every (re)create; part of the Graph transactionId
  invited boolean not null default false, -- event has attendees, so cancel via /cancel (sends a cancellation)
  last_error text,
  attendance_status text not null default 'pending' check (attendance_status in ('pending', 'done', 'no_report', 'error', 'off')),
  attendance_attempts int not null default 0,
  attendance_fetched_at timestamptz,
  unmatched_attendees int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_teams_meetings_active_idx on public.lesson_teams_meetings (status, starts_at);
create index if not exists lesson_teams_meetings_attendance_idx on public.lesson_teams_meetings (attendance_status, ends_at);

alter table public.lesson_teams_meetings enable row level security;

drop policy if exists "lesson_teams_meetings: class teacher reads own" on public.lesson_teams_meetings;
create policy "lesson_teams_meetings: class teacher reads own"
  on public.lesson_teams_meetings for select
  to authenticated
  using (
    lesson_instance_id is not null
    and public.class_taught_by_current_user(public.lesson_instance_class_id(lesson_teams_meetings.lesson_instance_id))
  );

drop policy if exists "lesson_teams_meetings: academic staff and head/admin read all" on public.lesson_teams_meetings;
create policy "lesson_teams_meetings: academic staff and head/admin read all"
  on public.lesson_teams_meetings for select
  to authenticated
  using (public.current_has_permission('manage_academic') or public.current_has_role(array['head_teacher', 'admin']));
-- No client write policy: only the teams-sync Edge Function (service role) writes.

create table if not exists public.lesson_teams_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  first_join_at timestamptz,
  last_leave_at timestamptz,
  total_seconds int not null default 0 check (total_seconds >= 0),
  matched_by text not null check (matched_by in ('pupil_account', 'microsoft_email', 'parent_account')),
  fetched_at timestamptz not null default now(),
  unique (lesson_instance_id, child_id)
);

create index if not exists lesson_teams_attendance_child_idx on public.lesson_teams_attendance (child_id);

alter table public.lesson_teams_attendance enable row level security;

drop policy if exists "lesson_teams_attendance: class teacher reads own" on public.lesson_teams_attendance;
create policy "lesson_teams_attendance: class teacher reads own"
  on public.lesson_teams_attendance for select
  to authenticated
  using (public.class_taught_by_current_user(public.lesson_instance_class_id(lesson_teams_attendance.lesson_instance_id)));

drop policy if exists "lesson_teams_attendance: academic staff and head/admin read all" on public.lesson_teams_attendance;
create policy "lesson_teams_attendance: academic staff and head/admin read all"
  on public.lesson_teams_attendance for select
  to authenticated
  using (public.current_has_permission('manage_academic') or public.current_has_role(array['head_teacher', 'admin']));
-- No client write policy: only the teams-sync Edge Function (service role) writes.

alter table public.children add column if not exists microsoft_email text;
alter table public.children drop constraint if exists children_microsoft_email_format;
alter table public.children add constraint children_microsoft_email_format
  check (microsoft_email is null or microsoft_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
