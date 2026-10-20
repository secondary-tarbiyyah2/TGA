-- Run via `supabase test db` (needs Docker; not runnable from a network-
-- restricted sandbox — see SETUP.md). Tests get_open_slots(), especially
-- across the UK autumn clock change, where a naive implementation storing
-- slots as a fixed UTC offset would silently shift local times by an hour.
begin;
select plan(3);

-- Fixed dates in 2030 so the test doesn't expire: open the booking window
-- that far ahead for this test only (rolled back at the end).
update public.meeting_types set max_days_ahead = 4000, min_notice_hours = 0 where key = 'admissions';

-- A staff member bookable for admissions, with a Mon 09:00–11:00 rule.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'staff-test@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'staff', 'Test Staff', 'staff-test@example.com');
insert into public.staff_members (id, profile_id, display_name, role_title, bookable) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Test Staff', 'Admissions', true);
insert into public.availability_rules (staff_id, meeting_type, weekday, start_time, end_time) values
  ('22222222-2222-2222-2222-222222222222', 'admissions', 1, '09:00', '11:00'); -- Monday

-- 2030-10-21 is a Monday well before the clock change (BST, UTC+1): 09:00
-- local should be 08:00 UTC.
select is(
  (select min(slot_start) from get_open_slots('admissions', '22222222-2222-2222-2222-222222222222', '2030-10-21', '2030-10-21')),
  '2030-10-21 08:00:00+00'::timestamptz,
  'BST Monday: first slot is 09:00 Europe/London = 08:00 UTC'
);

-- 2030-10-27 is the last Sunday of October 2030 — clocks go back to GMT
-- that night. 2030-10-28 is the first Monday fully in GMT (UTC+0): 09:00
-- local should now be 09:00 UTC, not 08:00 — proving the offset is resolved
-- per-date, not cached/fixed from before the change.
select is(
  (select min(slot_start) from get_open_slots('admissions', '22222222-2222-2222-2222-222222222222', '2030-10-28', '2030-10-28')),
  '2030-10-28 09:00:00+00'::timestamptz,
  'GMT Monday (after the clock change): first slot is 09:00 Europe/London = 09:00 UTC'
);

-- An existing confirmed booking for 09:00–09:20 should remove that slot
-- (and only that slot) from availability.
insert into public.bookings (meeting_type, staff_id, starts_at, ends_at, status, contact_name, contact_email)
values ('admissions', '22222222-2222-2222-2222-222222222222', '2030-10-28 09:00:00+00', '2030-10-28 09:20:00+00', 'confirmed', 'Existing Parent', 'existing@example.com');

select is(
  (select count(*)::int from get_open_slots('admissions', '22222222-2222-2222-2222-222222222222', '2030-10-28', '2030-10-28') where slot_start = '2030-10-28 09:00:00+00'),
  0,
  'a booked slot no longer appears in get_open_slots'
);

select * from finish();
rollback;
