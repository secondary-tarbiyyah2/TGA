-- Tafweed T27 (owner, Nov 2026): "if a student is advanced and they are doing
-- GCSE when they are like 12, there should be something to indicate them being
-- advanced." The year group is suggested from the date of birth in the portal;
-- these columns record that a pupil is deliberately taught ahead of it.
--
-- Also closes a gap found on the way (T20 security audit): the "parent updates
-- own" policy let a family change their own child's year group. Only staff
-- with manage_people_accounts may now change the year group or these flags.

alter table public.children
  add column if not exists working_ahead boolean not null default false,
  add column if not exists working_ahead_note text check (working_ahead_note is null or length(working_ahead_note) <= 300);

comment on column public.children.working_ahead is 'Taught ahead of the year group their date of birth gives (e.g. GCSE at 12). Set by staff only.';
comment on column public.children.working_ahead_note is 'Staff note on what the pupil is doing ahead of age (e.g. "GCSE Maths with Year 10").';

create or replace function public.children_guard_staff_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role and migrations (no signed-in user) and office staff may set anything.
  if auth.uid() is null or public.current_has_permission('manage_people_accounts') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.working_ahead or new.working_ahead_note is not null then
      raise exception 'Only school staff can mark a pupil as working ahead' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.year_group_id is distinct from old.year_group_id
     or new.working_ahead is distinct from old.working_ahead
     or new.working_ahead_note is distinct from old.working_ahead_note then
    raise exception 'Only school staff can change a pupil''s year group' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists children_guard_staff_fields on public.children;
create trigger children_guard_staff_fields
  before insert or update on public.children
  for each row execute function public.children_guard_staff_fields();
