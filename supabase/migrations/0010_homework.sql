-- Phase C: homework for /learn.
--
-- Same conventions as Phase A/B: RLS enabled everywhere, default deny,
-- direct client read/write policies only where the data isn't sensitive
-- enough to need column-level restriction, cross-table membership checks
-- go through SECURITY DEFINER stable helper functions (recursion-avoidance,
-- same reasoning as 0007/0008/0009), audit_log via the shared
-- audit_row_change() trigger, real `id` columns everywhere (the trigger
-- needs it).
--
-- `homework_submissions` (student-owned content: text/file + submitted_at)
-- is kept as a SEPARATE table from `homework_marks` (teacher-owned: grade,
-- feedback, released) rather than one wide table, because Postgres RLS
-- can't restrict individual COLUMNS within one policy — a student must be
-- able to write their own response/file but never their own grade or flip
-- `released` themselves. Same technique 0009 documents for lesson_instances
-- vs its BBB-only fields, applied here at the table-split level instead of
-- via an Edge Function, since a straight ownership check (not a
-- permission-elevation check) is all that's needed.

-- ── homework ──────────────────────────────────────────────────────────────
create table public.homework (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_instance_id uuid references public.lesson_instances(id) on delete set null,
  teacher_id uuid not null references public.profiles(id),
  title text not null,
  instructions text,
  resources jsonb not null default '[]'::jsonb, -- [{label, url}], same shape as lesson_instances.resources
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homework enable row level security;

create index homework_class_idx on public.homework (class_id, due_at desc);

create policy "homework: teacher of class manages own"
  on public.homework for all
  to authenticated
  using (public.class_taught_by_current_user(homework.class_id))
  with check (public.class_taught_by_current_user(homework.class_id) and teacher_id = auth.uid());

create policy "homework: parent reads own child's class"
  on public.homework for select
  to authenticated
  using (public.class_has_parents_child(homework.class_id));

create policy "homework: student reads own class"
  on public.homework for select
  to authenticated
  using (public.class_has_students_own_enrolment(homework.class_id));

create policy "homework: staff with manage_academic read all"
  on public.homework for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

create trigger audit_homework
  after insert or update or delete on public.homework
  for each row execute function public.audit_row_change();

-- ── homework_submissions (student-owned content only) ───────────────────
create table public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  kind text not null check (kind in ('text', 'file')),
  response_text text,
  file_path text, -- storage.objects path in the 'homework-submissions' bucket, set by the client after upload
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homework_id, child_id),
  constraint homework_submissions_content_shape check (
    (kind = 'text' and response_text is not null and file_path is null)
    or (kind = 'file' and file_path is not null)
  )
);

alter table public.homework_submissions enable row level security;

create index homework_submissions_child_idx on public.homework_submissions (child_id);

-- Recursion-avoidance helper: a child may only submit against homework set
-- for a class they're actually enrolled in (the ownership check on
-- `children`/`student_accounts` alone isn't enough — it would let a
-- student submit against ANY homework row by id).
create or replace function public.homework_child_enrolled(p_homework_id uuid, p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.homework h
    join public.enrolments e on e.class_id = h.class_id
    where h.id = p_homework_id and e.child_id = p_child_id
  );
$$;

grant execute on function public.homework_child_enrolled(uuid, uuid) to authenticated;

create or replace function public.homework_class_id(p_homework_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select class_id from public.homework where id = p_homework_id;
$$;

grant execute on function public.homework_class_id(uuid) to authenticated;

create policy "homework_submissions: student manages own"
  on public.homework_submissions for all
  to authenticated
  using (public.child_belongs_to_student(homework_submissions.child_id))
  with check (
    public.child_belongs_to_student(homework_submissions.child_id)
    and public.homework_child_enrolled(homework_submissions.homework_id, homework_submissions.child_id)
  );

create policy "homework_submissions: parent reads own child's"
  on public.homework_submissions for select
  to authenticated
  using (public.child_belongs_to_parent(homework_submissions.child_id));

create policy "homework_submissions: teacher of class reads own"
  on public.homework_submissions for select
  to authenticated
  using (public.class_taught_by_current_user(public.homework_class_id(homework_submissions.homework_id)));

create policy "homework_submissions: staff with manage_academic read all"
  on public.homework_submissions for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

create trigger audit_homework_submissions
  after insert or update or delete on public.homework_submissions
  for each row execute function public.audit_row_change();

-- ── homework_marks (teacher-owned: grade/feedback/release, never student-
-- or parent-writable) ────────────────────────────────────────────────────
create table public.homework_marks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.homework_submissions(id) on delete cascade,
  grade text, -- free-form (some homework isn't numerically graded) — see assessment migration for the structured mark-scheme model used for formal assessments
  feedback text,
  released boolean not null default false,
  marked_by uuid references public.profiles(id),
  marked_at timestamptz,
  released_by uuid references public.profiles(id),
  released_at timestamptz
);

alter table public.homework_marks enable row level security;

create or replace function public.submission_homework_class_id(p_submission_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select public.homework_class_id(hs.homework_id)
  from public.homework_submissions hs
  where hs.id = p_submission_id;
$$;

grant execute on function public.submission_homework_class_id(uuid) to authenticated;

create or replace function public.submission_child_id(p_submission_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select child_id from public.homework_submissions where id = p_submission_id;
$$;

grant execute on function public.submission_child_id(uuid) to authenticated;

create policy "homework_marks: teacher of class manages own"
  on public.homework_marks for all
  to authenticated
  using (public.class_taught_by_current_user(public.submission_homework_class_id(homework_marks.submission_id)))
  with check (public.class_taught_by_current_user(public.submission_homework_class_id(homework_marks.submission_id)));

-- Grade/feedback only ever become visible to the family once `released` is
-- true — the same "don't let a mark leak before it's published" pattern as
-- Phase A's draft/publish timetable runs.
create policy "homework_marks: parent reads own child's released"
  on public.homework_marks for select
  to authenticated
  using (
    homework_marks.released
    and public.child_belongs_to_parent(public.submission_child_id(homework_marks.submission_id))
  );

create policy "homework_marks: student reads own released"
  on public.homework_marks for select
  to authenticated
  using (
    homework_marks.released
    and public.child_belongs_to_student(public.submission_child_id(homework_marks.submission_id))
  );

create policy "homework_marks: staff with manage_academic manage all"
  on public.homework_marks for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create trigger audit_homework_marks
  after insert or update or delete on public.homework_marks
  for each row execute function public.audit_row_change();

-- ── storage: homework-submissions bucket ─────────────────────────────────
-- No storage bucket exists anywhere else in this repo (lesson recordings
-- are BBB-hosted, not Supabase Storage — see 0009's header note), so this
-- is the first. Private (not public), 20MB per file, a conservative
-- document/image allow-list — homework submissions, not general file
-- hosting. Path convention enforced by the RLS policies below (NOT by
-- application code, which could be bypassed by calling the storage API
-- directly): '<homework_id>/<child_id>/<filename>'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-submissions',
  'homework-submissions',
  false,
  20971520, -- 20MB
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;

create or replace function public.storage_path_homework_id(p_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(p_name, '/', 1), '')::uuid;
$$;

create or replace function public.storage_path_child_id(p_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(p_name, '/', 2), '')::uuid;
$$;

create policy "homework-submissions: student uploads/reads own folder"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'homework-submissions'
    and public.child_belongs_to_student(public.storage_path_child_id(name))
  )
  with check (
    bucket_id = 'homework-submissions'
    and public.child_belongs_to_student(public.storage_path_child_id(name))
    and public.homework_child_enrolled(public.storage_path_homework_id(name), public.storage_path_child_id(name))
  );

create policy "homework-submissions: parent reads own child's folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-submissions'
    and public.child_belongs_to_parent(public.storage_path_child_id(name))
  );

create policy "homework-submissions: teacher of class reads folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-submissions'
    and public.class_taught_by_current_user(public.homework_class_id(public.storage_path_homework_id(name)))
  );

create policy "homework-submissions: staff with manage_academic read all"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-submissions'
    and public.current_has_permission('manage_academic')
  );

-- ── homework_status: late/missing computed at read time, never stored ───
-- Data minimization (ground rule 5): "late"/"missing" are pure functions of
-- due_at vs submitted_at, so storing them as columns would just be a fact
-- that can drift out of sync with its own inputs. `security_invoker` (PG15+,
-- this project targets 15 — see supabase/config.toml) means the view runs
-- with the QUERYING user's own RLS, not the view owner's — it grants no
-- access the underlying tables don't already grant.
-- Built from `enrolments` (every child who owes the homework), not from
-- `homework_submissions` (only children who submitted something) — a
-- one-sided join from submissions would never surface a truly missing
-- (never-submitted) child at all.
create view public.homework_status
  with (security_invoker = true) as
  select
    h.id as homework_id,
    h.class_id,
    h.due_at,
    e.child_id,
    hs.id as submission_id,
    hs.submitted_at,
    case
      when hs.submitted_at is null and now() > h.due_at then 'missing'
      when hs.submitted_at is not null and hs.submitted_at > h.due_at then 'late'
      when hs.submitted_at is not null then 'on_time'
      else 'not_yet_due'
    end as status
  from public.homework h
  join public.enrolments e on e.class_id = h.class_id
  left join public.homework_submissions hs on hs.homework_id = h.id and hs.child_id = e.child_id;

grant select on public.homework_status to authenticated;
