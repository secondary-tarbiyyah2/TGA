-- Teacher per (class, subject) instead of one fixed teacher per class.
--
-- The same staff teach many classes, one subject each, so the timetable
-- needs "who teaches Maths to this class" not "who is this class's
-- teacher". Rows may carry a date range: a dated row OVERRIDES the open
-- ended default while it is valid (cover for a leave, a mid-term handover).
-- The most specific valid row wins; see teacher_for() below. The TypeScript
-- mirror is src/lib/learn/teacherFor.ts: keep the two in step.
--
-- Old structures keep working: user_roles rows (role teacher, scope_type
-- class) are untouched, backfilled into this table, and used as the last
-- fallback by teacher_for().

create table public.class_subject_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  valid_from date,
  valid_to date,
  lessons_per_week int check (lessons_per_week is null or lessons_per_week > 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_subject_teachers_dates_ordered check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

-- Exactly one open-ended default per (class, subject).
create unique index class_subject_teachers_one_default
  on public.class_subject_teachers (class_id, subject_id)
  where valid_from is null and valid_to is null;
create index class_subject_teachers_class_idx on public.class_subject_teachers (class_id, subject_id);
create index class_subject_teachers_teacher_idx on public.class_subject_teachers (teacher_id);

alter table public.class_subject_teachers enable row level security;

create policy "class_subject_teachers: staff read"
  on public.class_subject_teachers for select
  to authenticated
  using (
    public.current_has_permission('manage_academic')
    or public.current_has_permission('timetabler')
    or public.current_has_role(array['head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover'])
  );

create policy "class_subject_teachers: manage_academic write"
  on public.class_subject_teachers for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create policy "class_subject_teachers: head_teacher/admin write"
  on public.class_subject_teachers for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.class_subject_teachers_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger class_subject_teachers_touch_updated_at
  before update on public.class_subject_teachers
  for each row execute function public.class_subject_teachers_touch();

create trigger audit_class_subject_teachers
  after insert or update or delete on public.class_subject_teachers
  for each row execute function public.audit_row_change();

-- ── teacher_for(class, subject, date) ────────────────────────────────────
-- Specificity: both dates set (a bounded override) beats one date set,
-- which beats the open-ended default. Ties: the later valid_from, then the
-- newest row. No row at all: the legacy class-scoped teacher role, so
-- classes set up before this migration still resolve.
create or replace function public.teacher_for(p_class_id uuid, p_subject_id uuid, p_on date default current_date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select cst.teacher_id
      from public.class_subject_teachers cst
      where cst.class_id = p_class_id
        and cst.subject_id = p_subject_id
        and (cst.valid_from is null or cst.valid_from <= p_on)
        and (cst.valid_to is null or cst.valid_to >= p_on)
      order by
        case when cst.valid_from is not null and cst.valid_to is not null then 0
             when cst.valid_from is not null or cst.valid_to is not null then 1
             else 2 end,
        cst.valid_from desc nulls last,
        cst.created_at desc
      limit 1
    ),
    (
      select ur.user_id
      from public.user_roles ur
      where ur.role = 'teacher' and ur.scope_type = 'class' and ur.scope_id = p_class_id
        and exists (select 1 from public.classes c where c.id = p_class_id and c.subject_id = p_subject_id)
      order by ur.id
      limit 1
    )
  );
$$;

grant execute on function public.teacher_for(uuid, uuid, date) to authenticated;

-- ── backfill ─────────────────────────────────────────────────────────────
-- 1. every class's own subject, from the class-scoped teacher role
insert into public.class_subject_teachers (class_id, subject_id, teacher_id, notes)
select distinct on (c.id) c.id, c.subject_id, ur.user_id, 'Backfilled from the class teacher'
from public.classes c
join public.user_roles ur
  on ur.scope_id = c.id and ur.scope_type = 'class' and ur.role in ('teacher', 'teaching_assistant_cover')
where c.subject_id is not null
order by c.id, (ur.role = 'teacher') desc, ur.id
on conflict do nothing;

-- 2. any other (class, subject) already placed in a timetable run: the
-- teacher who has most of those slots
insert into public.class_subject_teachers (class_id, subject_id, teacher_id, notes)
select distinct on (x.class_id, x.subject_id) x.class_id, x.subject_id, x.teacher_user_id, 'Backfilled from existing timetable slots'
from (
  select ts.class_id, ts.subject_id, ts.teacher_user_id, count(*) as n
  from public.timetable_slots ts
  group by ts.class_id, ts.subject_id, ts.teacher_user_id
) x
order by x.class_id, x.subject_id, x.n desc
on conflict do nothing;
