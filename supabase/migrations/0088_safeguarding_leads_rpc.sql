-- Who receives a reported concern: names only, safe for any signed-in user.
-- Two shapes because two screens ask: the report-concern form wants kind
-- 'dsl' | 'head_teacher'; the compliance banner wants 'safeguarding_lead' |
-- 'head_teacher' plus a readable role label. A person who is both appears once
-- per kind.
create or replace function public.safeguarding_leads()
returns table (full_name text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name::text, 'dsl'::text
    from public.user_permissions up
    join public.profiles p on p.id = up.user_id
   where up.permission = 'safeguarding_lead'
  union all
  select p.full_name::text, 'head_teacher'::text
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
   where ur.role = 'head_teacher'
   order by 2, 1;
$$;

create or replace function public.safeguarding_contacts()
returns table (full_name text, kind text, role_label text)
language sql
stable
security definer
set search_path = public
as $$
  select l.full_name, case l.kind when 'dsl' then 'safeguarding_lead' else 'head_teacher' end,
         case l.kind when 'dsl' then 'Designated Safeguarding Lead' else 'Headteacher' end
    from public.safeguarding_leads() l;
$$;

revoke all on function public.safeguarding_leads() from public, anon;
revoke all on function public.safeguarding_contacts() from public, anon;
grant execute on function public.safeguarding_leads() to authenticated;
grant execute on function public.safeguarding_contacts() to authenticated;
