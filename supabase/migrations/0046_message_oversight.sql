-- Message oversight for school leadership (Headteacher / Admin).
--
-- Read access to every thread/message already exists via RLS (0013), and
-- there is deliberately NO insert/update/delete path for non-participants,
-- so oversight is read-only by construction. This migration adds two RPCs:
--   * oversight_list_threads()        - one row per conversation, with
--                                       participant names, kind category,
--                                       last message preview and flag count.
--                                       Metadata only; not audit-logged.
--   * oversight_open_thread(thread)   - returns the full conversation
--                                       (including original text of edited /
--                                       recalled messages) AND writes an
--                                       audit_log row on every call.

create or replace function public.oversight_list_threads()
returns table (
  thread_id uuid,
  kind text,
  category text,
  name_a text,
  role_a text,
  name_b text,
  role_b text,
  child_name text,
  created_at timestamptz,
  last_at timestamptz,
  last_preview text,
  last_sender_id uuid,
  message_count bigint,
  flagged_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  return query
  with t as (
    select
      mt.id, mt.kind, mt.child_id, mt.created_at,
      coalesce(mt.teacher_id, mt.staff_a_id) as a_id,
      coalesce(mt.parent_id, mt.staff_b_id) as b_id
    from public.message_threads mt
  )
  select
    t.id,
    t.kind,
    case
      when t.kind = 'parent_teacher' then 'staff_parent'
      when t.kind in ('staff', 'direct') then
        case when public.is_staff_member(t.a_id) and public.is_staff_member(t.b_id)
             then 'staff_staff' else 'staff_parent' end
      else 'group'
    end,
    pa.full_name, case when public.is_staff_member(t.a_id) then 'Staff' else 'Parent' end,
    pb.full_name, case when public.is_staff_member(t.b_id) then 'Staff' else 'Parent' end,
    c.name,
    t.created_at,
    lm.created_at,
    case when lm.recalled_at is not null then '[recalled]' else left(lm.body, 140) end,
    lm.sender_id,
    coalesce(st.n, 0),
    coalesce(st.f, 0)
  from t
  left join public.profiles pa on pa.id = t.a_id
  left join public.profiles pb on pb.id = t.b_id
  left join public.children c on c.id = t.child_id
  left join lateral (
    select m.created_at, m.body, m.recalled_at, m.sender_id
    from public.message_thread_messages m
    where m.thread_id = t.id
    order by m.created_at desc limit 1
  ) lm on true
  left join lateral (
    select count(*) as n, count(*) filter (where m.flagged) as f
    from public.message_thread_messages m
    where m.thread_id = t.id
  ) st on true
  order by coalesce(lm.created_at, t.created_at) desc;
end;
$$;

revoke all on function public.oversight_list_threads() from public, anon;
grant execute on function public.oversight_list_threads() to authenticated;

create or replace function public.oversight_open_thread(p_thread_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  original_body text,
  created_at timestamptz,
  flagged boolean,
  flagged_keywords text[],
  edited_at timestamptz,
  recalled_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_count int;
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.message_threads mt where mt.id = p_thread_id) then
    raise exception 'thread not found' using errcode = 'P0002';
  end if;

  select p.email into v_email from public.profiles p where p.id = v_actor;
  select count(*) into v_count from public.message_thread_messages m where m.thread_id = p_thread_id;

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (
    v_actor, v_email, 'OVERSIGHT_READ', 'message_threads', p_thread_id::text,
    jsonb_build_object('messages_visible', v_count)
  );

  return query
  select
    m.id, m.sender_id, p.full_name, m.body,
    -- original text only when it differs (edited or recalled)
    case when m.edited_at is not null or m.recalled_at is not null
         then coalesce(m.original_body, m.body) else null end,
    m.created_at, m.flagged, m.flagged_keywords, m.edited_at, m.recalled_at
  from public.message_thread_messages m
  left join public.profiles p on p.id = m.sender_id
  where m.thread_id = p_thread_id
  order by m.created_at asc;
end;
$$;

revoke all on function public.oversight_open_thread(uuid) from public, anon;
grant execute on function public.oversight_open_thread(uuid) to authenticated;
