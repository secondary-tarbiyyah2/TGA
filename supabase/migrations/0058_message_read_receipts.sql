-- Read receipts for /learn messaging (WhatsApp rules).
--   * message_prefs: per-user read_receipts_enabled (default ON).
--   * message_reads: who read which message and when. NO direct table access
--     (RLS on, no policies); written only by mark_thread_read(), read only
--     through thread_receipts().
--   * thread_last_seen: the user's OWN per-thread "seen up to" marker, used for
--     unread badges. Separate from receipts: always kept, even if receipts are off.
-- Rule: if you turn receipts off you neither send nor see read receipts.
-- Headteacher/admin/safeguarding oversight RPCs and audit are untouched; the
-- participant-only functions below also never admit a non-participant (so never
-- a student, who cannot be in any thread — see 0013 shape constraint).
-- "Delivered" (double grey tick) is deliberately not modelled: sent and read only.

create table public.message_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  read_receipts_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.message_prefs enable row level security;

create policy "message_prefs: read own" on public.message_prefs
  for select to authenticated using (user_id = auth.uid());
create policy "message_prefs: insert own" on public.message_prefs
  for insert to authenticated with check (user_id = auth.uid());
create policy "message_prefs: update own" on public.message_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.message_reads (
  message_id uuid not null references public.message_thread_messages(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, reader_id)
);
alter table public.message_reads enable row level security;
-- Intentionally no policies: nobody reads or writes this table directly.
revoke all on public.message_reads from anon, authenticated;

create table public.thread_last_seen (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);
alter table public.thread_last_seen enable row level security;
create policy "thread_last_seen: read own" on public.thread_last_seen
  for select to authenticated using (user_id = auth.uid());
-- Writes only via mark_thread_read().
revoke insert, update, delete on public.thread_last_seen from anon, authenticated;

-- Existing messages count as already seen at rollout (no sudden unread flood).
insert into public.thread_last_seen (user_id, thread_id, seen_at)
select u.uid, t.id, now()
from public.message_threads t
cross join lateral (values (t.parent_id), (t.teacher_id), (t.staff_a_id), (t.staff_b_id)) as u(uid)
where u.uid is not null
on conflict do nothing;

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
  if public.current_has_role(array['student']) then raise exception 'not allowed'; end if;
  if not public.thread_participant(p_thread_id, v_uid) then raise exception 'not a participant'; end if;

  -- Own unread marker: always kept.
  insert into public.thread_last_seen (user_id, thread_id, seen_at)
  values (v_uid, p_thread_id, now())
  on conflict (user_id, thread_id) do update set seen_at = excluded.seen_at;

  select coalesce((select read_receipts_enabled from public.message_prefs where user_id = v_uid), true) into v_on;
  if v_on then
    insert into public.message_reads (message_id, reader_id)
    select m.id, v_uid
    from public.message_thread_messages m
    where m.thread_id = p_thread_id and m.sender_id <> v_uid and m.recalled_at is null
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.thread_receipts(p_thread_id uuid)
returns table (message_id uuid, read_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.thread_participant(p_thread_id, v_uid) then
    return;
  end if;
  -- Caller has receipts off: sees none (WhatsApp rule).
  if not coalesce((select p.read_receipts_enabled from public.message_prefs p where p.user_id = v_uid), true) then
    return;
  end if;
  -- Only the caller's own messages; read_at only if the reader also has receipts on.
  return query
  select m.id, r.read_at
  from public.message_thread_messages m
  left join public.message_reads r
    on r.message_id = m.id and r.reader_id <> v_uid
   and coalesce((select p.read_receipts_enabled from public.message_prefs p where p.user_id = r.reader_id), true)
  where m.thread_id = p_thread_id and m.sender_id = v_uid and m.recalled_at is null;
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
  group by t.id;
$$;

revoke all on function public.mark_thread_read(uuid), public.thread_receipts(uuid), public.thread_unread_counts() from public, anon;
grant execute on function public.mark_thread_read(uuid), public.thread_receipts(uuid), public.thread_unread_counts() to authenticated;
