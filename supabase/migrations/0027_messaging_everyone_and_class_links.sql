-- Messaging for everyone (except students) + a meeting link per class.
--
-- 1. message_threads gets a third shape, 'direct': any two adult portal
--    users (staff or parent), at least one of whom is staff. That covers
--    staff<->staff, teacher<->any parent and parent<->any staff member
--    (not just the teacher of their own child). Parent<->parent is
--    deliberately not possible (parents never see each other's details),
--    and students still cannot be in any 1:1 thread: the CHECK constraint
--    has no shape a student could fit, exactly as in 0013.
-- 2. message_directory(): who the signed-in user is allowed to start a
--    conversation with. SECURITY DEFINER so parents can see staff names
--    without widening `profiles` RLS.
-- 3. classes.meeting_url: a recurring (e.g. Microsoft Teams) link used to
--    join that class's lessons when BigBlueButton isn't configured.

alter table public.message_threads drop constraint if exists message_threads_kind_check;
alter table public.message_threads
  add constraint message_threads_kind_check check (kind in ('parent_teacher', 'staff', 'direct'));

alter table public.message_threads drop constraint if exists message_threads_shape;
alter table public.message_threads
  add constraint message_threads_shape check (
    (kind = 'parent_teacher' and child_id is not null and parent_id is not null and teacher_id is not null
      and staff_a_id is null and staff_b_id is null)
    or
    (kind in ('staff', 'direct') and staff_a_id is not null and staff_b_id is not null and staff_a_id <> staff_b_id
      and child_id is null and parent_id is null and teacher_id is null)
  );

create unique index if not exists message_threads_direct_uniq
  on public.message_threads (least(staff_a_id, staff_b_id), greatest(staff_a_id, staff_b_id))
  where kind = 'direct';

create or replace function public.is_adult_member(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'parent')
  );
$$;

grant execute on function public.is_adult_member(uuid) to authenticated;

create policy "message_threads: direct participants read"
  on public.message_threads for select
  to authenticated
  using (kind = 'direct' and (staff_a_id = auth.uid() or staff_b_id = auth.uid()));

create policy "message_threads: start a direct thread"
  on public.message_threads for insert
  to authenticated
  with check (
    kind = 'direct'
    and (staff_a_id = auth.uid() or staff_b_id = auth.uid())
    and public.is_adult_member(staff_a_id)
    and public.is_adult_member(staff_b_id)
    and (public.is_staff_member(staff_a_id) or public.is_staff_member(staff_b_id))
  );

-- Who can I message? Staff see all staff and all parents; parents see staff.
create or replace function public.message_directory()
returns table (user_id uuid, full_name text, roles text[], detail text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_staff boolean;
  v_parent boolean;
begin
  if v_me is null then
    return;
  end if;
  v_staff := public.is_staff_member(v_me);
  v_parent := exists (select 1 from public.user_roles where user_roles.user_id = v_me and user_roles.role = 'parent');
  if not v_staff and not v_parent then
    return; -- students get no directory: no 1:1 messaging for them
  end if;

  return query
  select ur.user_id,
         coalesce(nullif(p.full_name, ''), 'Unnamed') as full_name,
         array_agg(distinct ur.role) as roles,
         case
           when bool_or(ur.role = 'parent') then
             (select string_agg(c.name, ', ' order by c.name) from public.children c where c.parent_user_id = ur.user_id)
           else null
         end as detail
  from public.user_roles ur
  left join public.profiles p on p.id = ur.user_id
  where ur.user_id <> v_me
    and (
      ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover')
      or (v_staff and ur.role = 'parent')
    )
  group by ur.user_id, p.full_name
  order by 2;
end;
$$;

grant execute on function public.message_directory() to authenticated;

-- Recurring lesson link per class (Teams/Zoom/Meet).
alter table public.classes add column if not exists meeting_url text;
alter table public.classes drop constraint if exists classes_meeting_url_https;
alter table public.classes add constraint classes_meeting_url_https check (meeting_url is null or meeting_url ~* '^https://');
