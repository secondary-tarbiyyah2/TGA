-- Transparent bursary seats: an admin-editable count of bursary/scholarship
-- seats for the year, published openly rather than handled quietly on
-- request.
--
-- Same "no placeholder, hidden until real" pattern as year_groups.capacity
-- (0019_year_group_capacity.sql): capacity is nullable with no default, and
-- the public view only ever shows a value once an admin has actually set
-- one. Unset stays invisible, never a placeholder like "0" or "TBC".
--
-- This is a singleton settings row rather than its own concept-heavy
-- table because there is currently nothing to compute a "used" count
-- from (no bursary-application data model exists yet) — just the number
-- of seats on offer this year, set directly by an admin.
create table public.site_settings (
  id boolean primary key default true check (id),
  bursary_seats int check (bursary_seats is null or bursary_seats > 0),
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (true);

alter table public.site_settings enable row level security;

create policy "site_settings: staff/admin read"
  on public.site_settings for select
  using (public.current_role_is(array['staff','admin']));

create policy "site_settings: admin update"
  on public.site_settings for update
  using (public.current_role_is(array['admin']))
  with check (public.current_role_is(array['admin']));

-- Public read: only the bursary seat count, and only once set — mirrors
-- public.year_group_places' privacy shape (no other settings exposed).
create view public.bursary_seats_public as
  select bursary_seats
  from public.site_settings
  where bursary_seats is not null;

grant select on public.bursary_seats_public to anon, authenticated;
