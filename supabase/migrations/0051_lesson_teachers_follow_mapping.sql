-- Lesson instances follow the (class, subject) -> teacher mapping, so a
-- dated override re-assigns the teacher on the affected dates (cover)
-- without editing the weekly template (timetable_slots).
--
-- Precedence for who teaches a dated lesson:
--   1. a cover_assignments row for that slot and date (one-off cover)
--   2. teacher_for(class, subject, date) (default plus dated overrides)
--   3. the weekly slot's own teacher (legacy / unmapped)

alter table public.lesson_instances
  add column teacher_user_id uuid references public.profiles(id) on delete set null;
create index lesson_instances_teacher_idx on public.lesson_instances (teacher_user_id, date);

create or replace function public.lesson_effective_teacher(p_slot_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ca.covering_teacher_user_id from public.cover_assignments ca where ca.slot_id = p_slot_id and ca.cover_date = p_date),
    public.teacher_for(ts.class_id, ts.subject_id, p_date),
    ts.teacher_user_id
  )
  from public.timetable_slots ts
  where ts.id = p_slot_id;
$$;

grant execute on function public.lesson_effective_teacher(uuid, date) to authenticated;

create or replace function public.lesson_instances_set_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_user_id is null then
    new.teacher_user_id := public.lesson_effective_teacher(new.timetable_slot_id, new.date);
  end if;
  return new;
end;
$$;

create trigger lesson_instances_set_teacher
  before insert on public.lesson_instances
  for each row execute function public.lesson_instances_set_teacher();

-- Existing lessons
update public.lesson_instances li
set teacher_user_id = public.lesson_effective_teacher(li.timetable_slot_id, li.date)
where li.teacher_user_id is null;

-- Re-assign upcoming lessons whenever the mapping changes (today onwards;
-- past lessons keep whoever taught them).
create or replace function public.resync_lesson_teachers(p_class_id uuid, p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lesson_instances li
  set teacher_user_id = public.lesson_effective_teacher(li.timetable_slot_id, li.date)
  from public.timetable_slots ts
  where ts.id = li.timetable_slot_id
    and ts.class_id = p_class_id
    and ts.subject_id = p_subject_id
    and li.date >= current_date;
end;
$$;

create or replace function public.class_subject_teachers_resync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.resync_lesson_teachers(old.class_id, old.subject_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.resync_lesson_teachers(new.class_id, new.subject_id);
  end if;
  return coalesce(new, old);
end;
$$;

-- AFTER trigger: the changed row is already visible to teacher_for()
create trigger class_subject_teachers_resync
  after insert or update or delete on public.class_subject_teachers
  for each row execute function public.class_subject_teachers_resync();

-- A teacher can read the lessons they are teaching, even for a class they
-- have no class-scoped role on (the usual case now).
create policy "lesson_instances: teacher of the lesson reads own"
  on public.lesson_instances for select
  to authenticated
  using (teacher_user_id = auth.uid());

-- "Teaches this class" now also means "is the mapped teacher for any of its subjects".
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
  ) or exists (
    select 1 from public.class_subject_teachers cst
    where cst.class_id = p_class_id and cst.teacher_id = auth.uid()
      and (cst.valid_to is null or cst.valid_to >= current_date)
  );
$$;

grant execute on function public.class_taught_by_current_user(uuid) to authenticated;

-- Display helper: "Mr X (Arabic), Ms Y (Maths)" for who teaches a class on a date.
create or replace function public.class_teacher_names(p_class_id uuid, p_on date default current_date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(p.full_name || ' (' || s.name || ')', ', ' order by s.name)
  from (
    select c.subject_id from public.classes c where c.id = p_class_id and c.subject_id is not null
    union
    select cst.subject_id from public.class_subject_teachers cst where cst.class_id = p_class_id
  ) subj
  join public.subjects s on s.id = subj.subject_id
  join public.profiles p on p.id = public.teacher_for(p_class_id, subj.subject_id, p_on);
$$;

grant execute on function public.class_teacher_names(uuid, date) to authenticated;
