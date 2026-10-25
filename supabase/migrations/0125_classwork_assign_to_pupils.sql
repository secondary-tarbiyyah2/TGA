-- Classwork in the class page (Google Classroom style): an assignment can be
-- set for the whole class or for chosen pupils, and can be a quiz.
--
--   homework.assigned_child_ids  null = every pupil in the class (as before);
--                                otherwise only these pupils owe it, see it
--                                and can hand it in.
--   homework.kind                'assignment' (default) or 'quiz': a quiz is
--                                an assignment with marks, shown as "Quiz" in
--                                Classwork.
--
-- homework_status (late/missing, one row per pupil who owes the work) and
-- the family/student read policies respect the chosen pupils, so To do,
-- Late and missing, the review queue and the digest all follow. Staff
-- policies are unchanged. Idempotent.

alter table public.homework
  add column if not exists assigned_child_ids uuid[],
  add column if not exists kind text not null default 'assignment';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'homework_kind_check') then
    alter table public.homework add constraint homework_kind_check check (kind in ('assignment', 'quiz'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'homework_assigned_not_empty') then
    alter table public.homework add constraint homework_assigned_not_empty check (assigned_child_ids is null or cardinality(assigned_child_ids) > 0);
  end if;
end $$;

-- Families and pupils see an assignment only if it is for the whole class or
-- for one of their children (class_post_for_my_family from 0079 does both
-- the parent and the student check, SECURITY DEFINER so it never recurses).
drop policy if exists "homework: parent reads own child's class" on public.homework;
create policy "homework: parent reads own child's class"
  on public.homework for select
  to authenticated
  using (
    homework.archived_at is null
    and public.class_has_parents_child(homework.class_id)
    and public.class_post_for_my_family(homework.class_id, homework.assigned_child_ids)
  );

drop policy if exists "homework: student reads own class" on public.homework;
create policy "homework: student reads own class"
  on public.homework for select
  to authenticated
  using (
    homework.archived_at is null
    and public.class_has_students_own_enrolment(homework.class_id)
    and public.class_post_for_my_family(homework.class_id, homework.assigned_child_ids)
  );

-- Same columns, same order (so dependants keep working); only pupils who
-- owe the work get a row.
create or replace view public.homework_status
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
  left join public.homework_submissions hs on hs.homework_id = h.id and hs.child_id = e.child_id
  where h.assigned_child_ids is null or e.child_id = any (h.assigned_child_ids);

grant select on public.homework_status to authenticated;

create index if not exists homework_assigned_idx on public.homework using gin (assigned_child_ids);
