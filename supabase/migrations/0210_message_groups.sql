-- 0210: group conversations, replies, attachments, per-person read receipts
-- and search for /learn messaging (owner feedback 11 Nov 2026, item 3:
-- "the messages section needs to allow groups to be made, read receipts, and
-- fully functional messaging system").
--
-- Builds on 0013 (threads and messages), 0036 (edit and recall), 0046
-- (oversight), 0058 (read receipts) and 0085 (who may message whom).
--
-- SAFEGUARDING MODEL FOR GROUPS (read this before changing anything here)
--   * Only staff create groups, and only through create_message_group().
--     There is no INSERT policy for kind = 'group', and members are added and
--     removed only through the SECURITY DEFINER functions below, which apply
--     the same rules as 1:1 messaging (can_message_user, 0085) plus "a pupil
--     may be added only by staff who teach them, or by the office".
--   * Every group always has at least one member of staff in it.
--   * In a group, staff members see everything. Parents and pupils (the
--     "audience") see the staff's messages and their own, never each other's:
--     a parent's or pupil's reply goes to the staff in the group only. So a
--     class group is never a channel between parents, or between pupils
--     (DESIGN.md: no student-to-student contact; 0027: parents never see each
--     other's details). The member list follows the same rule.
--   * Staff may switch replies off (members_can_reply = false): then only staff
--     post, like a noticeboard.
--   * Oversight is unchanged and covers groups: the Headteacher and admins read
--     every thread and message (0013 policies, oversight_open_thread), groups
--     are listed in oversight_list_threads() (category 'group'), the keyword
--     scan and the safeguarding lead's access to flagged messages apply to
--     group messages exactly as to 1:1 ones, and every change is audit-logged.
--   * Pupils are still never in a 1:1 thread (0013's shape constraint is kept).
--
-- Attachments: private bucket 'message-attachments', 10 MB a file, documents
-- and images only, at most 5 files a message; a file is readable by exactly
-- the people who can read its message (and oversight).

-- ── message_threads: a fourth shape, 'group' ─────────────────────────────
alter table public.message_threads
  add column if not exists title text,
  add column if not exists group_type text,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists year_group_id uuid references public.year_groups(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists members_can_reply boolean not null default true;

alter table public.message_threads drop constraint if exists message_threads_kind_check;
alter table public.message_threads
  add constraint message_threads_kind_check check (kind in ('parent_teacher', 'staff', 'direct', 'group'));

alter table public.message_threads drop constraint if exists message_threads_group_type_check;
alter table public.message_threads
  add constraint message_threads_group_type_check check (group_type is null or group_type in ('class', 'year_group', 'staff', 'ad_hoc'));

alter table public.message_threads drop constraint if exists message_threads_shape;
alter table public.message_threads
  add constraint message_threads_shape check (
    (kind = 'parent_teacher' and child_id is not null and parent_id is not null and teacher_id is not null
      and staff_a_id is null and staff_b_id is null and title is null and group_type is null)
    or
    (kind in ('staff', 'direct') and staff_a_id is not null and staff_b_id is not null and staff_a_id <> staff_b_id
      and child_id is null and parent_id is null and teacher_id is null and title is null and group_type is null)
    or
    (kind = 'group' and title is not null and char_length(btrim(title)) between 1 and 80 and group_type is not null
      and child_id is null and parent_id is null and teacher_id is null and staff_a_id is null and staff_b_id is null)
  );

-- ── message_thread_members (groups only) ─────────────────────────────────
create table if not exists public.message_thread_members (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('staff', 'parent', 'pupil')),
  is_admin boolean not null default false,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  unique (thread_id, user_id)
);
create index if not exists message_thread_members_user_idx on public.message_thread_members (user_id);

alter table public.message_thread_members enable row level security;
-- Written only by the functions below.
revoke insert, update, delete on public.message_thread_members from anon, authenticated;

drop trigger if exists audit_message_thread_members on public.message_thread_members;
create trigger audit_message_thread_members
  after insert or update or delete on public.message_thread_members
  for each row execute function public.audit_row_change();

-- The caller's (or anyone's) role in a group, without RLS recursion.
create or replace function public.group_member_role(p_thread_id uuid, p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.member_role from public.message_thread_members m
  where m.thread_id = p_thread_id and m.user_id = p_user_id;
$$;
revoke all on function public.group_member_role(uuid, uuid) from public, anon;
grant execute on function public.group_member_role(uuid, uuid) to authenticated, service_role;

drop policy if exists "message_thread_members: read" on public.message_thread_members;
create policy "message_thread_members: read"
  on public.message_thread_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.group_member_role(thread_id, auth.uid()) = 'staff'
    -- parents and pupils see who the staff in the group are, never each other
    or (member_role = 'staff' and public.group_member_role(thread_id, auth.uid()) is not null)
    or public.current_has_role(array['head_teacher', 'admin'])
  );

-- ── who is in a thread, and who sees which message ───────────────────────
create or replace function public.thread_participant(p_thread_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (
        t.parent_id = p_user_id or t.teacher_id = p_user_id or t.staff_a_id = p_user_id or t.staff_b_id = p_user_id
        or (t.kind = 'group' and exists (
              select 1 from public.message_thread_members m where m.thread_id = t.id and m.user_id = p_user_id))
      )
  );
$$;
revoke all on function public.thread_participant(uuid, uuid) from public, anon;
grant execute on function public.thread_participant(uuid, uuid) to authenticated, service_role;

-- Can p_user read a message that p_sender wrote in p_thread?
--   1:1 threads: both participants.
--   groups: staff members see all; parents and pupils see staff messages and their own.
create or replace function public.message_visible_to(p_thread_id uuid, p_sender_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select case
    when t.kind = 'group' then
      coalesce((
        select m.member_role = 'staff' or p_sender_id = p_user_id or public.is_staff_member(p_sender_id)
        from public.message_thread_members m
        where m.thread_id = t.id and m.user_id = p_user_id
      ), false)
    else coalesce(t.parent_id = p_user_id or t.teacher_id = p_user_id or t.staff_a_id = p_user_id or t.staff_b_id = p_user_id, false)
  end
  from public.message_threads t
  where t.id = p_thread_id), false);
$$;
revoke all on function public.message_visible_to(uuid, uuid, uuid) from public, anon;
grant execute on function public.message_visible_to(uuid, uuid, uuid) to authenticated, service_role;

-- Can the caller post in this thread?
create or replace function public.can_post_in_thread(p_thread_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select case
    when auth.uid() is null then false
    when t.kind = 'group' then
      coalesce((
        select m.member_role = 'staff' or t.members_can_reply
        from public.message_thread_members m
        where m.thread_id = t.id and m.user_id = auth.uid()
      ), false)
    else public.thread_participant(t.id, auth.uid())
  end
  from public.message_threads t
  where t.id = p_thread_id), false);
$$;
revoke all on function public.can_post_in_thread(uuid) from public, anon;
grant execute on function public.can_post_in_thread(uuid) to authenticated;

-- ── policies: groups are read by their members ───────────────────────────
drop policy if exists "message_threads: group members read" on public.message_threads;
create policy "message_threads: group members read"
  on public.message_threads for select
  to authenticated
  using (kind = 'group' and public.group_member_role(id, auth.uid()) is not null);

-- Messages: replace the participant policies with visibility-aware ones.
drop policy if exists "message_thread_messages: participants read own thread" on public.message_thread_messages;
create policy "message_thread_messages: participants read own thread"
  on public.message_thread_messages for select
  to authenticated
  using (public.message_visible_to(message_thread_messages.thread_id, message_thread_messages.sender_id, auth.uid()));

drop policy if exists "message_thread_messages: participants send in own thread" on public.message_thread_messages;
create policy "message_thread_messages: participants send in own thread"
  on public.message_thread_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_post_in_thread(message_thread_messages.thread_id)
  );

-- ── replies ──────────────────────────────────────────────────────────────
alter table public.message_thread_messages
  add column if not exists reply_to_id uuid references public.message_thread_messages(id) on delete set null;
-- 0036: SELECT on this table is granted column by column.
grant select (reply_to_id) on public.message_thread_messages to authenticated;
create index if not exists message_thread_messages_reply_idx on public.message_thread_messages (reply_to_id) where reply_to_id is not null;

create or replace function public.check_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target record;
begin
  if new.reply_to_id is null then return new; end if;
  select m.thread_id, m.sender_id into v_target from public.message_thread_messages m where m.id = new.reply_to_id;
  if not found or v_target.thread_id <> new.thread_id then
    raise exception 'messages: a reply must be to a message in the same conversation';
  end if;
  if not public.message_visible_to(new.thread_id, v_target.sender_id, new.sender_id) then
    raise exception 'messages: you can only reply to a message you can see';
  end if;
  return new;
end;
$$;

drop trigger if exists check_message_thread_messages_reply on public.message_thread_messages;
create trigger check_message_thread_messages_reply
  before insert on public.message_thread_messages
  for each row execute function public.check_message_reply();

-- ── attachments ──────────────────────────────────────────────────────────
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.message_thread_messages(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) <= 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index if not exists message_attachments_message_idx on public.message_attachments (message_id);
create index if not exists message_attachments_thread_idx on public.message_attachments (thread_id);

alter table public.message_attachments enable row level security;
revoke update, delete on public.message_attachments from anon, authenticated;

drop trigger if exists audit_message_attachments on public.message_attachments;
create trigger audit_message_attachments
  after insert or update or delete on public.message_attachments
  for each row execute function public.audit_row_change();

-- Readable by exactly the people who can read the (not recalled) message,
-- plus the Headteacher/admins, plus the safeguarding lead for flagged messages.
create or replace function public.message_attachment_visible(p_message_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.message_thread_messages m
    where m.id = p_message_id
      and (
        (m.recalled_at is null and public.message_visible_to(m.thread_id, m.sender_id, auth.uid()))
        or public.current_has_role(array['head_teacher', 'admin'])
        or (m.flagged and public.current_has_permission('safeguarding_lead'))
      )
  );
$$;
revoke all on function public.message_attachment_visible(uuid) from public, anon;
grant execute on function public.message_attachment_visible(uuid) to authenticated;

drop policy if exists "message_attachments: read" on public.message_attachments;
create policy "message_attachments: read"
  on public.message_attachments for select
  to authenticated
  using (public.message_attachment_visible(message_id));

drop policy if exists "message_attachments: sender adds to own message" on public.message_attachments;
create policy "message_attachments: sender adds to own message"
  on public.message_attachments for insert
  to authenticated
  with check (
    uploader_id = auth.uid()
    and storage_path like thread_id::text || '/' || auth.uid()::text || '/%'
    and exists (
      select 1 from public.message_thread_messages m
      where m.id = message_id and m.sender_id = auth.uid() and m.thread_id = message_attachments.thread_id
        and m.recalled_at is null and m.created_at > now() - interval '15 minutes'
    )
  );

create or replace function public.limit_message_attachments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.message_attachments a where a.message_id = new.message_id) >= 5 then
    raise exception 'messages: at most 5 files can be attached to one message';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_message_attachments on public.message_attachments;
create trigger limit_message_attachments
  before insert on public.message_attachments
  for each row execute function public.limit_message_attachments();

-- Storage. Path: '<thread id>/<uploader id>/<random>-<file name>'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760, -- 10 MB a file
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "message-attachments: upload into a thread you can post in" on storage.objects;
create policy "message-attachments: upload into a thread you can post in"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.storage_path_uuid_part(name, 2) = auth.uid()
    and public.can_post_in_thread(public.storage_path_uuid_part(name, 1))
  );

drop policy if exists "message-attachments: read" on storage.objects;
create policy "message-attachments: read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      -- your own upload that has not been attached to a message (yet)
      (public.storage_path_uuid_part(name, 2) = auth.uid()
        and not exists (select 1 from public.message_attachments a where a.storage_path = storage.objects.name))
      or exists (
        select 1 from public.message_attachments a
        where a.storage_path = storage.objects.name and public.message_attachment_visible(a.message_id)
      )
    )
  );

-- Only an upload that never made it onto a message can be removed by its owner.
drop policy if exists "message-attachments: remove own unattached upload" on storage.objects;
create policy "message-attachments: remove own unattached upload"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.storage_path_uuid_part(name, 2) = auth.uid()
    and not exists (select 1 from public.message_attachments a where a.storage_path = storage.objects.name)
  );

-- ── read state: groups and pupils ───────────────────────────────────────
create or replace function public.mark_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_on boolean;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  -- Pupils are only ever in groups (never in a 1:1 thread), so the participant
  -- check below is all that is needed for them too.
  if not public.thread_participant(p_thread_id, v_uid) then raise exception 'not a participant'; end if;

  insert into public.thread_last_seen (user_id, thread_id, seen_at)
  values (v_uid, p_thread_id, now())
  on conflict (user_id, thread_id) do update set seen_at = excluded.seen_at;

  select coalesce((select read_receipts_enabled from public.message_prefs where user_id = v_uid), true) into v_on;
  if v_on then
    insert into public.message_reads (message_id, reader_id)
    select m.id, v_uid
    from public.message_thread_messages m
    where m.thread_id = p_thread_id and m.sender_id <> v_uid and m.recalled_at is null
      and public.message_visible_to(m.thread_id, m.sender_id, v_uid)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.thread_unread_counts()
returns table (thread_id uuid, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, count(m.id)::integer
  from public.message_threads t
  join public.message_thread_messages m on m.thread_id = t.id
  left join public.thread_last_seen s on s.thread_id = t.id and s.user_id = auth.uid()
  where auth.uid() is not null
    and public.thread_participant(t.id, auth.uid())
    and m.sender_id <> auth.uid()
    and m.recalled_at is null
    and m.created_at > coalesce(s.seen_at, '-infinity'::timestamptz)
    and public.message_visible_to(t.id, m.sender_id, auth.uid())
  group by t.id;
$$;

-- Per-person receipts for the caller's own messages: "Seen by 3 of 5".
-- One row per (message, reader); a message nobody has read yet comes back
-- once with reader_id null. `audience` = how many people can see the message.
-- WhatsApp rule (0058) kept: with receipts off you neither send nor see them.
create or replace function public.message_receipts(p_thread_id uuid)
returns table (message_id uuid, audience integer, reader_id uuid, reader_name text, read_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
begin
  if v_uid is null or not public.thread_participant(p_thread_id, v_uid) then return; end if;
  if not coalesce((select p.read_receipts_enabled from public.message_prefs p where p.user_id = v_uid), true) then return; end if;
  select t.kind into v_kind from public.message_threads t where t.id = p_thread_id;

  return query
  with mine as (
    select m.id from public.message_thread_messages m
    where m.thread_id = p_thread_id and m.sender_id = v_uid and m.recalled_at is null
  ),
  aud as (
    select case
      when v_kind = 'group' then (
        select count(*)::integer from public.message_thread_members gm
        where gm.thread_id = p_thread_id and gm.user_id <> v_uid
          and public.message_visible_to(p_thread_id, v_uid, gm.user_id))
      else 1 end as n
  )
  select mine.id, aud.n, r.reader_id, coalesce(nullif(pr.full_name, ''), 'Unnamed')::text, r.read_at
  from mine
  cross join aud
  left join public.message_reads r
    on r.message_id = mine.id and r.reader_id <> v_uid
   and coalesce((select p.read_receipts_enabled from public.message_prefs p where p.user_id = r.reader_id), true)
  left join public.profiles pr on pr.id = r.reader_id;
end;
$$;
revoke all on function public.message_receipts(uuid) from public, anon;
grant execute on function public.message_receipts(uuid) to authenticated;

-- ── the caller's inbox in one call ───────────────────────────────────────
create or replace function public.my_message_threads()
returns table (
  thread_id uuid,
  kind text,
  title text,
  subtitle text,
  other_user_id uuid,
  group_type text,
  member_count integer,
  includes_pupils boolean,
  my_role text,
  is_admin boolean,
  members_can_reply boolean,
  can_post boolean,
  created_at timestamptz,
  last_at timestamptz,
  last_preview text,
  last_sender_id uuid,
  last_sender_name text,
  unread integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query
  with t as (
    select mt.* from public.message_threads mt
    where public.thread_participant(mt.id, v_uid)
  )
  select
    t.id,
    t.kind,
    (case when t.kind = 'group' then t.title
          else coalesce(nullif(op.full_name, ''), 'Unnamed') end)::text,
    (case
       when t.kind = 'group' then
         concat_ws(' · ',
           case t.group_type when 'class' then 'Class group' when 'year_group' then 'Year group'
                             when 'staff' then 'Staff group' else 'Group' end,
           cl.name, yg.name)
       when t.kind = 'parent_teacher' then 'About ' || ch.name
       else null end)::text,
    (case when t.kind = 'group' then null
          when t.kind = 'parent_teacher' then (case when t.parent_id = v_uid then t.teacher_id else t.parent_id end)
          else (case when t.staff_a_id = v_uid then t.staff_b_id else t.staff_a_id end) end),
    t.group_type,
    (case when t.kind = 'group' then (select count(*)::integer from public.message_thread_members gm where gm.thread_id = t.id) else 2 end),
    (t.kind = 'group' and exists (select 1 from public.message_thread_members gm where gm.thread_id = t.id and gm.member_role = 'pupil')),
    (case when t.kind = 'group' then public.group_member_role(t.id, v_uid)
          when public.is_staff_member(v_uid) then 'staff' else 'parent' end),
    coalesce((select gm.is_admin from public.message_thread_members gm where gm.thread_id = t.id and gm.user_id = v_uid), false),
    t.members_can_reply,
    public.can_post_in_thread(t.id),
    t.created_at,
    lm.created_at,
    (case when lm.id is null then null when lm.recalled_at is not null then 'Message recalled' else left(lm.body, 140) end)::text,
    lm.sender_id,
    (select coalesce(nullif(sp.full_name, ''), 'Unnamed') from public.profiles sp where sp.id = lm.sender_id)::text,
    coalesce((
      select count(*)::integer from public.message_thread_messages um
      where um.thread_id = t.id and um.sender_id <> v_uid and um.recalled_at is null
        and um.created_at > coalesce((select s.seen_at from public.thread_last_seen s where s.thread_id = t.id and s.user_id = v_uid), '-infinity'::timestamptz)
        and public.message_visible_to(t.id, um.sender_id, v_uid)
    ), 0)
  from t
  left join public.profiles op on op.id = (case
      when t.kind = 'parent_teacher' then (case when t.parent_id = v_uid then t.teacher_id else t.parent_id end)
      when t.kind in ('staff', 'direct') then (case when t.staff_a_id = v_uid then t.staff_b_id else t.staff_a_id end)
      else null end)
  left join public.children ch on ch.id = t.child_id
  left join public.classes cl on cl.id = t.class_id
  left join public.year_groups yg on yg.id = t.year_group_id
  left join lateral (
    select m.id, m.created_at, m.body, m.recalled_at, m.sender_id
    from public.message_thread_messages m
    where m.thread_id = t.id and public.message_visible_to(t.id, m.sender_id, v_uid)
    order by m.created_at desc limit 1
  ) lm on true
  order by coalesce(lm.created_at, t.created_at) desc;
end;
$$;
revoke all on function public.my_message_threads() from public, anon;
grant execute on function public.my_message_threads() to authenticated;

-- Members of a group as the caller may see them (staff: everyone; parents and
-- pupils: the staff and themselves). Oversight sees everyone.
create or replace function public.thread_members(p_thread_id uuid)
returns table (user_id uuid, full_name text, member_role text, is_admin boolean, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.group_member_role(p_thread_id, v_uid);
  v_all boolean;
begin
  if v_uid is null then return; end if;
  v_all := coalesce(v_role = 'staff', false) or coalesce(public.current_has_role(array['head_teacher', 'admin']), false);
  if v_role is null and not v_all then return; end if;
  return query
  select m.user_id, coalesce(nullif(p.full_name, ''), 'Unnamed')::text, m.member_role, m.is_admin, m.added_at
  from public.message_thread_members m
  join public.profiles p on p.id = m.user_id
  where m.thread_id = p_thread_id
    and (v_all or m.member_role = 'staff' or m.user_id = v_uid)
  order by (m.member_role = 'staff') desc, m.member_role, 2;
end;
$$;
revoke all on function public.thread_members(uuid) from public, anon;
grant execute on function public.thread_members(uuid) to authenticated;

-- Names of everyone who has written a message the caller can see in a thread
-- (former members included), so senders are always named.
create or replace function public.thread_sender_names(p_thread_id uuid)
returns table (user_id uuid, full_name text, is_staff boolean)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.sender_id, coalesce(nullif(p.full_name, ''), 'Unnamed')::text, public.is_staff_member(m.sender_id)
  from public.message_thread_messages m
  join public.profiles p on p.id = m.sender_id
  where m.thread_id = p_thread_id
    and auth.uid() is not null
    and public.message_visible_to(m.thread_id, m.sender_id, auth.uid());
$$;
revoke all on function public.thread_sender_names(uuid) from public, anon;
grant execute on function public.thread_sender_names(uuid) to authenticated;

-- ── search across the caller's conversations ─────────────────────────────
create or replace function public.search_messages(p_query text)
returns table (message_id uuid, thread_id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  if v_uid is null or char_length(v_q) < 2 then return; end if;
  v_q := left(v_q, 100);
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select m.id, m.thread_id, m.sender_id, coalesce(nullif(p.full_name, ''), 'Unnamed')::text, left(m.body, 300)::text, m.created_at
  from public.message_thread_messages m
  left join public.profiles p on p.id = m.sender_id
  where m.recalled_at is null
    and m.body ilike v_pattern
    and public.thread_participant(m.thread_id, v_uid)
    and public.message_visible_to(m.thread_id, m.sender_id, v_uid)
  order by m.created_at desc
  limit 50;
end;
$$;
revoke all on function public.search_messages(text) from public, anon;
grant execute on function public.search_messages(text) to authenticated;

-- ── creating and running groups ──────────────────────────────────────────
create or replace function public.is_school_office()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin', 'admissions']);
$$;
revoke all on function public.is_school_office() from public, anon;
grant execute on function public.is_school_office() to authenticated;

-- What a person would be in a group: 'staff', 'parent', 'pupil' or null.
create or replace function public.message_member_kind(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_staff_member(p_user_id) then 'staff'
    when exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role = 'parent') then 'parent'
    when exists (select 1 from public.student_accounts sa where sa.profile_id = p_user_id) then 'pupil'
    else null end;
$$;
revoke all on function public.message_member_kind(uuid) from public, anon;
grant execute on function public.message_member_kind(uuid) to authenticated;

-- May the caller (staff) add this person to a group?
create or replace function public.can_add_group_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kind text := public.message_member_kind(p_user_id);
begin
  if v_me is null or p_user_id is null or not public.is_staff_member(v_me) then return false; end if;
  if p_user_id = v_me then return true; end if;
  if exists (select 1 from public.staff_profiles sp where sp.user_id = p_user_id and sp.active = false) then return false; end if;
  if v_kind = 'staff' then return true; end if;
  if v_kind = 'parent' then return public.can_message_user(p_user_id); end if;
  if v_kind = 'pupil' then
    if public.is_school_office() then return true; end if;
    return exists (
      select 1 from public.student_accounts sa
      where sa.profile_id = p_user_id and public.staff_teaches_child_of(v_me, sa.child_id)
    );
  end if;
  return false;
end;
$$;
revoke all on function public.can_add_group_member(uuid) from public, anon;
grant execute on function public.can_add_group_member(uuid) to authenticated;

-- Everyone the caller may add to a group.
create or replace function public.message_group_candidates()
returns table (user_id uuid, full_name text, member_kind text, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_office boolean;
begin
  if v_me is null or not public.is_staff_member(v_me) then return; end if;
  v_office := public.is_school_office();
  return query
  select x.user_id, x.full_name, x.member_kind, x.detail
  from (
    -- staff
    select ur.user_id,
           coalesce(nullif(p.full_name, ''), 'Unnamed')::text as full_name,
           'staff'::text as member_kind,
           coalesce(max(sp.display_title), 'Staff')::text as detail
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    left join public.staff_profiles sp on sp.user_id = ur.user_id
    where ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco')
      and ur.user_id <> v_me
      and coalesce(sp.active, true)
    group by ur.user_id, p.full_name
    union all
    -- parents (same rule as 1:1 messaging)
    select p.id, coalesce(nullif(p.full_name, ''), 'Unnamed')::text, 'parent'::text,
           ('Parent of ' || (select string_agg(c.name, ', ' order by c.name) from public.children c
                              where c.parent_user_id = p.id and (v_office or public.staff_teaches_child_of(v_me, c.id))))::text
    from public.profiles p
    where exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'parent')
      and not public.is_staff_member(p.id)
      and public.can_message_user(p.id)
    union all
    -- pupils the caller teaches (the office: every pupil)
    select sa.profile_id, coalesce(nullif(c.name, ''), nullif(p.full_name, ''), 'Unnamed')::text, 'pupil'::text,
           coalesce(yg.name, 'Pupil')::text
    from public.student_accounts sa
    join public.children c on c.id = sa.child_id
    join public.profiles p on p.id = sa.profile_id
    left join public.year_groups yg on yg.id = c.year_group_id
    where sa.profile_id is not null
      and (v_office or public.staff_teaches_child_of(v_me, sa.child_id))
  ) x
  order by x.member_kind desc, x.full_name;
end;
$$;
revoke all on function public.message_group_candidates() from public, anon;
grant execute on function public.message_group_candidates() to authenticated;

-- Ready-made audiences: the caller's classes (the office: every class) and,
-- for the office, year groups. Counts are people with portal accounts.
create or replace function public.message_group_presets()
returns table (preset_type text, preset_id uuid, name text, parents integer, pupils integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_office boolean;
begin
  if v_me is null or not public.is_staff_member(v_me) then return; end if;
  v_office := public.is_school_office();
  return query
  select 'class'::text, cl.id, cl.name::text,
         (select count(distinct c.parent_user_id)::integer from public.enrolments e join public.children c on c.id = e.child_id
           where e.class_id = cl.id and c.parent_user_id is not null),
         (select count(distinct sa.profile_id)::integer from public.enrolments e join public.student_accounts sa on sa.child_id = e.child_id
           where e.class_id = cl.id and sa.profile_id is not null)
  from public.classes cl
  where v_office or cl.id in (select public.teacher_class_ids(v_me))
  union all
  select 'year_group'::text, yg.id, yg.name::text,
         (select count(distinct c.parent_user_id)::integer from public.children c
           where c.year_group_id = yg.id and c.parent_user_id is not null
             and exists (select 1 from public.enrolments e where e.child_id = c.id)),
         (select count(distinct sa.profile_id)::integer from public.children c join public.student_accounts sa on sa.child_id = c.id
           where c.year_group_id = yg.id and sa.profile_id is not null
             and exists (select 1 from public.enrolments e where e.child_id = c.id))
  from public.year_groups yg
  where v_office
  order by 1, 3;
end;
$$;
revoke all on function public.message_group_presets() from public, anon;
grant execute on function public.message_group_presets() to authenticated;

-- Internal: add one person (checks done by the callers).
create or replace function public.group_add_member_unchecked(p_thread_id uuid, p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.message_member_kind(p_user_id);
begin
  if v_kind is null then return; end if;
  insert into public.message_thread_members (thread_id, user_id, member_role, is_admin, added_by)
  values (p_thread_id, p_user_id, v_kind, p_admin and v_kind = 'staff', auth.uid())
  on conflict (thread_id, user_id) do nothing;
  -- Nothing from before they joined counts as unread.
  insert into public.thread_last_seen (user_id, thread_id, seen_at)
  values (p_user_id, p_thread_id, now())
  on conflict (user_id, thread_id) do nothing;
end;
$$;
revoke all on function public.group_add_member_unchecked(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.create_message_group(
  p_title text,
  p_group_type text,
  p_class_id uuid default null,
  p_year_group_id uuid default null,
  p_include_parents boolean default false,
  p_include_pupils boolean default false,
  p_include_class_staff boolean default true,
  p_member_ids uuid[] default '{}',
  p_members_can_reply boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_office boolean;
  v_title text := btrim(coalesce(p_title, ''));
  v_thread uuid;
  v_id uuid;
  v_count int;
begin
  if v_me is null or not public.is_staff_member(v_me) then
    raise exception 'Only staff can create a group' using errcode = '42501';
  end if;
  v_office := public.is_school_office();
  if v_title = '' or char_length(v_title) > 80 then
    raise exception 'Please give the group a name (up to 80 characters)';
  end if;
  if p_group_type not in ('class', 'year_group', 'staff', 'ad_hoc') then
    raise exception 'Unknown group type';
  end if;
  if p_group_type = 'class' then
    if p_class_id is null then raise exception 'Choose a class'; end if;
    if not v_office and p_class_id not in (select public.teacher_class_ids(v_me)) then
      raise exception 'You can only make a group for a class you teach' using errcode = '42501';
    end if;
  elsif p_group_type = 'year_group' then
    if p_year_group_id is null then raise exception 'Choose a year group'; end if;
    if not v_office then
      raise exception 'Only the office can make a year group conversation' using errcode = '42501';
    end if;
  end if;
  if coalesce(array_length(p_member_ids, 1), 0) > 500 then
    raise exception 'A group can have at most 500 people';
  end if;
  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    if not public.can_add_group_member(v_id) then
      raise exception 'You cannot add one of the people you chose to a group' using errcode = '42501';
    end if;
    if p_group_type = 'staff' and public.message_member_kind(v_id) <> 'staff' then
      raise exception 'A staff group can only include staff';
    end if;
  end loop;

  insert into public.message_threads (kind, title, group_type, class_id, year_group_id, created_by, members_can_reply)
  values ('group', v_title, p_group_type,
          case when p_group_type = 'class' then p_class_id end,
          case when p_group_type = 'year_group' then p_year_group_id end,
          v_me, coalesce(p_members_can_reply, true))
  returning id into v_thread;

  perform public.group_add_member_unchecked(v_thread, v_me, true);

  if p_group_type = 'class' then
    if p_include_class_staff then
      for v_id in
        select distinct ur.user_id from public.user_roles ur
        where ur.role in ('teacher', 'teaching_assistant_cover')
          and p_class_id in (select public.teacher_class_ids(ur.user_id))
      loop
        perform public.group_add_member_unchecked(v_thread, v_id, false);
      end loop;
    end if;
    if p_include_parents then
      for v_id in
        select distinct c.parent_user_id from public.enrolments e join public.children c on c.id = e.child_id
        where e.class_id = p_class_id and c.parent_user_id is not null
      loop
        perform public.group_add_member_unchecked(v_thread, v_id, false);
      end loop;
    end if;
    if p_include_pupils then
      for v_id in
        select distinct sa.profile_id from public.enrolments e join public.student_accounts sa on sa.child_id = e.child_id
        where e.class_id = p_class_id and sa.profile_id is not null
      loop
        perform public.group_add_member_unchecked(v_thread, v_id, false);
      end loop;
    end if;
  elsif p_group_type = 'year_group' then
    if p_include_parents then
      for v_id in
        select distinct c.parent_user_id from public.children c
        where c.year_group_id = p_year_group_id and c.parent_user_id is not null
          and exists (select 1 from public.enrolments e where e.child_id = c.id)
      loop
        perform public.group_add_member_unchecked(v_thread, v_id, false);
      end loop;
    end if;
    if p_include_pupils then
      for v_id in
        select distinct sa.profile_id from public.children c join public.student_accounts sa on sa.child_id = c.id
        where c.year_group_id = p_year_group_id and sa.profile_id is not null
          and exists (select 1 from public.enrolments e where e.child_id = c.id)
      loop
        perform public.group_add_member_unchecked(v_thread, v_id, false);
      end loop;
    end if;
  end if;

  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    perform public.group_add_member_unchecked(v_thread, v_id, false);
  end loop;

  select count(*) into v_count from public.message_thread_members where thread_id = v_thread;
  if v_count < 2 then
    raise exception 'A group needs at least one other person in it';
  end if;
  return v_thread;
end;
$$;
revoke all on function public.create_message_group(text, text, uuid, uuid, boolean, boolean, boolean, uuid[], boolean) from public, anon;
grant execute on function public.create_message_group(text, text, uuid, uuid, boolean, boolean, boolean, uuid[], boolean) to authenticated;

-- Group admins (the creator, or staff they promote) and the office run a group.
create or replace function public.can_manage_group(p_thread_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.message_threads t where t.id = p_thread_id and t.kind = 'group')
    and (
      exists (select 1 from public.message_thread_members m
              where m.thread_id = p_thread_id and m.user_id = auth.uid() and m.is_admin)
      or (public.is_school_office() and public.group_member_role(p_thread_id, auth.uid()) is not distinct from 'staff')
      or public.current_has_role(array['head_teacher', 'admin'])
    ), false);
$$;
revoke all on function public.can_manage_group(uuid) from public, anon;
grant execute on function public.can_manage_group(uuid) to authenticated;

create or replace function public.message_group_add_members(p_thread_id uuid, p_member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type text;
  v_before int;
  v_after int;
begin
  if not public.can_manage_group(p_thread_id) then
    raise exception 'Only the group''s admins can add people' using errcode = '42501';
  end if;
  select t.group_type into v_type from public.message_threads t where t.id = p_thread_id;
  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    if not public.can_add_group_member(v_id) then
      raise exception 'You cannot add one of the people you chose to this group' using errcode = '42501';
    end if;
    if v_type = 'staff' and public.message_member_kind(v_id) <> 'staff' then
      raise exception 'A staff group can only include staff';
    end if;
  end loop;
  select count(*) into v_before from public.message_thread_members where thread_id = p_thread_id;
  if v_before + coalesce(array_length(p_member_ids, 1), 0) > 500 then
    raise exception 'A group can have at most 500 people';
  end if;
  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    perform public.group_add_member_unchecked(p_thread_id, v_id, false);
  end loop;
  select count(*) into v_after from public.message_thread_members where thread_id = p_thread_id;
  return v_after - v_before;
end;
$$;
revoke all on function public.message_group_add_members(uuid, uuid[]) from public, anon;
grant execute on function public.message_group_add_members(uuid, uuid[]) to authenticated;

-- Remove someone (admins), or leave (anyone). The last member of staff
-- cannot leave while parents or pupils are still in the group.
create or replace function public.message_group_remove_member(p_thread_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_user_id <> v_me and not public.can_manage_group(p_thread_id) then
    raise exception 'Only the group''s admins can remove people' using errcode = '42501';
  end if;
  if public.group_member_role(p_thread_id, p_user_id) = 'staff'
     and not exists (select 1 from public.message_thread_members m
                     where m.thread_id = p_thread_id and m.member_role = 'staff' and m.user_id <> p_user_id)
     and exists (select 1 from public.message_thread_members m
                 where m.thread_id = p_thread_id and m.member_role <> 'staff') then
    raise exception 'A group with parents or pupils in it must keep at least one member of staff';
  end if;
  delete from public.message_thread_members where thread_id = p_thread_id and user_id = p_user_id;
  -- Keep at least one admin among the staff left.
  if not exists (select 1 from public.message_thread_members m where m.thread_id = p_thread_id and m.is_admin) then
    update public.message_thread_members set is_admin = true
    where id = (select m.id from public.message_thread_members m
                where m.thread_id = p_thread_id and m.member_role = 'staff' order by m.added_at limit 1);
  end if;
end;
$$;
revoke all on function public.message_group_remove_member(uuid, uuid) from public, anon;
grant execute on function public.message_group_remove_member(uuid, uuid) to authenticated;

create or replace function public.message_group_update(p_thread_id uuid, p_title text, p_members_can_reply boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
begin
  if not public.can_manage_group(p_thread_id) then
    raise exception 'Only the group''s admins can change it' using errcode = '42501';
  end if;
  if v_title = '' or char_length(v_title) > 80 then
    raise exception 'Please give the group a name (up to 80 characters)';
  end if;
  update public.message_threads
     set title = v_title, members_can_reply = coalesce(p_members_can_reply, members_can_reply)
   where id = p_thread_id and kind = 'group';
end;
$$;
revoke all on function public.message_group_update(uuid, text, boolean) from public, anon;
grant execute on function public.message_group_update(uuid, text, boolean) to authenticated;

create or replace function public.message_group_set_admin(p_thread_id uuid, p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_group(p_thread_id) then
    raise exception 'Only the group''s admins can change admins' using errcode = '42501';
  end if;
  if public.group_member_role(p_thread_id, p_user_id) is distinct from 'staff' then
    raise exception 'Only staff can be group admins';
  end if;
  if not p_admin and not exists (select 1 from public.message_thread_members m
                                 where m.thread_id = p_thread_id and m.is_admin and m.user_id <> p_user_id) then
    raise exception 'A group needs at least one admin';
  end if;
  update public.message_thread_members set is_admin = p_admin
   where thread_id = p_thread_id and user_id = p_user_id;
end;
$$;
revoke all on function public.message_group_set_admin(uuid, uuid, boolean) from public, anon;
grant execute on function public.message_group_set_admin(uuid, uuid, boolean) to authenticated;

-- Groups are changed only through the functions above; record renames.
drop trigger if exists audit_message_threads on public.message_threads;
create trigger audit_message_threads
  after insert or update or delete on public.message_threads
  for each row execute function public.audit_row_change();

-- ── oversight: groups appear in the list (category 'group') ──────────────
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
      mt.id, mt.kind, mt.child_id, mt.created_at, mt.title, mt.created_by,
      coalesce(mt.teacher_id, mt.staff_a_id) as a_id,
      coalesce(mt.parent_id, mt.staff_b_id) as b_id
    from public.message_threads mt
  )
  select
    t.id,
    t.kind,
    case
      when t.kind = 'group' then 'group'
      when t.kind = 'parent_teacher' then 'staff_parent'
      when public.is_staff_member(t.a_id) and public.is_staff_member(t.b_id) then 'staff_staff'
      else 'staff_parent'
    end,
    case when t.kind = 'group' then t.title else pa.full_name end,
    case when t.kind = 'group' then 'Group'
         when public.is_staff_member(t.a_id) then 'Staff' else 'Parent' end,
    case when t.kind = 'group' then
           (select count(*)::text || ' members'
                   || coalesce(' (' || nullif(concat_ws(', ',
                        case when count(*) filter (where gm.member_role = 'parent') > 0 then count(*) filter (where gm.member_role = 'parent') || ' parents' end,
                        case when count(*) filter (where gm.member_role = 'pupil') > 0 then count(*) filter (where gm.member_role = 'pupil') || ' pupils' end), '') || ')', '')
              from public.message_thread_members gm where gm.thread_id = t.id)
         else pb.full_name end,
    case when t.kind = 'group' then 'Group'
         when public.is_staff_member(t.b_id) then 'Staff' else 'Parent' end,
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
