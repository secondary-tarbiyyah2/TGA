-- 0034: headteacher/admin register + staff-managed class enrolment.
--
-- attendance_records: 0009 already has "head_teacher/admin manage all" (for all,
-- using + with check on current_has_role), so Headteacher/Admin can already
-- insert/update any lesson's register; nothing to add. We only tighten that
-- marked_by, when supplied, must be the caller (the UI always sends auth.uid()).
drop policy if exists "attendance_records: head_teacher/admin manage all" on public.attendance_records;
create policy "attendance_records: head_teacher/admin manage all"
  on public.attendance_records for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (
    public.current_has_role(array['head_teacher', 'admin'])
    and (marked_by is null or marked_by = auth.uid())
  );

-- enrolments: manage_academic already has for-all (0008). Add explicit
-- head_teacher/admin and own-class teacher insert/delete.
drop policy if exists "enrolments: head_teacher/admin manage all" on public.enrolments;
create policy "enrolments: head_teacher/admin manage all"
  on public.enrolments for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "enrolments: teacher inserts own class's" on public.enrolments;
create policy "enrolments: teacher inserts own class's"
  on public.enrolments for insert
  to authenticated
  with check (public.class_taught_by_current_user(enrolments.class_id));

drop policy if exists "enrolments: teacher deletes own class's" on public.enrolments;
create policy "enrolments: teacher deletes own class's"
  on public.enrolments for delete
  to authenticated
  using (public.class_taught_by_current_user(enrolments.class_id));

-- Children not yet in a class are not readable by a class teacher (RLS only
-- exposes enrolled children), so the "add participants" picker goes through
-- this narrow definer function: id, name, year group only.
create or replace function public.class_enrolment_candidates(p_class_id uuid)
returns table (id uuid, name text, year_group_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.name, c.year_group_id
  from public.children c
  where (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(p_class_id)
    )
    and not exists (select 1 from public.enrolments e where e.class_id = p_class_id and e.child_id = c.id)
  order by c.name;
$$;
grant execute on function public.class_enrolment_candidates(uuid) to authenticated;

-- Teachers of a class (names) for the Participants list.
create or replace function public.class_teacher_names(p_class_id uuid)
returns table (user_id uuid, full_name text, role text)
language sql
security definer
stable
set search_path = public
as $$
  select ur.user_id, p.full_name, ur.role::text
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.scope_type = 'class' and ur.scope_id = p_class_id
    and ur.role in ('teacher', 'teaching_assistant_cover')
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(p_class_id)
    )
  order by p.full_name;
$$;
grant execute on function public.class_teacher_names(uuid) to authenticated;
