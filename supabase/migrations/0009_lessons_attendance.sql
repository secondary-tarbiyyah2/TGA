-- Phase B: live lessons (BigBlueButton), attendance, recording consent +
-- retention, and LMS settings for /learn.
--
-- Same conventions as 0007/0008:
--   * RLS enabled on every table, default deny.
--   * Anything that touches BigBlueButton (a shared secret, meeting
--     creation, join URLs, recording control, raw-file export) is NEVER
--     writable/readable directly by the client — it all goes through Edge
--     Functions using the service-role key, which re-check the caller's
--     permission server-side. `lesson_instances` and `lesson_recordings`
--     therefore have NO client write policies at all (read-only tables from
--     the client's point of view), same pattern as `login_attempts`/
--     `ics_tokens` in 0007/0008.
--   * Mutual-reference RLS recursion is avoided the same way as 0008: a
--     SECURITY DEFINER helper resolves "which class does this lesson
--     belong to" once, then the existing 0008 class_* helpers do the rest.
--
-- Data minimisation choices (see final report for the full list):
--   * No raw recording file URL, download link, or BBB shared secret is
--     ever stored in a client-readable column. Only metadata (status,
--     duration, retention date) lives in `lesson_recordings`.
--   * `recording_consents` stores ONE current-state row per child (not a
--     full history of every toggle) — a timestamp of the latest decision is
--     enough for the stated purpose (gating today's visibility), and a
--     full audit trail of every consent change is unnecessary retained
--     personal data.
--   * `attendance_records` stores a status/note per child per lesson, not a
--     duplicated copy of the child's name/DOB/year group (those stay in
--     `children`, joined at read time).
--   * Recording retention is enforced by a scheduled deletion job (see
--     .github/workflows/lms-recording-retention.yml) that deletes both the
--     BBB-side recording and the DB row — no "soft delete forever" pile-up.

-- ── lms_settings (singleton row; the only Supabase-side settings table —
-- see SETUP.md for why retention/alerting config lives here rather than in
-- Sanity: it's read by unattended scheduled jobs that must not depend on a
-- second CMS's uptime/credentials for a safety-critical deletion/alerting
-- schedule, and it's edited by Head Teacher/Admin directly, not through a
-- content-publish workflow) ─────────────────────────────────────────────
create table public.lms_settings (
  id boolean primary key default true check (id), -- singleton: exactly one row ever
  recording_retention_days int not null default 90 check (recording_retention_days > 0),
  absence_alert_delay_minutes int not null default 60 check (absence_alert_delay_minutes >= 0),
  unexplained_absence_threshold int not null default 3 check (unexplained_absence_threshold > 0),
  unexplained_absence_period_days int not null default 30 check (unexplained_absence_period_days > 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.lms_settings (id) values (true);

alter table public.lms_settings enable row level security;

create policy "lms_settings: staff with manage_academic/safeguarding_lead read"
  on public.lms_settings for select
  to authenticated
  using (
    public.current_has_permission('manage_academic')
    or public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create policy "lms_settings: head_teacher/admin write"
  on public.lms_settings for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_lms_settings
  after update on public.lms_settings
  for each row execute function public.audit_row_change();

-- ── lesson_instances (a lesson = one concrete date occurrence of a
-- published timetable_slot; created by the lesson-instances-generate Edge
-- Function, never hand-typed, so it's always traceable back to the
-- published timetable it came from) ──────────────────────────────────────
create table public.lesson_instances (
  id uuid primary key default gen_random_uuid(),
  timetable_slot_id uuid not null references public.timetable_slots(id) on delete cascade,
  date date not null,
  objectives text,
  resources jsonb not null default '[]'::jsonb, -- [{label, url}], teacher-editable, no file storage of our own
  bbb_meeting_id text unique, -- set the first time someone joins; null until then
  bbb_status text not null default 'not_started' check (bbb_status in ('not_started', 'live', 'ended')),
  recording_enabled boolean not null default true,
  recording_paused boolean not null default false,
  created_at timestamptz not null default now(),
  unique (timetable_slot_id, date)
);

alter table public.lesson_instances enable row level security;

-- Recursion-avoidance helper: resolve a lesson instance's class_id once,
-- through timetable_slots (which has its own, already-correct RLS — this
-- function is SECURITY DEFINER purely to make a single clean join available
-- to every policy below, not to bypass anything meaningful, since class_id
-- itself isn't sensitive).
create or replace function public.lesson_instance_class_id(p_instance_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select ts.class_id
  from public.lesson_instances li
  join public.timetable_slots ts on ts.id = li.timetable_slot_id
  where li.id = p_instance_id;
$$;

grant execute on function public.lesson_instance_class_id(uuid) to authenticated;

create policy "lesson_instances: teacher of class reads own"
  on public.lesson_instances for select
  to authenticated
  using (public.class_taught_by_current_user(public.lesson_instance_class_id(lesson_instances.id)));

create policy "lesson_instances: parent reads own child's"
  on public.lesson_instances for select
  to authenticated
  using (public.class_has_parents_child(public.lesson_instance_class_id(lesson_instances.id)));

create policy "lesson_instances: student reads own"
  on public.lesson_instances for select
  to authenticated
  using (public.class_has_students_own_enrolment(public.lesson_instance_class_id(lesson_instances.id)));

create policy "lesson_instances: staff with manage_academic read all"
  on public.lesson_instances for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

-- No INSERT/UPDATE/DELETE policy at all: creation (lesson-instances-generate),
-- objective/resource edits (lesson-update-details), and every BBB-touching
-- field (lesson-join, recording-control) go through Edge Functions using
-- the service-role key, which re-check "is this caller the class's teacher /
-- staff with manage_academic" server-side. This is deliberate — Postgres RLS
-- can't restrict individual COLUMNS (e.g. "teacher may edit objectives but
-- never bbb_status") within one UPDATE policy, and that distinction matters
-- here, so the Edge Function is the enforcement point instead.

-- ── lesson_recordings (metadata only — no file path, no download URL; see
-- header note) ────────────────────────────────────────────────────────────
create table public.lesson_recordings (
  id uuid primary key default gen_random_uuid(),
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  bbb_recording_id text not null unique,
  status text not null default 'processing' check (status in ('processing', 'available', 'deleted')),
  duration_seconds int,
  recorded_at timestamptz,
  retention_deletes_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.lesson_recordings enable row level security;

create index lesson_recordings_retention_idx on public.lesson_recordings (retention_deletes_at);

-- Metadata visibility (NOT the playback URL — that only ever comes from the
-- recording-access Edge Function, which separately checks consent). Showing
-- "a recording exists, pending consent" to an enrolled family is fine on its
-- own; it carries no video content.
create policy "lesson_recordings: teacher of class reads own lesson's"
  on public.lesson_recordings for select
  to authenticated
  using (public.class_taught_by_current_user(public.lesson_instance_class_id(lesson_recordings.lesson_instance_id)));

create policy "lesson_recordings: parent reads own child's lesson's"
  on public.lesson_recordings for select
  to authenticated
  using (public.class_has_parents_child(public.lesson_instance_class_id(lesson_recordings.lesson_instance_id)));

create policy "lesson_recordings: student reads own lesson's"
  on public.lesson_recordings for select
  to authenticated
  using (public.class_has_students_own_enrolment(public.lesson_instance_class_id(lesson_recordings.lesson_instance_id)));

create policy "lesson_recordings: staff with manage_academic read all"
  on public.lesson_recordings for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

-- No client write policy — created/updated by the BBB recording-ready
-- webhook handler and deleted by the scheduled retention job, both service
-- role only.

-- ── recording_consents (ONE current-state row per child — see header note
-- on why this isn't a full history table) ────────────────────────────────
-- Surrogate `id` (rather than a child_id-only primary key), same reasoning
-- as 0007's user_permissions: the shared audit_row_change() trigger reads
-- NEW/OLD.id unconditionally — confirmed empirically here too (a first
-- version with child_id as the primary key raised 'record "old" has no
-- field "id"' the moment a consent row was deleted).
create table public.recording_consents (
  id bigint generated always as identity primary key,
  child_id uuid not null unique references public.children(id) on delete cascade,
  given boolean not null,
  given_by uuid references public.profiles(id),
  given_at timestamptz not null default now()
);

alter table public.recording_consents enable row level security;

create policy "recording_consents: parent manages own child's"
  on public.recording_consents for all
  to authenticated
  using (public.child_belongs_to_parent(recording_consents.child_id))
  with check (public.child_belongs_to_parent(recording_consents.child_id));

create policy "recording_consents: staff with manage_people_accounts/safeguarding_lead read"
  on public.recording_consents for select
  to authenticated
  using (
    public.current_has_permission('manage_people_accounts')
    or public.current_has_permission('safeguarding_lead')
  );

create trigger audit_recording_consents
  after insert or update or delete on public.recording_consents
  for each row execute function public.audit_row_change();

-- ── attendance_records ───────────────────────────────────────────────────
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late')),
  marked_by uuid references public.profiles(id),
  marked_at timestamptz not null default now(),
  note text,
  unique (lesson_instance_id, child_id)
);

alter table public.attendance_records enable row level security;

create index attendance_records_child_idx on public.attendance_records (child_id);

-- A teacher may only mark attendance for a child actually enrolled in that
-- lesson's class — not just "any child" — enforced in the WITH CHECK via a
-- plain join to enrolments (no recursion hazard: enrolments' own policies
-- never reference attendance_records).
create policy "attendance_records: class teacher manages own class's"
  on public.attendance_records for all
  to authenticated
  using (public.class_taught_by_current_user(public.lesson_instance_class_id(attendance_records.lesson_instance_id)))
  with check (
    public.class_taught_by_current_user(public.lesson_instance_class_id(attendance_records.lesson_instance_id))
    and exists (
      select 1 from public.enrolments e
      where e.child_id = attendance_records.child_id
        and e.class_id = public.lesson_instance_class_id(attendance_records.lesson_instance_id)
    )
  );

create policy "attendance_records: parent reads own child's"
  on public.attendance_records for select
  to authenticated
  using (public.child_belongs_to_parent(attendance_records.child_id));

create policy "attendance_records: student reads own"
  on public.attendance_records for select
  to authenticated
  using (public.child_belongs_to_student(attendance_records.child_id));

create policy "attendance_records: staff with manage_academic read all"
  on public.attendance_records for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

create policy "attendance_records: head_teacher/admin manage all"
  on public.attendance_records for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_attendance_records
  after insert or update or delete on public.attendance_records
  for each row execute function public.audit_row_change();

-- ── absence_notices (parent-submitted advance notice; marked so the
-- absence-alert job never flags this lesson as "unexplained" for this
-- child) ──────────────────────────────────────────────────────────────────
create table public.absence_notices (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  reason text not null,
  submitted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (child_id, lesson_instance_id)
);

alter table public.absence_notices enable row level security;

create policy "absence_notices: parent manages own child's"
  on public.absence_notices for all
  to authenticated
  using (public.child_belongs_to_parent(absence_notices.child_id))
  with check (public.child_belongs_to_parent(absence_notices.child_id) and submitted_by = auth.uid());

create policy "absence_notices: class teacher reads own class's"
  on public.absence_notices for select
  to authenticated
  using (public.class_taught_by_current_user(public.lesson_instance_class_id(absence_notices.lesson_instance_id)));

create policy "absence_notices: staff with manage_academic/safeguarding_lead read all"
  on public.absence_notices for select
  to authenticated
  using (
    public.current_has_permission('manage_academic')
    or public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create trigger audit_absence_notices
  after insert or update or delete on public.absence_notices
  for each row execute function public.audit_row_change();

-- ── audit_log: extend read access to the new learn-side compliance/
-- safeguarding roles (0003 only lets the legacy profiles.role='admin' read
-- it — additive policy, doesn't remove that one, OR'd together by Postgres
-- for SELECT). Needed so a Head Teacher/Safeguarding Lead can review
-- recording-export access logs without also being the legacy admin role.
create policy "audit_log: learn staff with view_compliance/safeguarding_lead read"
  on public.audit_log for select
  to authenticated
  using (
    public.current_has_permission('view_compliance')
    or public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher'])
  );
