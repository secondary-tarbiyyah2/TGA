-- Run via `supabase test db`. Covers 0087_open_evening_booking.sql: the public
-- list shows spaces left but never the join link, booking can never exceed
-- capacity, repeat bookings are refused, past/cancelled sessions cannot be
-- booked, and only staff can see bookings. (pgTAP is sequential, so the
-- "two parents race for the last seat" case rests on the row lock inside
-- open_evening_book(); this checks the capacity arithmetic around it.)
begin;
select plan(16);

insert into auth.users (id, email) values
  ('e8700000-0000-0000-0000-000000000001', 'adm-oe@example.com'),
  ('e8700000-0000-0000-0000-000000000002', 'parent-oe@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e8700000-0000-0000-0000-000000000001', 'staff', 'Ada Admissions', 'adm-oe@example.com'),
  ('e8700000-0000-0000-0000-000000000002', 'parent', 'Pat Parent', 'parent-oe@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8700000-0000-0000-0000-000000000001', 'admissions', 'none', null),
  ('e8700000-0000-0000-0000-000000000002', 'parent', 'none', null);

insert into public.open_evening_sessions (id, title, starts_at, ends_at, capacity, join_url) values
  ('f8700000-0000-0000-0000-000000000001', 'TEST open evening', now() + interval '10 days', now() + interval '10 days 1 hour', 5, 'https://example.com/join-secret'),
  ('f8700000-0000-0000-0000-000000000002', 'TEST past evening', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 5, null),
  ('f8700000-0000-0000-0000-000000000003', 'TEST cancelled evening', now() + interval '12 days', now() + interval '12 days 1 hour', 5, null);
update public.open_evening_sessions set cancelled_at = now() where id = 'f8700000-0000-0000-0000-000000000003';

select is((public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Pat Parent', 'Pat@Example.com', '07123 456789', 2, 'Year 4', 'Is there a scholarship?')->>'ok')::boolean, true, 'a valid booking succeeds');
select is((select email from public.open_evening_bookings where session_id = 'f8700000-0000-0000-0000-000000000001'), 'pat@example.com', 'the email is stored lower-case');
select is(public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Pat Again', 'pat@example.com', null, 1, 'Year 4', null)->>'error', 'already_booked', 'the same email cannot book a session twice');
select is(public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Big Family', 'big@example.com', null, 4, 'Years 1 and 2', null)->>'error', 'full', 'a booking that would exceed capacity is refused');
select is((public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Big Family', 'big@example.com', null, 4, 'Years 1 and 2', null)->>'seats_left')::int, 3, 'the refusal reports the real spaces left');
select is((public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Exact Fit', 'fit@example.com', null, 3, 'Year 6', null)->>'seats_left')::int, 0, 'booking the last seats succeeds and leaves none');
select is(public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Too Late', 'late@example.com', null, 1, 'Year 1', null)->>'error', 'full', 'a full session accepts nobody else');
select is(public.open_evening_book('f8700000-0000-0000-0000-000000000002', 'Past', 'past@example.com', null, 1, 'Year 1', null)->>'error', 'session_unavailable', 'a session that has started cannot be booked');
select is(public.open_evening_book('f8700000-0000-0000-0000-000000000003', 'Cancelled', 'cx@example.com', null, 1, 'Year 1', null)->>'error', 'session_unavailable', 'a cancelled session cannot be booked');
select is(public.open_evening_book('f8700000-0000-0000-0000-000000000001', '', 'not-an-email', null, 0, '', null)->>'error', 'validation', 'bad input is rejected');

set local role anon;
set local "request.jwt.claims" to '{}';
select is((select seats_left from public.open_evening_upcoming() where id = 'f8700000-0000-0000-0000-000000000001'), 0, 'the public list shows spaces left');
select is((select count(*)::int from public.open_evening_upcoming() where id in ('f8700000-0000-0000-0000-000000000002', 'f8700000-0000-0000-0000-000000000003')), 0, 'past and cancelled sessions are not listed');
select is((select count(*)::int from public.open_evening_sessions), 0, 'anonymous visitors cannot read sessions (the join link)');
select throws_ok($$select public.open_evening_book('f8700000-0000-0000-0000-000000000001', 'Bot', 'bot@example.com', null, 1, 'Year 1', null)$$, '42501', null, 'anonymous visitors cannot call the booking function directly');

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e8700000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.open_evening_bookings), 0, 'a parent cannot read bookings');

set local "request.jwt.claims" to '{"sub": "e8700000-0000-0000-0000-000000000001"}';
select is((select sum(attendees)::int from public.open_evening_bookings where status = 'confirmed'), 5, 'admissions staff can read bookings');

select * from finish();
rollback;
