-- Staff administration, recipient directories and the Designated Safeguarding Lead.
--
-- Why this exists: several admin screens read other people's names with
--   profiles / user_roles embeds, and two things broke them:
--     1. user_roles has two foreign keys to profiles (user_id, granted_by), so
--        `profiles(full_name)` embedded from user_roles is ambiguous and
--        PostgREST rejects the whole query (-> "Couldn't load staff", "No
--        teachers found").
--     2. profiles' read-all policy (0001) is keyed on profiles.role
--        ('staff'/'admin'), not on the /learn user_roles, so a Headteacher
--        could not read other people's names directly.
-- Fix: (a) let the /learn Headteacher/Admin read profiles; (b) give every
-- directory its own SECURITY DEFINER RPC that returns only what the screen
-- needs, so nothing depends on embeds or on widening RLS for everyone.
--
-- Conventions follow 0067/0075: RLS default deny, SECURITY DEFINER helpers
-- with a fixed search_path, audit via audit_row_change() (all tables touched
-- here already have it and a surrogate `id`). Idempotent.

-- ── profiles: the /learn Headteacher/Admin can read every profile ─────────
drop policy if exists "profiles: learn head_teacher/admin read all" on public.profiles;
create policy "profiles: learn head_teacher/admin read all"
  on public.profiles for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- ── staff_profiles: phone + active flag ───────────────────────────────────
alter table public.staff_profiles add column if not exists phone text;
alter table public.staff_profiles add column if not exists active boolean not null default true;
alter table public.staff_profiles drop constraint if exists staff_profiles_phone_len;
alter table public.staff_profiles add constraint staff_profiles_phone_len check (phone is null or char_length(phone) <= 30);

-- ── admin_staff_directory(): every member of staff, for /admin/staff ──────
create or replace function public.admin_staff_directory()
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  display_title text,
  roles text[],
  active boolean,
  is_dsl boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or an admin can view the staff list' using errcode = '42501';
  end if;
  return query
  select ur.user_id,
         coalesce(nullif(p.full_name, ''), 'Unnamed')::text,
         p.email::text,
         sp.phone::text,
         sp.display_title::text,
         array_agg(distinct ur.role::text order by ur.role::text),
         coalesce(sp.active, true),
         exists (select 1 from public.user_permissions up where up.user_id = ur.user_id and up.permission = 'safeguarding_lead')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join public.staff_profiles sp on sp.user_id = ur.user_id
  where ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover')
  group by ur.user_id, p.full_name, p.email, sp.phone, sp.display_title, sp.active
  order by 2;
end;
$$;

-- ── admin_update_staff(): name, email on file, phone, title, active ───────
create or replace function public.admin_update_staff(
  p_user uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_title text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or an admin can edit staff details' using errcode = '42501';
  end if;
  if not public.is_staff_member(p_user) then
    raise exception 'That person is not a member of staff';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Please enter a name (up to 120 characters)';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right';
  end if;
  if v_title is not null and char_length(v_title) > 20 then
    raise exception 'The title is too long (20 characters at most)';
  end if;
  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'The phone number is too long';
  end if;
  if p_user = auth.uid() and coalesce(p_active, true) = false then
    raise exception 'You cannot mark your own account inactive';
  end if;

  update public.profiles
     set full_name = v_name,
         email = coalesce(v_email, email)
   where id = p_user;

  insert into public.staff_profiles (user_id, display_title, phone, active)
  values (p_user, v_title, v_phone, coalesce(p_active, true))
  on conflict (user_id) do update
    set display_title = excluded.display_title,
        phone = excluded.phone,
        active = excluded.active;
end;
$$;

-- ── admin_set_staff_roles(): Headteacher only ─────────────────────────────
-- Adds/removes the school-wide staff roles teacher, teaching_assistant_cover,
-- admissions and admin. head_teacher is never changed here. Removing a role
-- removes every grant of it (including class-scoped ones).
create or replace function public.admin_set_staff_roles(p_user uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array['admin', 'admissions', 'teacher', 'teaching_assistant_cover'];
  v_role text;
begin
  if not public.current_has_role(array['head_teacher']) then
    raise exception 'Only the Headteacher can change staff roles' using errcode = '42501';
  end if;
  if not public.is_staff_member(p_user) then
    raise exception 'That person is not a member of staff';
  end if;
  p_roles := coalesce(p_roles, array[]::text[]);
  foreach v_role in array p_roles loop
    if not (v_role = any (v_allowed)) then
      raise exception 'Role % cannot be set here', v_role;
    end if;
  end loop;

  delete from public.user_roles ur
   where ur.user_id = p_user
     and ur.role::text = any (v_allowed)
     and not (ur.role::text = any (p_roles));

  insert into public.user_roles (user_id, role, scope_type, scope_id, granted_by)
  select distinct p_user, r, 'none'::text, null::uuid, auth.uid()
    from unnest(p_roles) as r
   where not exists (select 1 from public.user_roles x where x.user_id = p_user and x.role::text = r);

  if not public.is_staff_member(p_user) then
    raise exception 'A member of staff needs at least one role';
  end if;
end;
$$;

-- ── Designated Safeguarding Lead ──────────────────────────────────────────
-- The existing add-on permission 'safeguarding_lead' (0007 user_permissions)
-- IS the DSL grant: it already gates reading concerns, flagged messages and
-- the safeguarding log. This RPC is the audited on/off switch for it
-- (user_permissions carries the audit_row_change trigger from 0007).
-- There is no separate "deputy" permission in the model (the permission list
-- is a closed vocabulary), so a deputy is simply a second DSL.
create or replace function public.set_safeguarding_lead(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher']) then
    raise exception 'Only the Headteacher can assign the Designated Safeguarding Lead' using errcode = '42501';
  end if;
  if not public.is_staff_member(p_user) then
    raise exception 'Only a member of staff can be a Designated Safeguarding Lead';
  end if;
  if coalesce(p_on, false) then
    insert into public.user_permissions (user_id, permission, granted_by)
    values (p_user, 'safeguarding_lead', auth.uid())
    on conflict (user_id, permission) do nothing;
  else
    if exists (select 1 from public.user_permissions where user_id = p_user and permission = 'safeguarding_lead')
       and (select count(*) from public.user_permissions where permission = 'safeguarding_lead') <= 1 then
      raise exception 'The school needs at least one Designated Safeguarding Lead. Assign another before removing this one.';
    end if;
    delete from public.user_permissions where user_id = p_user and permission = 'safeguarding_lead';
  end if;
end;
$$;

-- Who receives a reported concern is shown by safeguarding_contacts() (0086).

-- ── Parent evenings: who can take part ────────────────────────────────────
create or replace function public.parent_evening_teacher_options()
returns table (user_id uuid, full_name text, role text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or an admin can plan parent evenings' using errcode = '42501';
  end if;
  return query
  select ur.user_id,
         coalesce(nullif(p.full_name, ''), 'Unnamed')::text,
         (case when bool_or(ur.role = 'teacher') then 'teacher' else 'teaching_assistant_cover' end)::text
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    left join public.staff_profiles sp on sp.user_id = ur.user_id
   where ur.role in ('teacher', 'teaching_assistant_cover')
     and coalesce(sp.active, true)
   group by ur.user_id, p.full_name
   order by 2;
end;
$$;

-- ── Messaging: who may write to whom ──────────────────────────────────────
-- Safeguarding rules, in one place (used by the directory AND by the policy
-- that lets a direct conversation be created):
--   student -> head teacher / admin, and teachers of their own classes
--   parent  -> head teacher / admin / admissions, and teachers of their children
--   staff   -> all other staff; parents of children in classes they teach;
--              head teacher / admin / admissions -> every parent
-- Inactive staff (staff_profiles.active = false) are never offered.
create or replace function public.staff_teaches_child_of(p_staff uuid, p_child uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.enrolments e
    where e.child_id = p_child
      and (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = p_staff and ur.role in ('teacher', 'teaching_assistant_cover')
            and ur.scope_type = 'class' and ur.scope_id = e.class_id
        )
        or exists (
          select 1 from public.class_subject_teachers cst
          where cst.teacher_id = p_staff and cst.class_id = e.class_id
            and (cst.valid_to is null or cst.valid_to >= current_date)
            and (cst.valid_from is null or cst.valid_from <= current_date)
        )
      )
  );
$$;

create or replace function public.can_message_user(p_other uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_me_staff boolean;
  v_me_parent boolean;
  v_me_student boolean;
  v_me_office boolean;
  v_other_office boolean;
begin
  if v_me is null or p_other is null or v_me = p_other then return false; end if;
  if exists (select 1 from public.staff_profiles sp where sp.user_id = p_other and sp.active = false) then return false; end if;

  v_me_staff := public.is_staff_member(v_me);
  v_me_parent := exists (select 1 from public.user_roles where user_id = v_me and role = 'parent');
  v_me_student := exists (select 1 from public.user_roles where user_id = v_me and role = 'student');
  v_me_office := exists (select 1 from public.user_roles where user_id = v_me and role in ('head_teacher', 'admin', 'admissions'));
  v_other_office := exists (select 1 from public.user_roles where user_id = p_other and role in ('head_teacher', 'admin', 'admissions'));

  if v_me_staff then
    if public.is_staff_member(p_other) then return true; end if;
    if exists (select 1 from public.user_roles where user_id = p_other and role = 'parent') then
      if v_me_office then return true; end if;
      return exists (select 1 from public.children c where c.parent_user_id = p_other and public.staff_teaches_child_of(v_me, c.id));
    end if;
    return false;
  end if;

  if v_me_parent then
    if not public.is_staff_member(p_other) then return false; end if;
    if v_other_office then return true; end if;
    return exists (select 1 from public.children c where c.parent_user_id = v_me and public.staff_teaches_child_of(p_other, c.id));
  end if;

  if v_me_student then
    if not public.is_staff_member(p_other) then return false; end if;
    if exists (select 1 from public.user_roles where user_id = p_other and role in ('head_teacher', 'admin')) then return true; end if;
    return exists (
      select 1 from public.student_accounts sa
      where sa.profile_id = v_me and public.staff_teaches_child_of(p_other, sa.child_id)
    );
  end if;

  return false;
end;
$$;

-- Direct conversations may only be started with someone can_message_user() allows.
drop policy if exists "message_threads: start a direct thread" on public.message_threads;
create policy "message_threads: start a direct thread"
  on public.message_threads for insert
  to authenticated
  with check (
    kind = 'direct'
    and (staff_a_id = auth.uid() or staff_b_id = auth.uid())
    -- Students stay out of 1:1 threads entirely (0013's headline guarantee,
    -- proven in messaging_rls.test.sql): both ends must be adult members.
    and public.is_adult_member(staff_a_id)
    and public.is_adult_member(staff_b_id)
    and public.can_message_user(case when staff_a_id = auth.uid() then staff_b_id else staff_a_id end)
  );

-- Same name and columns as 0027 so the client is unchanged, but: explicit
-- text casts (the old function returned learn_role[] where text[] was
-- declared and failed at run time), safeguarding rules applied, no ids other
-- than the user id needed to start a thread. `detail` (a parent's children)
-- is only given to staff, and teachers only see children they teach.
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
  -- Students get no directory: 1:1 messaging for them stays disabled (see the
  -- thread policy above). can_message_user() already encodes the rule that
  -- would apply if the school ever enables it (teachers and admin only).
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

revoke all on function public.admin_staff_directory() from public, anon;
revoke all on function public.admin_update_staff(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.admin_set_staff_roles(uuid, text[]) from public, anon;
revoke all on function public.set_safeguarding_lead(uuid, boolean) from public, anon;
revoke all on function public.parent_evening_teacher_options() from public, anon;
revoke all on function public.staff_teaches_child_of(uuid, uuid) from public, anon;
revoke all on function public.can_message_user(uuid) from public, anon;
revoke all on function public.message_directory() from public, anon;
grant execute on function public.admin_staff_directory() to authenticated;
grant execute on function public.admin_update_staff(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_set_staff_roles(uuid, text[]) to authenticated;
grant execute on function public.set_safeguarding_lead(uuid, boolean) to authenticated;
grant execute on function public.parent_evening_teacher_options() to authenticated;
grant execute on function public.staff_teaches_child_of(uuid, uuid) to authenticated;
grant execute on function public.can_message_user(uuid) to authenticated;
grant execute on function public.message_directory() to authenticated;
