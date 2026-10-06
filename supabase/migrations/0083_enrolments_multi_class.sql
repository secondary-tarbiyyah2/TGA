-- 0083: a student can be enrolled in MORE THAN ONE class (typically one per
-- subject).
--
-- The enrolments table (0008) already models this: it is a join table with
-- unique (class_id, child_id) and NO uniqueness on child_id alone, and every
-- read policy (parent, student, class teacher, staff) is per row, so a child
-- with several enrolments is simply several rows. What was missing:
--   * an index for the "classes of this child" lookup the portal now does for
--     every student profile;
--   * one atomic way for the admin UI to set ALL of a child's classes at once
--     (multi-select), so a half-saved list can never be left behind:
--     public.set_child_classes(child, classes[]).
-- The function is SECURITY DEFINER but checks the caller itself: Headteacher,
-- Admin or the manage_academic permission, the same people the existing
-- enrolments write policies (0008, 0034) allow. Teachers keep their own
-- per-class add/remove through those policies.
-- Safe to re-run.

create index if not exists enrolments_child_idx on public.enrolments (child_id);

create or replace function public.set_child_classes(p_child_id uuid, p_class_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.current_has_permission('manage_academic')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (select 1 from public.children where id = p_child_id) then
    raise exception 'child not found' using errcode = 'P0002';
  end if;

  delete from public.enrolments e
   where e.child_id = p_child_id
     and not (e.class_id = any(coalesce(p_class_ids, '{}'::uuid[])));

  insert into public.enrolments (class_id, child_id)
  select c.id, p_child_id
    from public.classes c
   where c.id = any(coalesce(p_class_ids, '{}'::uuid[]))
  on conflict (class_id, child_id) do nothing;
end;
$$;

revoke all on function public.set_child_classes(uuid, uuid[]) from public, anon;
grant execute on function public.set_child_classes(uuid, uuid[]) to authenticated;
