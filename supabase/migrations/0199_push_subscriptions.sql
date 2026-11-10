-- 0199: phone and browser notifications (Web Push) for the portal.
--
-- Audit flaw 8 (10 November 2026): the portal only emailed, so families had
-- no reason to open the app and missed messages. A device that turns on
-- notifications stores its push subscription here; the push-notify Edge
-- Function sends to it (first use: a new message in a conversation).
--
-- Own rows only: a user can add, see and remove the subscriptions of their
-- own devices. The service role (the function) reads them to send.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: own read" on public.push_subscriptions;
create policy "push_subscriptions: own read" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_subscriptions: own add" on public.push_subscriptions;
create policy "push_subscriptions: own add" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push_subscriptions: own remove" on public.push_subscriptions;
create policy "push_subscriptions: own remove" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.push_subscriptions from anon;
