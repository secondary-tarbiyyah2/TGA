-- GCSE progress history (extends 0072 gcse_grades).
--
-- gcse_grade_history keeps one row every time a pupil's target / predicted /
-- actual grade changes (kind 'snapshot', written by a trigger so nobody has
-- to remember to) plus mock exam results a teacher enters (kind 'mock', with
-- the raw mark and the paper total). The app draws the trend and the grade
-- history drawer from it. Rows are never edited; only head/admin (and the
-- class teacher, for mock rows) can remove one.
--
-- Visibility mirrors gcse_grades: the class's teacher, head/admin and
-- academic staff, the child's parent and the child themself.
-- audit_row_change() needs NEW.id, so the table has a surrogate id.
-- Idempotent: safe to run more than once.

create table if not exists public.gcse_grade_history (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid references public.gcse_grades(id) on delete set null,
  child_id uuid not null references public.children(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  kind text not null default 'snapshot' check (kind in ('snapshot', 'mock')),
  label text check (label is null or char_length(label) <= 80),
  target_grade smallint check (target_grade is null or (target_grade >= 1 and target_grade <= 9)),
  predicted_grade smallint check (predicted_grade is null or (predicted_grade >= 1 and predicted_grade <= 9)),
  actual_grade smallint check (actual_grade is null or (actual_grade >= 1 and actual_grade <= 9)),
  mark numeric(6, 1) check (mark is null or mark >= 0),
  out_of numeric(6, 1) check (out_of is null or out_of > 0),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint gcse_grade_history_mark_within_total check (mark is null or out_of is null or mark <= out_of)
);

create index if not exists gcse_grade_history_child_idx on public.gcse_grade_history (child_id, subject_id, recorded_at);
create index if not exists gcse_grade_history_class_idx on public.gcse_grade_history (class_id, recorded_at);

alter table public.gcse_grade_history enable row level security;

drop policy if exists "gcse_grade_history: teacher of class reads" on public.gcse_grade_history;
create policy "gcse_grade_history: teacher of class reads"
  on public.gcse_grade_history for select
  to authenticated
  using (gcse_grade_history.class_id is not null and public.class_taught_by_current_user(gcse_grade_history.class_id));

-- A teacher may add mock exam results for pupils in their own class (never a
-- forged 'snapshot': those come from the trigger below).
drop policy if exists "gcse_grade_history: teacher of class adds mock" on public.gcse_grade_history;
create policy "gcse_grade_history: teacher of class adds mock"
  on public.gcse_grade_history for insert
  to authenticated
  with check (
    gcse_grade_history.kind = 'mock'
    and gcse_grade_history.class_id is not null
    and public.class_taught_by_current_user(gcse_grade_history.class_id)
    and public.child_enrolled_in_class(gcse_grade_history.child_id, gcse_grade_history.class_id)
  );

drop policy if exists "gcse_grade_history: teacher of class removes mock" on public.gcse_grade_history;
create policy "gcse_grade_history: teacher of class removes mock"
  on public.gcse_grade_history for delete
  to authenticated
  using (
    gcse_grade_history.kind = 'mock'
    and gcse_grade_history.class_id is not null
    and public.class_taught_by_current_user(gcse_grade_history.class_id)
  );

drop policy if exists "gcse_grade_history: head/admin and academic staff manage all" on public.gcse_grade_history;
create policy "gcse_grade_history: head/admin and academic staff manage all"
  on public.gcse_grade_history for all
  to authenticated
  using (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.current_has_permission('manage_academic')
    or public.current_has_permission('assessment_lead')
  )
  with check (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.current_has_permission('manage_academic')
    or public.current_has_permission('assessment_lead')
  );

drop policy if exists "gcse_grade_history: parent reads own child's" on public.gcse_grade_history;
create policy "gcse_grade_history: parent reads own child's"
  on public.gcse_grade_history for select
  to authenticated
  using (public.child_belongs_to_parent(gcse_grade_history.child_id));

drop policy if exists "gcse_grade_history: student reads own" on public.gcse_grade_history;
create policy "gcse_grade_history: student reads own"
  on public.gcse_grade_history for select
  to authenticated
  using (public.child_belongs_to_student(gcse_grade_history.child_id));

drop trigger if exists audit_gcse_grade_history on public.gcse_grade_history;
create trigger audit_gcse_grade_history
  after insert or update or delete on public.gcse_grade_history
  for each row execute function public.audit_row_change();

-- Every change to a pupil's target / predicted / actual grade leaves a
-- snapshot behind. SECURITY DEFINER so the teacher's own write to
-- gcse_grades is enough (teachers cannot insert 'snapshot' rows directly).
create or replace function public.gcse_grades_log_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.target_grade is not distinct from old.target_grade
     and new.predicted_grade is not distinct from old.predicted_grade
     and new.actual_grade is not distinct from old.actual_grade then
    return new;
  end if;
  insert into public.gcse_grade_history (grade_id, child_id, subject_id, class_id, kind, target_grade, predicted_grade, actual_grade, recorded_by)
  values (new.id, new.child_id, new.subject_id, new.class_id, 'snapshot', new.target_grade, new.predicted_grade, new.actual_grade, coalesce(auth.uid(), new.entered_by));
  return new;
end;
$$;

revoke all on function public.gcse_grades_log_history() from public, anon, authenticated;

drop trigger if exists gcse_grades_history on public.gcse_grades;
create trigger gcse_grades_history
  after insert or update on public.gcse_grades
  for each row execute function public.gcse_grades_log_history();

-- Seed one starting snapshot for grades that existed before this migration.
insert into public.gcse_grade_history (grade_id, child_id, subject_id, class_id, kind, target_grade, predicted_grade, actual_grade, recorded_by, recorded_at)
select g.id, g.child_id, g.subject_id, g.class_id, 'snapshot', g.target_grade, g.predicted_grade, g.actual_grade, g.entered_by, g.updated_at
  from public.gcse_grades g
 where not exists (select 1 from public.gcse_grade_history h where h.grade_id = g.id);
