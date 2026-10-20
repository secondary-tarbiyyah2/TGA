-- One answer to "which classes does this teacher teach?"
--
-- Before: three places disagreed.
--   * Today / the dashboard read the published timetable (timetable_slots.teacher_user_id);
--   * My classes, homework, assessment and report pickers read class-scoped user_roles only;
--   * permissions (class_taught_by_current_user) read user_roles OR class_subject_teachers.
-- So a teacher the timetable gave a lesson to (the solver picks any free
-- teacher when a subject has no fixed one) saw it on Today, but My classes
-- said "You haven't been assigned to any classes yet" and they couldn't open
-- the class to take the register.
--
-- Now teacher_class_ids(user) is the single source, used by permissions and
-- by the portal's pickers (my_teaching_classes()):
--   class-scoped teacher/cover role, OR current class_subject_teachers row,
--   OR a slot in a published timetable.
-- Nothing is copied or granted behind anyone's back: the published timetable
-- is itself the head's decision about who teaches what.

create or replace function public.teacher_class_ids(p_user uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select ur.scope_id from public.user_roles ur
   where ur.user_id = p_user and ur.role in ('teacher', 'teaching_assistant_cover')
     and ur.scope_type = 'class' and ur.scope_id is not null
  union
  select cst.class_id from public.class_subject_teachers cst
   where cst.teacher_id = p_user and (cst.valid_to is null or cst.valid_to >= current_date)
  union
  select ts.class_id from public.timetable_slots ts
   join public.timetable_runs tr on tr.id = ts.run_id and tr.status = 'published'
   where ts.teacher_user_id = p_user and ts.class_id is not null;
$$;

revoke all on function public.teacher_class_ids(uuid) from public, anon;
grant execute on function public.teacher_class_ids(uuid) to authenticated;

create or replace function public.class_taught_by_current_user(p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.teacher_class_ids(auth.uid()) c where c = p_class_id);
$$;

grant execute on function public.class_taught_by_current_user(uuid) to authenticated;

create or replace function public.child_taught_by(p_child_id uuid, p_teacher_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.enrolments e
    where e.child_id = p_child_id
      and e.class_id in (select public.teacher_class_ids(p_teacher_id))
  );
$$;

grant execute on function public.child_taught_by(uuid, uuid) to authenticated;

-- The signed-in teacher's classes, for My classes and every class picker.
create or replace function public.my_teaching_classes()
returns table (id uuid, name text, subject_id uuid, subject_name text, year_group text, year_group_name text, pupils integer)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.name, c.subject_id, coalesce(s.name, c.subject), c.year_group, yg.name,
         (select count(*)::int from public.enrolments e where e.class_id = c.id)
  from public.classes c
  left join public.subjects s on s.id = c.subject_id
  left join public.year_groups yg on yg.id = c.year_group_id
  where c.id in (select public.teacher_class_ids(auth.uid()))
  order by c.name;
$$;

revoke all on function public.my_teaching_classes() from public, anon;
grant execute on function public.my_teaching_classes() to authenticated;

-- ── Assessments: say why there is no score ──────────────────────────────
-- 'marked' (has a score), 'absent', 'exempt', 'not_submitted'. A blank cell
-- in the gradebook means "not marked yet" (no row). A real 0 is a score.
alter table public.assessments
  add column if not exists status text not null default 'marked';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assessments_status_check') then
    alter table public.assessments add constraint assessments_status_check
      check (status in ('marked', 'absent', 'exempt', 'not_submitted'));
  end if;
end $$;

create index if not exists assessments_column_idx
  on public.assessments (class_id, title, date);

create or replace view public.assessments_for_family
  with (security_barrier = true) as
  select
    id, class_id, child_id, assessment_type_id, mark_scheme_id, title, date,
    raw_score, max_score, percent, grade_label, entered_by, created_at, updated_at, status
  from public.assessments a
  where public.child_belongs_to_parent(a.child_id) or public.child_belongs_to_student(a.child_id);

grant select on public.assessments_for_family to authenticated;

-- ── Messaging: tell people with the same name apart ─────────────────────
-- Several staff can share a first name ("Ahmad"). For staff looking at staff,
-- `detail` now carries what they teach (or their email when they teach no
-- class), so the right person is picked.
create or replace function public.message_directory()
returns table (user_id uuid, full_name text, roles text[], detail text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_office boolean;
  v_staff boolean;
begin
  if v_me is null then return; end if;
  v_staff := public.is_staff_member(v_me);
  if not v_staff and not exists (select 1 from public.user_roles where user_roles.user_id = v_me and user_roles.role = 'parent') then
    return;
  end if;
  v_office := exists (select 1 from public.user_roles where user_roles.user_id = v_me and user_roles.role in ('head_teacher', 'admin', 'admissions'));

  return query
  select ur.user_id,
         coalesce(nullif(p.full_name, ''), 'Unnamed')::text,
         array_agg(distinct ur.role::text order by ur.role::text),
         (case
            when v_staff and bool_or(ur.role = 'parent') then
              (select string_agg(c.name, ', ' order by c.name)
                 from public.children c
                where c.parent_user_id = ur.user_id
                  and (v_office or public.staff_teaches_child_of(v_me, c.id)))
            when bool_or(ur.role in ('teacher', 'teaching_assistant_cover')) then
              coalesce(
                (select string_agg(x.name, ', ' order by x.name)
                   from (select cl.name from public.classes cl
                          where cl.id in (select public.teacher_class_ids(ur.user_id))
                            -- parents only see the classes their own children are in
                            and (v_staff or exists (
                                  select 1 from public.enrolments e join public.children ch on ch.id = e.child_id
                                   where e.class_id = cl.id and ch.parent_user_id = v_me))
                          order by cl.name limit 3) x),
                case when v_staff then (select au.email from auth.users au where au.id = ur.user_id) end)
            when v_staff then
              (select au.email from auth.users au where au.id = ur.user_id)
            else null
          end)::text
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id <> v_me
    and ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'parent')
    and public.can_message_user(ur.user_id)
  group by ur.user_id, p.full_name
  order by 2;
end;
$$;

revoke all on function public.message_directory() from public, anon;
grant execute on function public.message_directory() to authenticated;

-- Teachers can open every class they teach by the rule above (the old policy
-- only looked at class-scoped roles).
drop policy if exists "classes: teacher reads classes they teach" on public.classes;
create policy "classes: teacher reads classes they teach"
  on public.classes for select
  to authenticated
  using (public.class_taught_by_current_user(classes.id));
