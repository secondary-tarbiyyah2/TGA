-- Merit leaderboard: a celebratory, privacy-safe top-N built from POSITIVE
-- behaviour merits only (0039). Demerits and incidents are never read here.
--
--  * children.hide_from_leaderboard: family (or admin) opt-out. A hidden
--    child never appears for anyone.
--  * merit_leaderboard(): SECURITY DEFINER because families and students
--    cannot read other children's behaviour_records (RLS). It returns ONLY
--    rank, first name, surname initial, merit points and an is_mine flag --
--    no ids -- for scopes the caller is entitled to:
--      school : head_teacher/admin, teachers, and any parent or student
--      year   : head_teacher/admin, teachers who teach that year group, and
--               families/students in that year group
--      class  : head_teacher/admin, the class's teachers, and families/
--               students enrolled in the class
--    Admissions-only staff and anyone else are refused.

alter table public.children
  add column if not exists hide_from_leaderboard boolean not null default false;

create or replace function public.merit_leaderboard(
  p_scope text,
  p_scope_id uuid default null,
  p_limit int default 5,
  p_days int default null
)
returns table (
  rank int,
  first_name text,
  surname_initial text,
  merits int,
  is_mine boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_head boolean;
  v_teacher boolean;
  v_family boolean;
  v_limit int;
  v_since date;
  v_ok boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to see the leaderboard' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('class', 'year', 'school') then
    raise exception 'Unknown leaderboard scope' using errcode = '22023';
  end if;
  if p_scope in ('class', 'year') and p_scope_id is null then
    raise exception 'A scope id is required for this scope' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_since := case when p_days is null or p_days <= 0 then null else current_date - p_days end;

  v_head := public.current_has_role(array['head_teacher', 'admin']);
  v_teacher := public.current_has_role(array['teacher', 'teaching_assistant_cover']);
  v_family := exists (
    select 1 from public.children c
    where c.parent_user_id = v_uid
       or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid)
  );

  if v_head then
    v_ok := true;
  elsif p_scope = 'school' then
    v_ok := v_teacher or v_family;
  elsif p_scope = 'class' then
    v_ok := public.class_taught_by_current_user(p_scope_id)
      or exists (
        select 1 from public.enrolments e
        join public.children c on c.id = e.child_id
        where e.class_id = p_scope_id
          and (c.parent_user_id = v_uid
               or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid))
      );
  else -- year
    v_ok := exists (
        select 1 from public.children c
        where c.year_group_id = p_scope_id
          and (c.parent_user_id = v_uid
               or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid))
      )
      or exists (
        select 1
        from public.year_groups yg
        join public.classes cl on cl.year_group = yg.name
        where yg.id = p_scope_id and public.class_taught_by_current_user(cl.id)
      );
  end if;

  if not v_ok then
    raise exception 'Not allowed to see this leaderboard' using errcode = '42501';
  end if;

  return query
  with eligible as (
    select c.id as cid, c.name as cname, c.parent_user_id as pid
    from public.children c
    where c.hide_from_leaderboard = false
      and (
        p_scope = 'school'
        or (p_scope = 'class' and exists (select 1 from public.enrolments e where e.class_id = p_scope_id and e.child_id = c.id))
        or (p_scope = 'year' and c.year_group_id = p_scope_id)
      )
  ),
  totals as (
    select
      el.cid,
      btrim(el.cname) as full_nm,
      sum(b.points)::int as pts,
      (el.pid = v_uid or exists (select 1 from public.student_accounts sa where sa.child_id = el.cid and sa.profile_id = v_uid)) as mine
    from eligible el
    join public.behaviour_records b on b.child_id = el.cid
    where b.kind = 'merit' and b.points > 0 and b.voided_at is null
      and (v_since is null or b.occurred_on >= v_since)
    group by el.cid, el.cname, el.pid
  ),
  ranked as (
    select t.*, rank() over (order by t.pts desc)::int as rnk from totals t
  )
  select
    r.rnk,
    split_part(r.full_nm, ' ', 1),
    case when r.full_nm ~ '\s' then upper((regexp_match(r.full_nm, '(\S)\S*$'))[1]) else null end,
    r.pts,
    r.mine
  from ranked r
  order by r.rnk, r.full_nm
  limit v_limit;
end;
$$;

revoke all on function public.merit_leaderboard(text, uuid, int, int) from public, anon;
grant execute on function public.merit_leaderboard(text, uuid, int, int) to authenticated;
