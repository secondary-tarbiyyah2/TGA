-- Phase C: assessment, grades, and Qur'an/Islamic Studies progress for
-- /learn. Same conventions as 0010 (see its header) — RLS default deny,
-- helper functions for cross-table checks, audit_log via the shared
-- trigger, real `id` columns.

-- ── assessment_types (configurable list — "Class test", "End of term
-- exam", "Piece of work", ... — admin/Assessment-lead editable, never a
-- fixed code enum, per the ground rule that this must be data not code) ──
create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.assessment_types enable row level security;

create policy "assessment_types: authenticated read"
  on public.assessment_types for select
  to authenticated
  using (true);

create policy "assessment_types: staff with manage_academic/assessment_lead write"
  on public.assessment_types for all
  to authenticated
  using (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'))
  with check (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'));

insert into public.assessment_types (name) values
  ('Class test'), ('End of term exam'), ('Piece of work'), ('Homework assessment'), ('Mock exam');

-- ── mark_schemes: per-subject percentage-band → grade-label boundaries ──
-- One row per (subject, band): e.g. subject=Maths, min_percent=90,
-- label='A*'. This is the "grade boundary" ground-rule example called out
-- explicitly — a fact, kept in the DB/admin UI, never a magic number in a
-- component. `scale_name` lets a subject use more than one scheme over
-- time (e.g. a GCSE 9-1 scale vs an internal A*-U scale) without deleting
-- history; `assessments.mark_scheme_id` below pins each assessment to the
-- exact scheme version that graded it.
create table public.mark_schemes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  scale_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subject_id, scale_name)
);

alter table public.mark_schemes enable row level security;

create policy "mark_schemes: authenticated read"
  on public.mark_schemes for select
  to authenticated
  using (true);

create policy "mark_schemes: staff with manage_academic/assessment_lead write"
  on public.mark_schemes for all
  to authenticated
  using (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'))
  with check (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'));

create table public.grade_boundaries (
  id uuid primary key default gen_random_uuid(),
  mark_scheme_id uuid not null references public.mark_schemes(id) on delete cascade,
  label text not null, -- e.g. 'A*', '9', 'Excellent'
  min_percent numeric(5, 2) not null check (min_percent >= 0 and min_percent <= 100),
  created_at timestamptz not null default now(),
  unique (mark_scheme_id, label)
);

alter table public.grade_boundaries enable row level security;

create policy "grade_boundaries: authenticated read"
  on public.grade_boundaries for select
  to authenticated
  using (true);

create policy "grade_boundaries: staff with manage_academic/assessment_lead write"
  on public.grade_boundaries for all
  to authenticated
  using (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'))
  with check (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'));

-- Looks up the grade label for a percentage against a scheme: the single
-- place this "band lookup" logic lives, so no UI component ever hardcodes
-- a boundary number. Returns the highest-boundary label the percentage
-- meets or exceeds.
create or replace function public.grade_for_percent(p_mark_scheme_id uuid, p_percent numeric)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select label
  from public.grade_boundaries
  where mark_scheme_id = p_mark_scheme_id and min_percent <= p_percent
  order by min_percent desc
  limit 1;
$$;

grant execute on function public.grade_for_percent(uuid, numeric) to authenticated;

-- ── assessments (one record per student per assessment event) ───────────
-- Deliberately one row per (class-assessment-event, child) rather than a
-- separate "assessment event" table + per-child "result" table split — the
-- moderation note and mark are both scoped per-child in practice (a
-- teacher moderates an individual student's borderline mark, not the whole
-- test), and this keeps the RLS model to one table instead of two more
-- helper joins. `title`/`assessment_type_id`/`date` are repeated per child
-- row for the same sitting; that's an acceptable, small denormalisation
-- for a school this size and keeps the RLS/query model simple — noted here
-- rather than silently done.
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  assessment_type_id uuid not null references public.assessment_types(id),
  mark_scheme_id uuid references public.mark_schemes(id),
  title text not null,
  date date not null,
  raw_score numeric(6, 2),
  max_score numeric(6, 2),
  percent numeric(5, 2) generated always as (
    case when max_score is not null and max_score > 0 then round((raw_score / max_score) * 100, 2) else null end
  ) stored,
  grade_label text, -- resolved via grade_for_percent() at write time (Edge-Function-free: the teacher's own client calls the RPC and stores the result, since it's just display data, not an access-control decision)
  moderation_notes text, -- staff-only, never shown to parent/student — see policies below
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assessments enable row level security;

create index assessments_child_idx on public.assessments (child_id, date desc);
create index assessments_class_idx on public.assessments (class_id, date desc);

create policy "assessments: teacher of class manages own"
  on public.assessments for all
  to authenticated
  using (public.class_taught_by_current_user(assessments.class_id))
  with check (public.class_taught_by_current_user(assessments.class_id));

create policy "assessments: staff with manage_academic/assessment_lead manage all"
  on public.assessments for all
  to authenticated
  using (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'))
  with check (public.current_has_permission('manage_academic') or public.current_has_permission('assessment_lead'));

-- Deliberately NO parent/student SELECT policy on this base table — see
-- the `assessments_for_family` view below for why, and how family access
-- is granted instead (moderation_notes must never reach a parent/student).

create trigger audit_assessments
  after insert or update or delete on public.assessments
  for each row execute function public.audit_row_change();

-- moderation_notes must NEVER reach a parent/student, even though the rest
-- of the row is theirs to read. Postgres RLS is row-level, not column-
-- level, so it alone can't hide one column from an otherwise-visible row —
-- confirmed against this table specifically: a `security_invoker` view
-- (PG15+) still evaluates the base table's OWN row policies for the
-- querying user, so a parent with no base-table SELECT policy gets nothing
-- back through such a view either, while a parent WITH a base-table
-- SELECT policy could just query `assessments` directly and get
-- moderation_notes anyway — a security_invoker view grants no column
-- restriction a base-table policy doesn't already cover.
-- The fix used here instead (same technique 0001's `bookable_staff` view
-- already uses in this schema): the base table deliberately has NO
-- parent/student SELECT policy at all (staff/teacher only, so direct reads
-- of `assessments` are impossible for a parent/student). Family access
-- goes ONLY through this view, which is NOT security_invoker (so it runs
-- with the view owner's privileges against the base table, bypassing the
-- base table's own RLS) but bakes the exact same row-scoping condition
-- directly into its WHERE clause and simply never selects
-- moderation_notes — so both the row scope AND the column omission are
-- enforced by the view definition itself, not by trusting the client to
-- query the "right" table.
create view public.assessments_for_family
  with (security_barrier = true) as
  select
    id, class_id, child_id, assessment_type_id, mark_scheme_id, title, date,
    raw_score, max_score, percent, grade_label, entered_by, created_at, updated_at
  from public.assessments a
  where public.child_belongs_to_parent(a.child_id) or public.child_belongs_to_student(a.child_id);

grant select on public.assessments_for_family to authenticated;

-- ── quran_progress: memorisation/progress tracking, gated to
-- Assessment lead ──────────────────────────────────────────────────────
-- Deliberately NOT forced into the percentage/grade-boundary shape above —
-- Qur'an memorisation progress is naturally staged (which surah, how much
-- of it, to what standard of accuracy/fluency) rather than a single mark
-- out of 100, and Islamic Studies progress is often better expressed as a
-- milestone + qualitative note than a numeric score. This table models
-- both:
--   * `milestone_type` distinguishes a Qur'an memorisation entry (tied to
--     a specific surah/juz range) from a general Islamic Studies progress
--     note (no surah/juz, just topic + note).
--   * `surah_from`/`surah_to` (1-114) and `juz` (1-30) are nullable and
--     only meaningful for memorisation entries — a check constraint
--     enforces that shape.
--   * `standard` is a small qualitative scale (introduced / consolidating
--     / secure / fluent) rather than a percentage — recall/tajweed quality
--     isn't well captured by "73%".
--   * `note` carries the free-text detail (e.g. "correct makhraj on ه, ح;
--     revisit idgham rules").
-- Write access is gated to Assessment lead specifically (per the ground
-- rule), not just "any teacher of the class" — a school may want this
-- tracked consistently by a subject specialist rather than every cover
-- teacher. Assessment lead is an add-on permission (0007), so this checks
-- current_has_permission('assessment_lead') exactly as that migration's
-- helper is designed to be used.
create table public.quran_progress (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  milestone_type text not null check (milestone_type in ('quran_memorisation', 'islamic_studies')),
  surah_from smallint check (surah_from between 1 and 114),
  surah_to smallint check (surah_to between 1 and 114),
  juz smallint check (juz between 1 and 30),
  topic text, -- Islamic Studies entries: topic/unit name
  standard text check (standard in ('introduced', 'consolidating', 'secure', 'fluent')),
  note text,
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz not null default now(),
  constraint quran_progress_shape check (
    (milestone_type = 'quran_memorisation' and topic is null)
    or (milestone_type = 'islamic_studies' and surah_from is null and surah_to is null and juz is null)
  )
);

alter table public.quran_progress enable row level security;

create index quran_progress_child_idx on public.quran_progress (child_id, recorded_at desc);

create policy "quran_progress: assessment lead manages all"
  on public.quran_progress for all
  to authenticated
  using (public.current_has_permission('assessment_lead'))
  with check (public.current_has_permission('assessment_lead'));

create policy "quran_progress: staff with manage_academic read all"
  on public.quran_progress for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

create policy "quran_progress: teacher of class reads own class's"
  on public.quran_progress for select
  to authenticated
  using (quran_progress.class_id is not null and public.class_taught_by_current_user(quran_progress.class_id));

create policy "quran_progress: parent reads own child's"
  on public.quran_progress for select
  to authenticated
  using (public.child_belongs_to_parent(quran_progress.child_id));

create policy "quran_progress: student reads own"
  on public.quran_progress for select
  to authenticated
  using (public.child_belongs_to_student(quran_progress.child_id));

create trigger audit_quran_progress
  after insert or update or delete on public.quran_progress
  for each row execute function public.audit_row_change();
