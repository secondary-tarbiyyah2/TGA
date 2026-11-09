-- Tafweed T28: the SEND register for a SENCo account (November 2026).
--
-- The owner asked for "the role of SENCO leader available as an account".
-- Until now a SENCo was only an add-on permission on top of a teacher's
-- account (0169), so someone employed only as the SENCo could not sign in.
-- This adds:
--
--   * a primary staff role 'senco' (label "SENCo"), set by the Headteacher
--     in People › Staff like the other staff roles (admin_set_staff_roles)
--     or chosen when inviting the account. The 0169 add-on permission stays,
--     for a teacher who is also the SENCo.
--   * send_can_manage() now also admits the 'senco' role, so a SENCo reads
--     and writes SEND records for every pupil. Nothing else is widened.
--   * send_plan_documents: links to a pupil's SEND documents (EHC plan,
--     reports from professionals, review minutes) kept on the school's
--     secure storage. SENCo, Headteacher and admin only; never teachers,
--     parents or pupils.
--   * send_change_log(): who changed what on the register and when, read
--     from the audit log that every SEND table already writes to (0169) and
--     the new documents table. SENCo, Headteacher and admin only.
--   * send_pupil_options(): every pupil, so the SENCo can put a pupil on the
--     register who isn't flagged yet.
--
-- Unchanged on purpose: a pupil's teachers (and the named key adult) still
-- read only ACTIVE plans for pupils they teach (the support notes:
-- adjustments, access arrangements, targets); parents still read their own
-- child's plan once it is shared, as the FAQ promises, but never the
-- register; pupils see nothing. No existing policy is weakened.
-- Idempotent.

-- ── the role ────────────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in select conname from pg_constraint where contypid = 'public.learn_role'::regtype and contype = 'c' loop
    execute format('alter domain public.learn_role drop constraint %I', c.conname);
  end loop;
end;
$$;

alter domain public.learn_role add constraint learn_role_check
  check (value in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco', 'parent', 'student'));

-- A SENCo is a member of staff (clock-in, staff lists, can be named on a plan).
create or replace function public.is_staff_member(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco')
  );
$$;
grant execute on function public.is_staff_member(uuid) to authenticated;

-- Same as 0085, plus the SENCo role and whether the person keeps the register.
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
  where ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco')
  group by ur.user_id, p.full_name, p.email, sp.phone, sp.display_title, sp.active
  order by 2;
end;
$$;
revoke all on function public.admin_staff_directory() from public, anon;
grant execute on function public.admin_staff_directory() to authenticated;

-- Same as 0085, with 'senco' among the roles the Headteacher can set.
create or replace function public.admin_set_staff_roles(p_user uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array['admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco'];
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
revoke all on function public.admin_set_staff_roles(uuid, text[]) from public, anon;
grant execute on function public.admin_set_staff_roles(uuid, text[]) to authenticated;

-- Who may write support plans and see the whole SEND register: as 0169,
-- plus anyone holding the SENCo role.
create or replace function public.send_can_manage()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin', 'senco']) or public.current_has_permission('senco');
$$;
revoke all on function public.send_can_manage() from public, anon;
grant execute on function public.send_can_manage() to authenticated;

-- Staff to choose as SENCo or key adult: as 0169, plus SENCo accounts.
create or replace function public.send_staff_options()
returns table (user_id uuid, full_name text, is_senco boolean)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name,
    exists (select 1 from public.user_permissions up where up.user_id = p.id and up.permission = 'senco')
    or exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'senco')
  from public.profiles p
  where public.send_can_manage()
    and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('head_teacher', 'admin', 'teacher', 'teaching_assistant_cover', 'senco'))
  order by p.full_name;
$$;
revoke all on function public.send_staff_options() from public, anon;
grant execute on function public.send_staff_options() to authenticated;

-- Every pupil, for "Add a pupil to the register". Empty for anyone else.
create or replace function public.send_pupil_options()
returns table (child_id uuid, child_name text, year_group text, has_plan boolean)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.name, yg.name,
    exists (select 1 from public.send_support_plans p where p.child_id = c.id)
  from public.children c
  left join public.year_groups yg on yg.id = c.year_group_id
  where public.send_can_manage() and not c.is_test
  order by c.name;
$$;
revoke all on function public.send_pupil_options() from public, anon;
grant execute on function public.send_pupil_options() to authenticated;

-- ── documents ───────────────────────────────────────────────────────────
-- Links, not uploads: SEND reports stay in the school's secure storage
-- (SharePoint or OneDrive), and the register points to them.
create table if not exists public.send_plan_documents (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.send_support_plans(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind text not null default 'other' check (kind in ('ehcp', 'professional_report', 'review_minutes', 'assessment', 'family', 'other')),
  url text not null check (url ~* '^https://' and char_length(url) <= 2000),
  dated date,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.send_plan_documents enable row level security;
create index if not exists send_plan_documents_plan_idx on public.send_plan_documents (plan_id, created_at desc);

create or replace function public.send_plan_documents_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.plan_id := old.plan_id;
    new.added_by := old.added_by;
    new.created_at := old.created_at;
  else
    new.added_by := coalesce(auth.uid(), new.added_by);
    new.created_at := now();
  end if;
  select p.child_id into new.child_id from public.send_support_plans p where p.id = new.plan_id;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists send_plan_documents_guard on public.send_plan_documents;
create trigger send_plan_documents_guard before insert or update on public.send_plan_documents
  for each row execute function public.send_plan_documents_guard();

drop policy if exists "send_plan_documents: managers all" on public.send_plan_documents;
create policy "send_plan_documents: managers all" on public.send_plan_documents for all to authenticated
  using (public.send_can_manage()) with check (public.send_can_manage());

drop trigger if exists audit_send_plan_documents on public.send_plan_documents;
create trigger audit_send_plan_documents after insert or update or delete on public.send_plan_documents
  for each row execute function public.audit_row_change();

-- ── change log ──────────────────────────────────────────────────────────
-- Who changed what on the SEND register, newest first. With a pupil: that
-- pupil's changes only. Field names only, never the old or new text, so the
-- log itself doesn't spread sensitive detail further.
create or replace function public.send_change_log(p_child uuid default null, p_limit int default 50)
returns table (
  changed_at timestamptz,
  actor_name text,
  action text,
  what text,
  child_id uuid,
  child_name text,
  fields text[]
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.send_can_manage() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with rows as (
    select a.created_at, a.actor_id, a.actor_email, a.action, a.target_table,
      coalesce(a.changes->'new', a.changes->'old') as rec,
      a.changes->'old' as o, a.changes->'new' as n
    from public.audit_log a
    where a.target_table in ('send_support_plans', 'send_plan_targets', 'send_plan_reviews', 'send_plan_family_responses', 'send_plan_documents')
  )
  select r.created_at,
    coalesce(nullif(pr.full_name, ''), r.actor_email, 'The system')::text,
    lower(r.action)::text,
    (case r.target_table
      when 'send_support_plans' then 'Support plan'
      when 'send_plan_targets' then 'Target'
      when 'send_plan_reviews' then 'Review'
      when 'send_plan_family_responses' then 'Family comment'
      when 'send_plan_documents' then 'Document'
    end)::text,
    (r.rec->>'child_id')::uuid,
    c.name::text,
    case when r.action = 'UPDATE' then
      array(
        select k from jsonb_object_keys(r.n) k
        where k not in ('updated_at', 'updated_by', 'created_at', 'created_by', 'plan_updated_at')
          and (r.n->k) is distinct from (r.o->k)
        order by k
      )
    else array[]::text[] end
  from rows r
  left join public.profiles pr on pr.id = r.actor_id
  left join public.children c on c.id = (r.rec->>'child_id')::uuid
  where p_child is null or (r.rec->>'child_id')::uuid = p_child
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;
revoke all on function public.send_change_log(uuid, int) from public, anon;
grant execute on function public.send_change_log(uuid, int) to authenticated;
