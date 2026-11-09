-- Curriculum sync follow-up (review of 0179): curriculum_apply_units can no longer remove a
-- unit a teacher adds while a repo import is being applied.
--   * An advisory lock per part (kind, subject, year) means two sync runs never apply to the
--     same part at once.
--   * Only units the sync read (the ids in p_expected) are ever removed. A unit added after the
--     sync read the part is left alone; the next sync sees it and sends it to the repo.
-- Same signature and grants as 0179. Idempotent.

create or replace function public.curriculum_apply_units(p_kind text, p_slug text, p_year text, p_expected jsonb, p_rows jsonb, p_editor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
  elem jsonb;
  i integer := 0;
  v_id uuid;
  ids uuid[] := '{}';
  known uuid[];
  seen integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('curriculum_units:' || p_kind || ':' || p_slug || ':' || case when p_kind = 'spec' then '' else coalesce(p_year, '') end));
  select coalesce(array_agg(k::uuid), '{}') into known from jsonb_object_keys(p_expected) k;

  for cur in
    select id, updated_at from public.curriculum_units
     where subject_slug = p_slug and kind = p_kind and (p_kind = 'spec' or year = p_year)
     for update
  loop
    if not (p_expected ? cur.id::text) or (p_expected ->> cur.id::text)::timestamptz is distinct from cur.updated_at then
      return null;
    end if;
    seen := seen + 1;
  end loop;
  if seen <> coalesce(array_length(known, 1), 0) then
    return null;
  end if;

  for elem in select value from jsonb_array_elements(p_rows) loop
    if elem ? 'id' and not ((elem ->> 'id')::uuid = any(known)) then
      raise exception 'unit % is not part of this sync', elem ->> 'id' using errcode = '22023';
    end if;
    if elem ? 'id' and coalesce((elem ->> 'keep')::boolean, false) then
      v_id := (elem ->> 'id')::uuid;
      update public.curriculum_units set position = i where id = v_id and position <> i;
    elsif elem ? 'id' then
      v_id := (elem ->> 'id')::uuid;
      update public.curriculum_units u
         set (subject, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order, updated_by, updated_by_name) =
             (select x.subject, coalesce(x.year, u.year), x.half_term, x.term, i, x.ref, x.paper, x.title, coalesce(x.focus, '{}'), coalesce(x.skills, '{}'), coalesce(x.key_terms, '{}'), x.assess, x.prereq, x.leads_to,
                     coalesce(x.weeks, '[]'), x.resources, x.founding_year, coalesce(x.extra, '{}'), coalesce(x.key_order, '{}'), null::uuid, p_editor
                from jsonb_populate_record(null::public.curriculum_units, elem) x)
       where u.id = v_id;
    else
      insert into public.curriculum_units (subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order, updated_by_name)
      select p_slug, x.subject, p_kind, coalesce(x.year, p_year), x.half_term, x.term, i, x.ref, x.paper, x.title, coalesce(x.focus, '{}'), coalesce(x.skills, '{}'), coalesce(x.key_terms, '{}'), x.assess, x.prereq, x.leads_to,
             coalesce(x.weeks, '[]'), x.resources, x.founding_year, coalesce(x.extra, '{}'), coalesce(x.key_order, '{}'), p_editor
        from jsonb_populate_record(null::public.curriculum_units, elem - 'id') x
      returning id into v_id;
    end if;
    ids := ids || v_id;
    i := i + 1;
  end loop;

  -- Remove only units the sync read and left out of the list: never one added meanwhile.
  delete from public.curriculum_units
   where id = any(known) and not (id = any(ids));
  return to_jsonb(ids);
end;
$$;

revoke all on function public.curriculum_apply_units(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.curriculum_apply_units(text, text, text, jsonb, jsonb, text) to service_role;
