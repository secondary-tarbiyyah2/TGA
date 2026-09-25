-- Phase A: academic structure + timetabling for /learn.
--
-- Extends the role/permission layer from 0007. Same conventions:
--   * RLS enabled on every table, default deny, only narrow SELECT
--     (and, where the data is low-sensitivity and staff-permission-gated,
--     direct INSERT/UPDATE/DELETE) policies granted.
--   * Anything sensitive (role grants, publishing a run, cover assignment,
--     ics tokens) is written through an Edge Function using the
--     service-role key, which re-checks the caller's permission
--     server-side — never trusted from the request body.
--   * Teacher/session double-booking is impossible at the DB level via a
--     btree_gist EXCLUDE constraint (same technique as 0001's
--     bookings_no_staff_overlap), not just an app-level check.
--
-- Term dates: `terms` mirrors Sanity's `termDate` content (single source of
-- truth per the ground rules) — this migration does NOT let terms be
-- hand-entered in the app. `scripts/sync-terms-from-sanity.mjs` (added
-- alongside this migration) upserts `terms` rows keyed on
-- `sanity_document_id` from Sanity's confirmed termDate documents of
-- kind "Term date". Nothing under /learn/admin/academic can create or edit
-- a term directly — that screen is read-only display, matching the ground
-- rule "dates ... live in Sanity CMS ... never hardcoded" / "never entered
-- twice".

-- ── academic_years ───────────────────────────────────────────────────────
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique, -- e.g. "2026/27", or "2099/00 (TEST)" for seed data
  starts_on date not null,
  ends_on date not null,
  is_test boolean not null default false, -- true only for seed/test data (ground rule 2)
  created_at timestamptz not null default now(),
  constraint academic_years_date_order check (ends_on > starts_on)
);

alter table public.academic_years enable row level security;

create policy "academic_years: authenticated read"
  on public.academic_years for select
  to authenticated
  using (true);

create policy "academic_years: staff with manage_academic write"
  on public.academic_years for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- ── terms (synced from Sanity, never hand-duplicated) ───────────────────
create table public.terms (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null, -- e.g. "Autumn Term"
  starts_on date not null,
  ends_on date not null,
  sanity_document_id text unique, -- null only for terms created directly for TEST data, never for real terms
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint terms_date_order check (ends_on > starts_on)
);

alter table public.terms enable row level security;

create policy "terms: authenticated read"
  on public.terms for select
  to authenticated
  using (true);

-- Direct writes are allowed here (not Sanity-editable "confirmed" content
-- yet, or TEST data) but ONLY for rows with no sanity_document_id — the
-- sync script (service role) owns every row that came from Sanity. This is
-- enforced by the trigger below, not by the policy alone, because a policy
-- can't easily express "unless this specific row is Sanity-owned" on
-- UPDATE without re-reading OLD twice.
create policy "terms: staff with manage_academic write"
  on public.terms for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create or replace function public.protect_sanity_owned_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := current_setting('request.jwt.claims', true)::json->>'role';
begin
  if coalesce(v_jwt_role, '') = 'service_role' then
    return new; -- the sync script is the source of truth for these rows
  end if;
  if tg_op = 'UPDATE' and old.sanity_document_id is not null then
    raise exception 'terms: rows synced from Sanity cannot be edited directly — edit the term date in Sanity instead';
  end if;
  if tg_op = 'INSERT' and new.sanity_document_id is not null then
    raise exception 'terms: rows with a sanity_document_id can only be created by the sync script';
  end if;
  return new;
end;
$$;

create trigger protect_sanity_owned_terms
  before insert or update on public.terms
  for each row execute function public.protect_sanity_owned_terms();

-- ── year_groups / subjects ───────────────────────────────────────────────
create table public.year_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- e.g. "Year 4"
  sort_order int not null default 0,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.year_groups enable row level security;

create policy "year_groups: authenticated read"
  on public.year_groups for select
  to authenticated
  using (true);

create policy "year_groups: staff with manage_academic write"
  on public.year_groups for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  is_core boolean not null default false, -- feeds the solver's "core subjects earlier" soft constraint
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.subjects enable row level security;

create policy "subjects: authenticated read"
  on public.subjects for select
  to authenticated
  using (true);

create policy "subjects: staff with manage_academic write"
  on public.subjects for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- ── classes: extend the minimal 0007 table into a real "teaching set" ───
-- 0007 created a minimal `classes` (id, name, year_group text, subject
-- text) purely so scope_id had somewhere valid to point at. This adds the
-- real structured columns the timetabling system needs, keeping the
-- existing table/policies (teacher/TA read own via user_roles scope,
-- manage_academic reads all) intact rather than duplicating a second
-- classes table.
alter table public.classes
  add column academic_year_id uuid references public.academic_years(id) on delete set null,
  add column year_group_id uuid references public.year_groups(id) on delete set null,
  add column subject_id uuid references public.subjects(id) on delete set null,
  add column weekly_lessons int not null default 1 check (weekly_lessons > 0),
  add column lesson_length_minutes int not null default 60 check (lesson_length_minutes > 0),
  add column is_test boolean not null default false;

create policy "classes: staff with manage_academic write"
  on public.classes for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- ── children (parent-owned; distinct from `students`, which is the
-- pre-existing booking-system record keyed to a `family`) ──────────────
-- The booking system's `students`/`families` model doesn't fit /learn's
-- role model 1:1 (a `family` can have several parent profiles; /learn
-- needs one clear parent_user_id per child for RLS scoping, and a nullable
-- link to an auth account for the child's OWN login — see
-- student_accounts below). Rather than overload `students` with
-- login-account concerns, `children` is /learn's own record, deliberately
-- kept separate. A future phase can backfill/link the two; not required
-- for Phase A's own RLS/timetable model to be correct today.
create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  dob date not null,
  year_group_id uuid references public.year_groups(id) on delete set null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.children enable row level security;

create policy "children: parent reads own"
  on public.children for select
  to authenticated
  using (parent_user_id = auth.uid());

create policy "children: parent manages own"
  on public.children for insert
  to authenticated
  with check (parent_user_id = auth.uid());

create policy "children: parent updates own"
  on public.children for update
  to authenticated
  using (parent_user_id = auth.uid())
  with check (parent_user_id = auth.uid());

create policy "children: staff with manage_people_accounts read all"
  on public.children for select
  to authenticated
  using (public.current_has_permission('manage_people_accounts'));

create policy "children: staff with manage_people_accounts write all"
  on public.children for all
  to authenticated
  using (public.current_has_permission('manage_people_accounts'))
  with check (public.current_has_permission('manage_people_accounts'));

-- (the "teacher reads own class's enrolled children" policy lives further
-- down, right after `enrolments` is created, since it needs that table)


-- ── student_accounts: link a child to its OWN auth.users login ─────────
-- Ground rule: ALL students, any year group, get a real Supabase Auth
-- login with full access to their own data — the difference for younger
-- students is UI only. `profile_id` is null until the account is created
-- (via learn-invite, same as staff), at which point the child can sign in
-- and every RLS policy below scoped to "student reads own" uses this link.
create table public.student_accounts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete set null,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.student_accounts enable row level security;

create policy "student_accounts: self reads own"
  on public.student_accounts for select
  to authenticated
  using (profile_id = auth.uid());

create policy "student_accounts: parent reads own child's"
  on public.student_accounts for select
  to authenticated
  using (exists (
    select 1 from public.children c where c.id = student_accounts.child_id and c.parent_user_id = auth.uid()
  ));

create policy "student_accounts: staff with manage_people_accounts read/write all"
  on public.student_accounts for all
  to authenticated
  using (public.current_has_permission('manage_people_accounts'))
  with check (public.current_has_permission('manage_people_accounts'));

-- ── enrolments ────────────────────────────────────────────────────────
create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, child_id)
);

alter table public.enrolments enable row level security;

-- ── recursion-avoidance helpers ─────────────────────────────────────────
-- children, enrolments, classes and student_accounts policies each need to
-- check facts about ONE ANOTHER (e.g. "is this child enrolled in a class I
-- teach" touches enrolments AND user_roles; "is this class one of my
-- child's" touches enrolments AND children). A plain `exists (select ...
-- from other_table where ...)` inside a policy re-enters that other
-- table's OWN RLS policies, which — when they in turn reference the first
-- table — recurses (confirmed empirically: "infinite recursion detected in
-- policy for relation enrolments" on this exact mutual reference between
-- children and enrolments, the same class of bug 0007 already documents
-- for user_roles). Same fix as 0007's current_role_is(): SECURITY DEFINER
-- functions run as the owning (migration) role, which bypasses RLS, so the
-- query inside never re-enters policy evaluation.
create or replace function public.child_belongs_to_parent(p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.children where id = p_child_id and parent_user_id = auth.uid());
$$;

grant execute on function public.child_belongs_to_parent(uuid) to authenticated;

create or replace function public.child_belongs_to_student(p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.student_accounts where child_id = p_child_id and profile_id = auth.uid()
  );
$$;

grant execute on function public.child_belongs_to_student(uuid) to authenticated;

create or replace function public.class_taught_by_current_user(p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('teacher', 'teaching_assistant_cover')
      and ur.scope_type = 'class' and ur.scope_id = p_class_id
  );
$$;

grant execute on function public.class_taught_by_current_user(uuid) to authenticated;

create or replace function public.class_has_parents_child(p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.enrolments e join public.children c on c.id = e.child_id
    where e.class_id = p_class_id and c.parent_user_id = auth.uid()
  );
$$;

grant execute on function public.class_has_parents_child(uuid) to authenticated;

create or replace function public.class_has_students_own_enrolment(p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.enrolments e join public.student_accounts sa on sa.child_id = e.child_id
    where e.class_id = p_class_id and sa.profile_id = auth.uid()
  );
$$;

grant execute on function public.class_has_students_own_enrolment(uuid) to authenticated;

create or replace function public.child_enrolled_in_teachers_class(p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.enrolments e
    where e.child_id = p_child_id and public.class_taught_by_current_user(e.class_id)
  );
$$;

grant execute on function public.child_enrolled_in_teachers_class(uuid) to authenticated;

create policy "enrolments: parent reads own child's"
  on public.enrolments for select
  to authenticated
  using (public.child_belongs_to_parent(enrolments.child_id));

create policy "enrolments: student reads own"
  on public.enrolments for select
  to authenticated
  using (public.child_belongs_to_student(enrolments.child_id));

create policy "enrolments: teacher reads own class's"
  on public.enrolments for select
  to authenticated
  using (public.class_taught_by_current_user(enrolments.class_id));

create policy "enrolments: staff with manage_academic read/write all"
  on public.enrolments for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- Teachers/TAs need to see the name of a child sitting in their own class
-- (e.g. cover notes), scoped strictly to children actually enrolled in a
-- class they're assigned to — never the whole roster.
create policy "children: teacher reads own class's enrolled children"
  on public.children for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(children.id));

-- Parent view of "my children's classes" also needs to read the class row
-- itself (name/subject/year group), not just the enrolment link.
create policy "classes: parent reads own child's classes"
  on public.classes for select
  to authenticated
  using (public.class_has_parents_child(classes.id));

create policy "classes: student reads own"
  on public.classes for select
  to authenticated
  using (public.class_has_students_own_enrolment(classes.id));

-- ── virtual_sessions ("rooms" for an online school: a virtual meeting
-- slot/link, not a physical room) ───────────────────────────────────────
create table public.virtual_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- e.g. "Session A", "Main Hall (virtual)"
  meeting_url text,
  capacity int,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.virtual_sessions enable row level security;

create policy "virtual_sessions: authenticated read"
  on public.virtual_sessions for select
  to authenticated
  using (true);

create policy "virtual_sessions: staff with manage_academic write"
  on public.virtual_sessions for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- ── teacher_availability ─────────────────────────────────────────────────
create table public.teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  contracted boolean not null default true, -- false = "can teach but prefers not to" (soft), true = hard availability window
  created_at timestamptz not null default now(),
  constraint teacher_availability_time_valid check (end_time > start_time)
);

alter table public.teacher_availability enable row level security;

create policy "teacher_availability: owning teacher manages own"
  on public.teacher_availability for all
  to authenticated
  using (teacher_user_id = auth.uid())
  with check (teacher_user_id = auth.uid());

create policy "teacher_availability: staff with manage_academic read/write all"
  on public.teacher_availability for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- Timetabler needs to read (not necessarily edit) every teacher's
-- availability to run the solver — covered by manage_academic above for
-- staff who hold it; timetabler is an add-on permission that may be held
-- without manage_academic, so grant it read access too.
create policy "teacher_availability: timetabler reads all"
  on public.teacher_availability for select
  to authenticated
  using (public.current_has_permission('timetabler'));

-- ── protected_times (e.g. Jumu'ah / prayer breaks — admin-configurable,
-- applies across the whole school, not per-teacher) ──────────────────────
create table public.protected_times (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- e.g. "Jumu'ah break"
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint protected_times_time_valid check (end_time > start_time)
);

alter table public.protected_times enable row level security;

create policy "protected_times: authenticated read"
  on public.protected_times for select
  to authenticated
  using (true);

create policy "protected_times: staff with manage_academic write"
  on public.protected_times for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

-- ── timetable_runs (versioning: draft -> review -> published ->
-- superseded; rollback = publish an old run's slots again as a NEW run) ──
create table public.timetable_runs (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'superseded', 'failed')),
  label text not null, -- e.g. "Autumn 2026 v3" or "Autumn 2026 — rollback to v1"
  generated_by text not null default 'solver' check (generated_by in ('solver', 'manual', 'rollback')),
  source_run_id uuid references public.timetable_runs(id), -- set for a rollback run: which run it republishes
  created_by uuid references public.profiles(id),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  solver_stats jsonb, -- solve time, objective value, feasibility, etc, for transparency in the review UI
  created_at timestamptz not null default now()
);

alter table public.timetable_runs enable row level security;

create policy "timetable_runs: staff with timetabler manage all"
  on public.timetable_runs for all
  to authenticated
  using (public.current_has_permission('timetabler'))
  with check (public.current_has_permission('timetabler'));

create policy "timetable_runs: head_teacher/admin manage all"
  on public.timetable_runs for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- Anyone signed in can read a PUBLISHED run's label/term (not draft
-- internals) — needed so a parent/student/teacher timetable view can show
-- "Autumn 2026" without a bespoke read path per role.
create policy "timetable_runs: authenticated read published"
  on public.timetable_runs for select
  to authenticated
  using (status = 'published' or status = 'superseded');

-- timetable_runs and timetable_slots policies each need a fact about the
-- OTHER table (a run's status; whether a run contains one of my slots) —
-- same mutual-RLS-recursion hazard as above, same SECURITY DEFINER fix.
-- run_status only touches timetable_runs (already created), so it's
-- defined here; run_has_current_users_slot needs `timetable_slots`, so it's
-- defined further down, right after that table (and the "teacher reads
-- runs containing their slots" policy that uses it lives there too).
create or replace function public.run_status(p_run_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select status from public.timetable_runs where id = p_run_id;
$$;

grant execute on function public.run_status(uuid) to authenticated;

-- ── timetable_slots ───────────────────────────────────────────────────────
create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.timetable_runs(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(id),
  virtual_session_id uuid references public.virtual_sessions(id),
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint timetable_slots_time_valid check (end_time > start_time)
);

alter table public.timetable_slots enable row level security;

-- Impossible-to-bypass double-booking prevention (ground rule: "use a
-- Postgres EXCLUDE constraint ... to make teacher/room double-booking
-- impossible at the DB level, not just app-level" — same technique as
-- 0001's bookings_no_staff_overlap). Scoped per run_id so a DRAFT run being
-- edited never conflicts with the currently PUBLISHED run's own slots —
-- each run is an independent, internally-consistent timetable; only slots
-- *within the same run* must never overlap for the same teacher/session.
alter table public.timetable_slots
  add constraint timetable_slots_no_teacher_overlap
  exclude using gist (
    run_id with =,
    teacher_user_id with =,
    weekday with =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) with &&
  );

alter table public.timetable_slots
  add constraint timetable_slots_no_session_overlap
  exclude using gist (
    run_id with =,
    virtual_session_id with =,
    weekday with =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) with &&
  ) where (virtual_session_id is not null);

alter table public.timetable_slots
  add constraint timetable_slots_no_class_overlap
  exclude using gist (
    run_id with =,
    class_id with =,
    weekday with =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) with &&
  );

create policy "timetable_slots: authenticated read own via published run"
  on public.timetable_slots for select
  to authenticated
  using (
    public.run_status(timetable_slots.run_id) = 'published'
    and (
      teacher_user_id = auth.uid()
      or public.class_has_parents_child(timetable_slots.class_id)
      or public.class_has_students_own_enrolment(timetable_slots.class_id)
    )
  );

create policy "timetable_slots: teacher reads own slots in any run"
  on public.timetable_slots for select
  to authenticated
  using (teacher_user_id = auth.uid());

create policy "timetable_slots: staff with timetabler manage all"
  on public.timetable_slots for all
  to authenticated
  using (public.current_has_permission('timetabler'))
  with check (public.current_has_permission('timetabler'));

create policy "timetable_slots: head_teacher/admin manage all"
  on public.timetable_slots for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- Teachers reviewing a draft that affects their own classes need to read
-- that run row too (for its label/status), not just their own slots.
create or replace function public.run_has_current_users_slot(p_run_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.timetable_slots where run_id = p_run_id and teacher_user_id = auth.uid()
  );
$$;

grant execute on function public.run_has_current_users_slot(uuid) to authenticated;

create policy "timetable_runs: teacher reads runs containing their slots"
  on public.timetable_runs for select
  to authenticated
  using (public.run_has_current_users_slot(timetable_runs.id));

create index timetable_slots_run_idx on public.timetable_slots (run_id);
create index timetable_slots_teacher_idx on public.timetable_slots (teacher_user_id);
create index timetable_slots_class_idx on public.timetable_slots (class_id);

-- ── timetable_conflicts (plain-language, so the review UI needs no
-- separate translation layer) ────────────────────────────────────────────
create table public.timetable_conflicts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.timetable_runs(id) on delete cascade,
  severity text not null check (severity in ('hard', 'soft')),
  resolved boolean not null default false,
  class_id uuid references public.classes(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_user_id uuid references public.profiles(id) on delete set null,
  message text not null, -- plain language, e.g. "Year 4 Arabic cannot be placed: no teacher available"
  created_at timestamptz not null default now()
);

alter table public.timetable_conflicts enable row level security;

create policy "timetable_conflicts: staff with timetabler manage all"
  on public.timetable_conflicts for all
  to authenticated
  using (public.current_has_permission('timetabler'))
  with check (public.current_has_permission('timetabler'));

create policy "timetable_conflicts: head_teacher/admin manage all"
  on public.timetable_conflicts for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- A class's own teacher can see conflicts affecting their class too (read
-- only — resolving them is a timetabler/admin action).
create policy "timetable_conflicts: teacher reads own class's conflicts"
  on public.timetable_conflicts for select
  to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('teacher', 'teaching_assistant_cover')
      and ur.scope_type = 'class' and ur.scope_id = timetable_conflicts.class_id
  ));

-- ── cover_assignments ─────────────────────────────────────────────────────
create table public.cover_assignments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.timetable_slots(id) on delete cascade,
  cover_date date not null,
  original_teacher_user_id uuid not null references public.profiles(id),
  covering_teacher_user_id uuid not null references public.profiles(id),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (slot_id, cover_date)
);

alter table public.cover_assignments enable row level security;

create policy "cover_assignments: original or covering teacher reads own"
  on public.cover_assignments for select
  to authenticated
  using (original_teacher_user_id = auth.uid() or covering_teacher_user_id = auth.uid());

create policy "cover_assignments: staff with manage_academic manage all"
  on public.cover_assignments for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create policy "cover_assignments: head_teacher/admin manage all"
  on public.cover_assignments for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- ── ics_tokens (per-user, long-lived, revocable calendar-feed tokens) ────
-- Same pattern as the booking system's manage tokens (0001 +
-- supabase/functions/_shared/manageToken.ts): only the SHA-256 hash is
-- stored, so the raw token is never recoverable from the database even by
-- someone with DB access. The token grants read-only access to exactly one
-- user's own published timetable — deliberately NOT a session, since
-- calendar apps can't do interactive auth; revoking is a client-side
-- delete of their own row (or staff support action).
create table public.ics_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.ics_tokens enable row level security;

create policy "ics_tokens: self manages own"
  on public.ics_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No policy grants anon/authenticated SELECT by token_hash — the
-- timetable-ics Edge Function looks tokens up via the service-role key,
-- which bypasses RLS entirely. That's deliberate: the feed must work with
-- no Supabase session at all (a calendar app polling a URL), so the only
-- thing standing between a stranger and someone's timetable is the token
-- itself being unguessable — never "logged in as this user".

-- ── audit triggers (reuses 0003's generic audit_row_change()) ───────────
create trigger audit_timetable_runs
  after insert or update or delete on public.timetable_runs
  for each row execute function public.audit_row_change();

create trigger audit_cover_assignments
  after insert or update or delete on public.cover_assignments
  for each row execute function public.audit_row_change();

create trigger audit_children
  after insert or update or delete on public.children
  for each row execute function public.audit_row_change();

create trigger audit_student_accounts
  after insert or update or delete on public.student_accounts
  for each row execute function public.audit_row_change();

-- ── public sample-week hook (P5's eligibility quiz will call this later;
-- Phase A only guarantees it exists and never returns dummy data) ───────
-- Anonymised: subject name + weekday + period length only, from the most
-- recently published run — no teacher name, no student data, no class
-- name. Returns zero rows (never fabricated rows) until a real run is
-- published, matching the ground rule "must simply not render if no
-- published timetable exists yet".
create or replace function public.public_sample_timetable_week()
returns table (year_group text, subject text, weekday int, start_time time, end_time time)
language sql
stable
security definer
set search_path = public
as $$
  select yg.name, s.name, ts.weekday, ts.start_time, ts.end_time
  from public.timetable_slots ts
  join public.classes c on c.id = ts.class_id
  join public.subjects s on s.id = ts.subject_id
  left join public.year_groups yg on yg.id = c.year_group_id
  where ts.run_id = (
    select id from public.timetable_runs
    where status = 'published' and coalesce((solver_stats->>'is_test')::boolean, false) = false
    order by published_at desc
    limit 1
  );
$$;

grant execute on function public.public_sample_timetable_week() to anon, authenticated;
