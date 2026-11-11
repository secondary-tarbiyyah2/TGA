-- 0205: messages, part 2 (owner feedback 11 Nov 2026, item 3): email
-- notifications with a daily digest option, mute, "delivered", and
-- attachments uploaded by staff only.
--
--   * message_prefs.email_mode: 'immediate' (default; at most one email per
--     conversation every 30 minutes, only while it is unread), 'daily' (one
--     summary a day) or 'off'. Sent by the message-email Edge Function to the
--     person's registered email, whatever their role. Pupils' sign-in
--     addresses are internal and never mailed (_shared/resend.ts).
--   * message_thread_mutes: the person's own muted conversations. Muted
--     conversations are never emailed or pushed; they still count as unread.
--   * message_email_log: who was emailed about what (service role only), so
--     nobody is emailed twice inside the throttle window.
--   * thread_delivered + mark_messages_delivered(): "delivered" means the
--     person's portal has fetched their conversations since the message was
--     sent. thread_delivery() gives the sender each recipient's time, only for
--     people who can see the sender's messages (0204's message_visible_to).
--   * Attachments: only staff may upload or attach files (restrictive
--     policies added on top of 0204's), the same rule as the school's other
--     upload buckets (homework attachments, documents). Parents and pupils can
--     still open files sent to them.

-- ── email settings ──────────────────────────────────────────────────────
alter table public.message_prefs
  add column if not exists email_mode text not null default 'immediate';
alter table public.message_prefs drop constraint if exists message_prefs_email_mode_check;
alter table public.message_prefs
  add constraint message_prefs_email_mode_check check (email_mode in ('immediate', 'daily', 'off'));

create table if not exists public.message_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid references public.message_threads(id) on delete cascade,
  kind text not null check (kind in ('immediate', 'daily')),
  sent_at timestamptz not null default now()
);
create index if not exists message_email_log_user_idx on public.message_email_log (user_id, kind, sent_at desc);
create index if not exists message_email_log_thread_idx on public.message_email_log (thread_id, user_id, sent_at desc);
alter table public.message_email_log enable row level security;
-- No policies: only the Edge Function (service role) reads and writes it.
revoke all on public.message_email_log from anon, authenticated;

-- ── mute ────────────────────────────────────────────────────────────────
create table if not exists public.message_thread_mutes (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);
alter table public.message_thread_mutes enable row level security;
revoke all on public.message_thread_mutes from anon;

drop policy if exists "message_thread_mutes: read own" on public.message_thread_mutes;
create policy "message_thread_mutes: read own" on public.message_thread_mutes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "message_thread_mutes: add own" on public.message_thread_mutes;
create policy "message_thread_mutes: add own" on public.message_thread_mutes
  for insert to authenticated
  with check (user_id = auth.uid() and public.thread_participant(thread_id, auth.uid()));
drop policy if exists "message_thread_mutes: remove own" on public.message_thread_mutes;
create policy "message_thread_mutes: remove own" on public.message_thread_mutes
  for delete to authenticated using (user_id = auth.uid());

-- ── delivered ───────────────────────────────────────────────────────────
create table if not exists public.thread_delivered (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);
alter table public.thread_delivered enable row level security;
-- No policies: written by mark_messages_delivered(), read by thread_delivery().
revoke all on public.thread_delivered from anon, authenticated;

create or replace function public.mark_messages_delivered()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  insert into public.thread_delivered (user_id, thread_id, delivered_at)
  select v_uid, t.id, now()
  from public.message_threads t
  where public.thread_participant(t.id, v_uid)
  on conflict (user_id, thread_id) do update set delivered_at = excluded.delivered_at;
end;
$$;

-- For the caller's own messages in a thread: when each person who can see
-- them last had their conversations delivered. With receipts off, nothing
-- (the 0058 rule: you neither send nor see receipts).
create or replace function public.thread_delivery(p_thread_id uuid)
returns table (user_id uuid, delivered_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.thread_participant(p_thread_id, v_uid) then return; end if;
  if not coalesce((select p.read_receipts_enabled from public.message_prefs p where p.user_id = v_uid), true) then return; end if;
  return query
  with people as (
    select unnest(array[t.parent_id, t.teacher_id, t.staff_a_id, t.staff_b_id]) as uid
    from public.message_threads t where t.id = p_thread_id
    union
    select gm.user_id from public.message_thread_members gm where gm.thread_id = p_thread_id
  )
  select pe.uid, d.delivered_at
  from people pe
  join public.thread_delivered d on d.user_id = pe.uid and d.thread_id = p_thread_id
  where pe.uid is not null and pe.uid <> v_uid
    and public.message_visible_to(p_thread_id, v_uid, pe.uid);
end;
$$;

revoke all on function public.mark_messages_delivered() from public, anon;
revoke all on function public.thread_delivery(uuid) from public, anon;
grant execute on function public.mark_messages_delivered() to authenticated;
grant execute on function public.thread_delivery(uuid) to authenticated;

-- ── attachments: staff upload only ──────────────────────────────────────
drop policy if exists "message_attachments: staff only add" on public.message_attachments;
create policy "message_attachments: staff only add"
  on public.message_attachments
  as restrictive
  for insert
  to authenticated
  with check (public.is_staff_member(auth.uid()));

drop policy if exists "message-attachments: staff only upload" on storage.objects;
create policy "message-attachments: staff only upload"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (bucket_id <> 'message-attachments' or public.is_staff_member(auth.uid()));
