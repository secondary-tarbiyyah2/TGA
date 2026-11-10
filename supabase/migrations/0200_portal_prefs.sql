-- Portal navigation (owner, Nov 2026: "easier to navigate ... categorise things
-- better and maybe make it dropdown"). Each person's own menu preferences: the
-- pages they pinned to the top of the menu and which menu categories they keep
-- open, so both follow them to any device. One row per person; nobody else can
-- read or change it. No personal data beyond page addresses.

create table if not exists public.portal_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pinned_pages text[] not null default '{}',
  nav_open text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint portal_prefs_pins_small check (cardinality(pinned_pages) <= 12),
  constraint portal_prefs_open_small check (cardinality(nav_open) <= 60)
);

alter table public.portal_prefs enable row level security;

drop policy if exists "portal_prefs: own row" on public.portal_prefs;
create policy "portal_prefs: own row"
  on public.portal_prefs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.portal_prefs from anon;
grant select, insert, update, delete on public.portal_prefs to authenticated;
