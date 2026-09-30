-- Backs two things: (1) the safeguarding lead actually being emailed when
-- a message gets flagged (0013's keyword-match trigger only ever set a
-- flag column no one was alerted to — a flagged message could sit unseen
-- until someone happened to open Compliance), and (2) the admin top-bar
-- notification bell's per-user "read" state, so it behaves like a real
-- notification centre rather than re-showing the same live counts forever.

-- Idempotency marker for notify-flagged-messages (Edge Function, run on a
-- schedule like every other alert in this codebase) — nullable, set once
-- an email has actually gone out for this message, so a message is never
-- alerted on twice even if the function's polling window overlaps runs.
alter table public.message_thread_messages
  add column flagged_notified_at timestamptz;

-- One row per admin-ish user, tracking when they last opened the
-- notification bell. Unread count = signals (flagged messages,
-- outstanding signatures, absence alerts) newer than this timestamp —
-- computed client-side from tables that already exist (see
-- NotificationBell.tsx), never duplicated into a separate notifications
-- table that could drift from the real data.
create table public.notification_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.notification_reads enable row level security;

create policy "notification_reads: own row only"
  on public.notification_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
