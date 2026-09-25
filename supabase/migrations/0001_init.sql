-- Tarbiyyah Global Academy — booking engine schema (Prompt 3).
-- Every table has RLS enabled; default deny (no policy = no access) except
-- where a policy explicitly grants it. Booking rows are only ever written by
-- Edge Functions using the service-role key, which bypasses RLS entirely —
-- so most tables intentionally have no INSERT policy for anon/authenticated.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- exclusion constraint on bookings
create extension if not exists pg_cron;    -- scheduled reminders
create extension if not exists pg_net;     -- cron -> edge function HTTP calls

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per auth.users id. Created by an Edge Function (staff invite,
-- or a booking flow that creates a parent profile), never by client insert.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'student', 'staff', 'admin')),
  full_name text not null,
  email text not null,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: staff/admin read all"
  on public.profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('staff', 'admin')
  ));

create policy "profiles: update own row"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── families ─────────────────────────────────────────────────────────────
create table public.families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (family_id, profile_id)
);

alter table public.family_members enable row level security;

create policy "family_members: read own membership"
  on public.family_members for select
  using (profile_id = auth.uid());

create policy "family_members: staff/admin read all"
  on public.family_members for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin')
  ));

create policy "families: members read own family"
  on public.families for select
  using (exists (
    select 1 from public.family_members fm
    where fm.family_id = families.id and fm.profile_id = auth.uid()
  ));

create policy "families: staff/admin read all"
  on public.families for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin')
  ));

-- ── students ─────────────────────────────────────────────────────────────
create table public.students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  year_group text not null,
  school_email text,
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;

create policy "students: family members read own children"
  on public.students for select
  using (exists (
    select 1 from public.family_members fm
    where fm.family_id = students.family_id and fm.profile_id = auth.uid()
  ));

create policy "students: staff/admin read all"
  on public.students for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin')
  ));

-- ── staff_members ────────────────────────────────────────────────────────
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null,
  role_title text not null,
  bookable boolean not null default false,
  teams_meeting_url text,
  created_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;

create policy "staff_members: self read own row"
  on public.staff_members for select
  using (profile_id = auth.uid());

create policy "staff_members: staff/admin read all"
  on public.staff_members for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin')
  ));

create policy "staff_members: self update own availability fields"
  on public.staff_members for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Public, minimal read of bookable staff (name/role only) for the booking
-- UI to show "who you'll speak to" — never exposes the base table's RLS-
-- restricted rows to anon, just this narrow view.
create view public.bookable_staff as
  select id, display_name, role_title
  from public.staff_members
  where bookable = true;

grant select on public.bookable_staff to anon, authenticated;

-- ── meeting_types ────────────────────────────────────────────────────────
create table public.meeting_types (
  key text primary key check (key in ('admissions', 'parent_meeting')),
  duration_min int not null check (duration_min > 0),
  buffer_min int not null default 0 check (buffer_min >= 0),
  min_notice_hours int not null default 12 check (min_notice_hours >= 0),
  max_days_ahead int not null default 60 check (max_days_ahead > 0),
  public boolean not null default false
);

alter table public.meeting_types enable row level security;

create policy "meeting_types: anyone reads public rows"
  on public.meeting_types for select
  using (public = true);

create policy "meeting_types: staff/admin read all"
  on public.meeting_types for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin')
  ));

insert into public.meeting_types (key, duration_min, buffer_min, min_notice_hours, max_days_ahead, public) values
  ('admissions', 20, 10, 12, 60, true),
  ('parent_meeting', 15, 5, 24, 30, false);

-- ── availability_rules / availability_exceptions ────────────────────────
-- Never exposed directly to anon: get_open_slots() (below) is the only way
-- availability is queried by the public booking page, and it returns times
-- only, never these rows.
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  meeting_type text not null references public.meeting_types(key),
  weekday int not null check (weekday between 0 and 6), -- 0 = Sunday, per extract(dow from ...)
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint availability_rules_time_valid check (end_time > start_time)
);

alter table public.availability_rules enable row level security;

create policy "availability_rules: owning staff manage own"
  on public.availability_rules for all
  using (exists (
    select 1 from public.staff_members sm
    where sm.id = availability_rules.staff_id and sm.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.staff_members sm
    where sm.id = availability_rules.staff_id and sm.profile_id = auth.uid()
  ));

create policy "availability_rules: admin manage all"
  on public.availability_rules for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  date date not null,
  start_time time, -- null with blocked=true means the whole day is blocked
  end_time time,
  blocked boolean not null default true, -- true = unavailable, false = extra hours added
  created_at timestamptz not null default now(),
  constraint availability_exceptions_time_pair check (
    (start_time is null and end_time is null) or
    (start_time is not null and end_time is not null and end_time > start_time)
  )
);

alter table public.availability_exceptions enable row level security;

create policy "availability_exceptions: owning staff manage own"
  on public.availability_exceptions for all
  using (exists (
    select 1 from public.staff_members sm
    where sm.id = availability_exceptions.staff_id and sm.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.staff_members sm
    where sm.id = availability_exceptions.staff_id and sm.profile_id = auth.uid()
  ));

create policy "availability_exceptions: admin manage all"
  on public.availability_exceptions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── bookings ─────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  meeting_type text not null references public.meeting_types(key),
  staff_id uuid not null references public.staff_members(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  contact_name text,
  contact_email text,
  contact_phone text,
  parent_profile_id uuid references public.profiles(id),
  student_id uuid references public.students(id),
  notes text,
  teams_join_url text,
  manage_token_hash text,
  created_at timestamptz not null default now(),
  constraint bookings_time_valid check (ends_at > starts_at)
);

-- The actual double-booking guard: Postgres enforces this atomically at
-- commit time, so two concurrent inserts for an overlapping slot can never
-- both succeed — the second always fails with a 23P01 exclusion violation,
-- regardless of any application-level "is it free?" check racing against it.
-- This is what "exactly one of two parallel requests succeeds" (the double-
-- booking race requirement) actually rests on — see supabase/tests/README.md
-- for how to verify it, since a real concurrency race isn't something a
-- pgTAP test can exercise meaningfully.
alter table public.bookings
  add constraint bookings_no_staff_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled');

alter table public.bookings enable row level security;

create policy "bookings: parent reads own bookings"
  on public.bookings for select
  using (parent_profile_id = auth.uid());

create policy "bookings: staff reads own assigned bookings"
  on public.bookings for select
  using (exists (
    select 1 from public.staff_members sm
    where sm.id = bookings.staff_id and sm.profile_id = auth.uid()
  ));

create policy "bookings: admin reads all"
  on public.bookings for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "bookings: staff/admin update own/all (outcome, notes)"
  on public.bookings for update
  using (
    exists (select 1 from public.staff_members sm where sm.id = bookings.staff_id and sm.profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.staff_members sm where sm.id = bookings.staff_id and sm.profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- No INSERT policy for anon/authenticated: every booking is created by an
-- Edge Function using the service-role key (which bypasses RLS), after that
-- function has run its own validation, spam checks and slot re-check inside
-- a transaction. This is deliberate, not an oversight.

-- ── rate limiting (for the booking Edge Function's spam protection) ────
create table public.booking_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.booking_attempts enable row level security;
-- No policies at all: only the service role (Edge Functions) ever touches
-- this table; RLS with zero policies means zero access for anon/authenticated.

create index booking_attempts_ip_hash_idx on public.booking_attempts (ip_hash, created_at);
create index booking_attempts_email_idx on public.booking_attempts (email, created_at);

-- ── get_open_slots RPC ───────────────────────────────────────────────────
-- SECURITY DEFINER so it can read availability_rules/exceptions/bookings
-- (all RLS-restricted to staff/admin) while returning only start/end times —
-- never staff availability rows, never other bookings' details. Grantable
-- to anon for the public admissions booking page.
--
-- Timezone correctness: rule times are stored as plain `time` (civil, no
-- timezone) meant to represent Europe/London wall-clock hours. Combining a
-- specific `date` with that `time` and casting `AT TIME ZONE 'Europe/London'`
-- resolves the correct UTC instant for THAT date — i.e. it is BST/GMT-correct
-- per-day, which is exactly what's needed across a UK clock-change boundary
-- (a rule of "09:00–15:00" stays 09:00–15:00 local time on both sides of the
-- change, even though the UTC offset shifts). See supabase/tests/database
-- for a test spanning a clock-change date.
create or replace function public.get_open_slots(
  p_meeting_type text,
  p_staff_id uuid,
  p_from date,
  p_to date
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration_min int;
  v_buffer_min int;
  v_min_notice_hours int;
  v_max_days_ahead int;
  v_now timestamptz := now();
  v_last_day date;
  v_day date;
  v_step interval;
  v_window tstzmultirange;
  v_extra tstzmultirange;
  v_blocked tstzmultirange;
  v_booked tstzmultirange;
  v_range tstzrange;
  v_cursor timestamptz;
begin
  select duration_min, buffer_min, min_notice_hours, max_days_ahead
    into v_duration_min, v_buffer_min, v_min_notice_hours, v_max_days_ahead
  from public.meeting_types
  where key = p_meeting_type;

  if v_duration_min is null then
    raise exception 'unknown meeting_type: %', p_meeting_type;
  end if;

  v_step := (v_duration_min + v_buffer_min) * interval '1 minute';
  v_last_day := least(p_to, (v_now::date + v_max_days_ahead));
  v_day := greatest(p_from, v_now::date);

  while v_day <= v_last_day loop
    -- Base availability windows for this day, from the staff member's
    -- weekly rules matching this weekday (0 = Sunday, matches extract(dow)).
    select coalesce(
      tstzmultirange(coalesce(array_agg(
        tstzrange(
          (v_day + r.start_time) at time zone 'Europe/London',
          (v_day + r.end_time) at time zone 'Europe/London'
        )
      ), array[]::tstzrange[])),
      '{}'::tstzmultirange
    )
    into v_window
    from public.availability_rules r
    where r.staff_id = p_staff_id
      and r.meeting_type = p_meeting_type
      and r.weekday = extract(dow from v_day)::int;

    -- Extra hours added for this specific date.
    select coalesce(
      tstzmultirange(coalesce(array_agg(
        tstzrange(
          (v_day + e.start_time) at time zone 'Europe/London',
          (v_day + e.end_time) at time zone 'Europe/London'
        )
      ), array[]::tstzrange[])),
      '{}'::tstzmultirange
    )
    into v_extra
    from public.availability_exceptions e
    where e.staff_id = p_staff_id and e.date = v_day and e.blocked = false;

    v_window := v_window + v_extra;

    -- Blocked time removed for this specific date (whole day if start/end null).
    select coalesce(
      tstzmultirange(coalesce(array_agg(
        case
          when e.start_time is null then tstzrange(v_day::timestamp at time zone 'Europe/London', (v_day + 1)::timestamp at time zone 'Europe/London')
          else tstzrange((v_day + e.start_time) at time zone 'Europe/London', (v_day + e.end_time) at time zone 'Europe/London')
        end
      ), array[]::tstzrange[])),
      '{}'::tstzmultirange
    )
    into v_blocked
    from public.availability_exceptions e
    where e.staff_id = p_staff_id and e.date = v_day and e.blocked = true;

    v_window := v_window - v_blocked;

    -- Existing non-cancelled bookings for this staff member overlapping the day.
    select coalesce(
      tstzmultirange(coalesce(array_agg(tstzrange(b.starts_at, b.ends_at)), array[]::tstzrange[])),
      '{}'::tstzmultirange
    )
    into v_booked
    from public.bookings b
    where b.staff_id = p_staff_id
      and b.status <> 'cancelled'
      and b.starts_at < (v_day + 1)::timestamp at time zone 'Europe/London'
      and b.ends_at > v_day::timestamp at time zone 'Europe/London';

    v_window := v_window - v_booked;

    -- Step through each contiguous free range, emitting slots of exactly
    -- v_duration_min, spaced v_step apart, that fully fit inside the range.
    for v_range in select unnest(v_window) loop
      v_cursor := lower(v_range);
      while v_cursor + (v_duration_min * interval '1 minute') <= upper(v_range) loop
        if v_cursor >= v_now + (v_min_notice_hours * interval '1 hour') then
          slot_start := v_cursor;
          slot_end := v_cursor + (v_duration_min * interval '1 minute');
          return next;
        end if;
        v_cursor := v_cursor + v_step;
      end loop;
    end loop;

    v_day := v_day + 1;
  end loop;
end;
$$;

grant execute on function public.get_open_slots(text, uuid, date, date) to anon, authenticated;

-- ── reminders: scheduled 24h and 1h before a confirmed booking ─────────
-- pg_cron fires every 15 minutes; the Edge Function itself is idempotent
-- (checks a `reminder_24h_sent_at`/`reminder_1h_sent_at` column) so a 15-
-- minute cron granularity is fine for a "roughly 24h / 1h before" reminder.
--
-- The cron.schedule() call itself is NOT in this migration: it needs the
-- project's own Edge Function URL and service-role key, which are secrets
-- that must never sit in a file committed to git. Supabase's documented
-- pattern for this is to store them in Vault (Studio has a dedicated,
-- secure UI for this — Project Settings > Vault) and reference them by
-- name from the cron job. See SETUP.md for the exact one-time SQL to paste
-- into the Studio SQL Editor once Vault holds those two secrets.
alter table public.bookings add column reminder_24h_sent_at timestamptz;
alter table public.bookings add column reminder_1h_sent_at timestamptz;
