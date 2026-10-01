-- Message edit + recall (unsend) for the SENDER, without weakening the audit
-- trail or moderation that 0013_messaging.sql set up.
--
-- Model:
--   * Nothing is ever hard-deleted. A recall overwrites the visible `body`
--     with '[recalled]' and stamps recalled_at; the ORIGINAL text is kept in
--     original_body (set once, to the first body, on the first edit/recall)
--     and, as always, in audit_log via audit_message_thread_messages.
--   * The sender has a 15-minute window from created_at (head_teacher/admin
--     are not exempt; they simply have no UPDATE policy on other people's
--     messages). service_role (retention jobs, notify-flagged-messages)
--     bypasses the trigger checks.
--   * Moderation: an edit re-runs the safeguarding keyword scan on the new
--     body; `flagged` is never cleared (old flag kept, new matches merged).
--   * original_body is NOT readable by the other party: SELECT on that one
--     column is withheld from authenticated, and head_teacher/admin (or the
--     safeguarding lead, for flagged messages - same rows their RLS select
--     policies expose) fetch it via public.message_original(message_id).
--     NOTE: because SELECT is now column-granted, any column added to this
--     table later needs its own `grant select (col)` and clients must list
--     columns explicitly (no select '*').

alter table public.message_thread_messages
  add column edited_at timestamptz,
  add column recalled_at timestamptz,
  add column original_body text;

-- ── column privileges: hide original_body from ordinary participants ─────
revoke select on public.message_thread_messages from authenticated, anon;
grant select (id, thread_id, sender_id, body, flagged, flagged_keywords, created_at, flagged_notified_at, edited_at, recalled_at)
  on public.message_thread_messages to authenticated;

-- ── sender-only UPDATE policy ───────────────────────────────────────────
create policy "message_thread_messages: sender edits/recalls own message"
  on public.message_thread_messages for update
  to authenticated
  using (
    sender_id = auth.uid()
    and public.thread_participant(message_thread_messages.thread_id, auth.uid())
  )
  with check (
    sender_id = auth.uid()
    and public.thread_participant(message_thread_messages.thread_id, auth.uid())
  );

-- ── guard trigger ───────────────────────────────────────────────────────
create or replace function public.guard_message_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';
  v_matches text[];
  v_body_changed boolean := new.body is distinct from old.body;
  v_recalling boolean := new.recalled_at is not null and old.recalled_at is null;
begin
  -- Trusted server-side callers (retention script, flag-notifier) pass through.
  if coalesce(v_jwt_role, '') = 'service_role' then
    return new;
  end if;

  -- (i) only body/edited_at/recalled_at/original_body/flagged/flagged_keywords
  -- may differ (the last four are then overwritten below, never trusted).
  if (to_jsonb(new) - array['body', 'edited_at', 'recalled_at', 'original_body', 'flagged', 'flagged_keywords'])
     is distinct from
     (to_jsonb(old) - array['body', 'edited_at', 'recalled_at', 'original_body', 'flagged', 'flagged_keywords']) then
    raise exception 'messages: only the text of a message can be changed';
  end if;

  -- (v) recall is one-way and final.
  if old.recalled_at is not null then
    if new.recalled_at is distinct from old.recalled_at or v_body_changed then
      raise exception 'messages: a recalled message cannot be changed';
    end if;
    new.edited_at := old.edited_at;
    new.original_body := old.original_body;
    new.flagged := old.flagged;
    new.flagged_keywords := old.flagged_keywords;
    return new;
  end if;
  if new.recalled_at is null and old.recalled_at is not null then
    raise exception 'messages: a recalled message cannot be restored';
  end if;

  -- Nothing meaningful changed: pin the server-owned columns and return.
  if not v_body_changed and not v_recalling then
    new.edited_at := old.edited_at;
    new.recalled_at := old.recalled_at;
    new.original_body := old.original_body;
    new.flagged := old.flagged;
    new.flagged_keywords := old.flagged_keywords;
    return new;
  end if;

  -- (vi) 15-minute window, for everyone including head_teacher/admin.
  if now() - old.created_at > interval '15 minutes' then
    raise exception 'messages: messages can only be edited or recalled within 15 minutes of sending';
  end if;

  -- (ii) keep the very first text, once.
  new.original_body := coalesce(old.original_body, old.body);
  new.flagged := old.flagged;
  new.flagged_keywords := old.flagged_keywords;

  if v_recalling then
    new.recalled_at := now();
    new.body := '[recalled]';
    new.edited_at := old.edited_at;
    return new;
  end if;

  -- (iii) edit
  new.recalled_at := null;
  new.edited_at := now();

  -- (iv) re-scan the new body; never un-flag, merge keywords.
  select coalesce(array_agg(k.phrase), '{}')
  into v_matches
  from public.safeguarding_keywords k
  where lower(new.body) like '%' || lower(k.phrase) || '%';

  if coalesce(array_length(v_matches, 1), 0) > 0 then
    new.flagged := true;
    new.flagged_keywords := (
      select array_agg(distinct x) from unnest(coalesce(old.flagged_keywords, '{}') || v_matches) as x
    );
    if new.flagged_keywords is distinct from old.flagged_keywords then
      new.flagged_notified_at := null; -- new keywords: let the notifier alert again
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_message_thread_messages_edit
  before update on public.message_thread_messages
  for each row execute function public.guard_message_edit();

-- ── original text for moderators ────────────────────────────────────────
create or replace function public.message_original(p_message_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(m.original_body, m.body)
  from public.message_thread_messages m
  where m.id = p_message_id
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or (m.flagged and public.current_has_permission('safeguarding_lead'))
    );
$$;

revoke all on function public.message_original(uuid) from public, anon;
grant execute on function public.message_original(uuid) to authenticated;
