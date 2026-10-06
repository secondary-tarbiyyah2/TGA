-- 0087: open-evening sessions and bookings.
--
-- The public "Virtual open evening" page used to say "email us to register".
-- Now the school creates sessions (date/time, capacity, join link,
-- description) in the admin portal, the public page lists the upcoming ones
-- with live spaces left, and parents book a place.
--
--   open_evening_sessions  Created and edited by Headteacher/Admin/Admissions.
--                          NOT readable by anon: it holds the join link, which
--                          goes only in the confirmation email. The public
--                          page reads open_evening_upcoming() instead, which
--                          returns the safe subset plus spaces left.
--   open_evening_bookings  One row per booking (attendee count, year groups,
--                          questions). Readable and cancellable by
--                          Headteacher/Admin/Admissions only. There is no
--                          client INSERT policy at all.
--   open_evening_book()    The only way to create a booking. SECURITY
--                          DEFINER: locks the session row, checks the session
--                          is still open and in the future, rejects a repeat
--                          booking by the same email, and rejects anything
--                          that would take the total attendees over capacity,
--                          so two parents booking the last seats at once can
--                          never overbook. Executable by service_role ONLY:
--                          the public entry point is the open-evening-book
--                          Edge Function, which adds the honeypot, minimum
--                          fill-in time, per-IP/per-email rate limit and the
--                          emails (granting it to anon would let a script
--                          skip all of that).
--
-- Idempotent: safe to re-run. audit_row_change() reads NEW/OLD.id, so the
-- audited table has a surrogate id; bookings are deliberately NOT audited
-- (the audit log copies whole rows and these hold parents' contact details).

create table if not exists public.open_evening_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Virtual open evening' check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 1000),
  join_url text check (join_url is null or join_url ~* '^https://'),
  published boolean not null default true,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint open_evening_sessions_time_valid check (ends_at > starts_at)
);

create index if not exists open_evening_sessions_starts_idx on public.open_evening_sessions (starts_at);

create table if not exists public.open_evening_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.open_evening_sessions(id) on delete cascade,
  parent_name text not null check (char_length(parent_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 40),
  attendees int not null check (attendees between 1 and 6),
  year_groups text not null check (char_length(year_groups) between 1 and 200),
  questions text check (questions is null or char_length(questions) <= 2000),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  ip_hash text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  confirmation_sent_at timestamptz,
  reminder_sent_at timestamptz
);

create index if not exists open_evening_bookings_session_idx on public.open_evening_bookings (session_id, status);
create unique index if not exists open_evening_bookings_one_per_email_key
  on public.open_evening_bookings (session_id, lower(email)) where status = 'confirmed';

alter table public.open_evening_sessions enable row level security;
alter table public.open_evening_bookings enable row level security;

drop policy if exists "open_evening_sessions: staff read" on public.open_evening_sessions;
create policy "open_evening_sessions: staff read"
  on public.open_evening_sessions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "open_evening_sessions: staff insert" on public.open_evening_sessions;
create policy "open_evening_sessions: staff insert"
  on public.open_evening_sessions for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "open_evening_sessions: staff update" on public.open_evening_sessions;
create policy "open_evening_sessions: staff update"
  on public.open_evening_sessions for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

-- No delete policy: a session with bookings is cancelled (cancelled_at), not removed.

drop policy if exists "open_evening_bookings: staff read" on public.open_evening_bookings;
create policy "open_evening_bookings: staff read"
  on public.open_evening_bookings for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "open_evening_bookings: staff update" on public.open_evening_bookings;
create policy "open_evening_bookings: staff update"
  on public.open_evening_bookings for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

-- No insert or delete policy on bookings (insert only via open_evening_book()).

drop trigger if exists audit_open_evening_sessions on public.open_evening_sessions;
create trigger audit_open_evening_sessions
  after insert or update or delete on public.open_evening_sessions
  for each row execute function public.audit_row_change();

create or replace function public.open_evening_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists open_evening_sessions_touch_trg on public.open_evening_sessions;
create trigger open_evening_sessions_touch_trg
  before update on public.open_evening_sessions
  for each row execute function public.open_evening_touch();

-- ── Public list: upcoming, published sessions with spaces left. ─────────────
-- No join link, no booker details.
create or replace function public.open_evening_upcoming()
returns table (id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, capacity int, seats_left int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.description, s.starts_at, s.ends_at, s.capacity,
         greatest(
           s.capacity - coalesce((select sum(b.attendees) from public.open_evening_bookings b where b.session_id = s.id and b.status = 'confirmed'), 0),
           0
         )::int as seats_left
  from public.open_evening_sessions s
  where s.published
    and s.cancelled_at is null
    and s.starts_at > now()
  order by s.starts_at;
$$;

revoke all on function public.open_evening_upcoming() from public;
grant execute on function public.open_evening_upcoming() to anon, authenticated;

-- ── Booking (service_role only; see header). Returns jsonb: ───────────────
--   {"ok": true,  "booking_id": "...", "seats_left": n}
--   {"ok": false, "error": "validation", "fields": ["email", ...]}
--   {"ok": false, "error": "session_unavailable" | "already_booked" | "full", "seats_left": n}
create or replace function public.open_evening_book(
  p_session_id uuid,
  p_parent_name text,
  p_email text,
  p_phone text,
  p_attendees int,
  p_year_groups text,
  p_questions text,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.open_evening_sessions;
  v_name text := btrim(coalesce(p_parent_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_years text := btrim(coalesce(p_year_groups, ''));
  v_questions text := nullif(btrim(coalesce(p_questions, '')), '');
  v_fields text[] := '{}';
  v_taken int;
  v_id uuid;
begin
  if v_name = '' or char_length(v_name) > 120 then v_fields := array_append(v_fields, 'parentName'); end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_fields := array_append(v_fields, 'email'); end if;
  if v_phone is not null and char_length(v_phone) > 40 then v_fields := array_append(v_fields, 'phone'); end if;
  if p_attendees is null or p_attendees < 1 or p_attendees > 6 then v_fields := array_append(v_fields, 'attendees'); end if;
  if v_years = '' or char_length(v_years) > 200 then v_fields := array_append(v_fields, 'yearGroups'); end if;
  if v_questions is not null and char_length(v_questions) > 2000 then v_fields := array_append(v_fields, 'questions'); end if;
  if array_length(v_fields, 1) is not null then
    return jsonb_build_object('ok', false, 'error', 'validation', 'fields', to_jsonb(v_fields));
  end if;

  -- Serialise all bookings for this session: the count below is only
  -- trustworthy while nobody else can insert between it and our insert.
  select * into s from public.open_evening_sessions where id = p_session_id for update;
  if not found or not s.published or s.cancelled_at is not null or s.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'session_unavailable');
  end if;

  select coalesce(sum(b.attendees), 0)::int into v_taken
  from public.open_evening_bookings b
  where b.session_id = s.id and b.status = 'confirmed';

  if exists (
    select 1 from public.open_evening_bookings b
    where b.session_id = s.id and b.status = 'confirmed' and lower(b.email) = v_email
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_booked', 'seats_left', greatest(s.capacity - v_taken, 0));
  end if;

  if v_taken + p_attendees > s.capacity then
    return jsonb_build_object('ok', false, 'error', 'full', 'seats_left', greatest(s.capacity - v_taken, 0));
  end if;

  insert into public.open_evening_bookings (session_id, parent_name, email, phone, attendees, year_groups, questions, ip_hash)
  values (s.id, v_name, v_email, v_phone, p_attendees, v_years, v_questions, p_ip_hash)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'booking_id', v_id, 'seats_left', s.capacity - v_taken - p_attendees);
end;
$$;

revoke all on function public.open_evening_book(uuid, text, text, text, int, text, text, text) from public, anon, authenticated;
grant execute on function public.open_evening_book(uuid, text, text, text, int, text, text, text) to service_role;
