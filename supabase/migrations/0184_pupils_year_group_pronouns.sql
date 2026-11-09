-- Tafweed T26, T27, T31: adding and editing pupils on the Pupils page.
--
--  * children.working_above_year_group: the pupil is placed in, or working at,
--    a year group above the one their date of birth gives (for example GCSE
--    work at 12). Set by the Headteacher or Admin when adding or editing a
--    pupil; a parent can't set or change it (trigger below), even though they
--    may still update their own child's other details as before.
--  * public.pupil_pronoun(child): "he", "she" or null, from the gender on the
--    pupil record, so report and note forms can prefill the pronoun. Returns
--    only the pronoun (never the record) and only to staff who may already
--    see that pupil: Headteacher/Admin, or a teacher of one of their classes.
--
-- Adding and editing pupils themselves needs no new policy: "children: staff
-- with manage_people_accounts write all" (0008) already limits writes to the
-- Headteacher and Admin roles. supabase/tests/database/pupils_admin_edit.test.sql
-- proves that, and the two additions here.

alter table public.children
  add column if not exists working_above_year_group boolean not null default false;

comment on column public.children.working_above_year_group is
  'Placed in or working at a year group above the one their date of birth gives. Staff (manage_people_accounts) only.';

create or replace function public.children_guard_working_above()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role jobs and migrations (no signed-in user) are trusted.
  if auth.uid() is null or public.current_has_permission('manage_people_accounts') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.working_above_year_group then
      raise exception 'Only the Headteacher or Admin can mark a pupil as working above their year group'
        using errcode = '42501';
    end if;
  elsif new.working_above_year_group is distinct from old.working_above_year_group then
    raise exception 'Only the Headteacher or Admin can mark a pupil as working above their year group'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists children_guard_working_above on public.children;
create trigger children_guard_working_above
  before insert or update on public.children
  for each row execute function public.children_guard_working_above();

create or replace function public.pupil_pronoun(p_child_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case d.gender when 'male' then 'he' when 'female' then 'she' end
  from public.pupil_details d
  where d.child_id = p_child_id
    and (
      public.current_has_permission('manage_people_accounts')
      or public.current_has_role(array['head_teacher', 'admin']::public.learn_role[])
      or public.child_enrolled_in_teachers_class(p_child_id)
    );
$$;

revoke all on function public.pupil_pronoun(uuid) from public, anon;
grant execute on function public.pupil_pronoun(uuid) to authenticated;
