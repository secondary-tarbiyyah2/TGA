-- Run via `supabase test db`. Covers 0073_digest_houses.sql: parents manage
-- only their own digest preference, the digest log is head/admin read-only,
-- houses are readable by everyone but editable only by head/admin, and
-- house_standings() adds merits automatically (ignoring voided merits and
-- demerits), adds admin bonus points, flags the caller's own house and
-- refuses admissions-only staff.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('e7300000-0000-0000-0000-000000000001', 'ht-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000002', 'teacher-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000003', 'parent-a-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000004', 'parent-b-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000005', 'outsider-dh@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e7300000-0000-0000-0000-000000000001', 'admin', 'HT DH', 'ht-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000002', 'teacher', 'Teacher DH', 'teacher-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000003', 'parent', 'Parent A DH', 'parent-a-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000004', 'parent', 'Parent B DH', 'parent-b-dh@example.com'),
  ('e7300000-0000-0000-0000-000000000005', 'staff', 'Outsider DH', 'outsider-dh@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7300000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e7300000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('e7300000-0000-0000-0000-000000000005', 'admissions', 'none', null);

insert into public.children (id, parent_user_id, name, dob, is_test) values
  ('f7300000-0000-0000-0000-000000000001', 'e7300000-0000-0000-0000-000000000003', 'Amina Khan', '2015-01-01', true),
  ('f7300000-0000-0000-0000-000000000002', 'e7300000-0000-0000-0000-000000000004', 'Yusuf Ali', '2015-01-01', true);

insert into public.houses (id, name, colour) values
  ('f7300000-0000-0000-0000-000000000011', 'TEST Red dh', '#C0392B'),
  ('f7300000-0000-0000-0000-000000000012', 'TEST Blue dh', '#2471A3');

insert into public.house_members (child_id, house_id) values
  ('f7300000-0000-0000-0000-000000000001', 'f7300000-0000-0000-0000-000000000011'),
  ('f7300000-0000-0000-0000-000000000002', 'f7300000-0000-0000-0000-000000000012');

-- Red: 3 merit points count; a voided merit (5) and a demerit (-2) do not.
insert into public.behaviour_records (child_id, kind, points, category, recorded_by, voided_at) values
  ('f7300000-0000-0000-0000-000000000001', 'merit', 3, 'Excellent work', 'e7300000-0000-0000-0000-000000000001', null),
  ('f7300000-0000-0000-0000-000000000001', 'merit', 5, 'Voided', 'e7300000-0000-0000-0000-000000000001', now()),
  ('f7300000-0000-0000-0000-000000000001', 'demerit', -2, 'Lateness', 'e7300000-0000-0000-0000-000000000001', null),
  ('f7300000-0000-0000-0000-000000000002', 'merit', 1, 'Helpfulness', 'e7300000-0000-0000-0000-000000000001', null);

insert into public.parent_preferences (user_id, digest_opt_out) values ('e7300000-0000-0000-0000-000000000004', true);
insert into public.weekly_digest_log (week_start, parent_user_id, status) values ('2099-01-05', 'e7300000-0000-0000-0000-000000000003', 'sent');

set local role authenticated;

-- Parent A: own preference only ----------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7300000-0000-0000-0000-000000000003"}';
select lives_ok(
  $$insert into public.parent_preferences (user_id, digest_opt_out) values ('e7300000-0000-0000-0000-000000000003', true)$$,
  'parent can create their own digest preference'
);
select throws_ok(
  $$insert into public.parent_preferences (user_id, digest_opt_out) values ('e7300000-0000-0000-0000-000000000005', true)$$,
  '42501', null, 'parent cannot create a preference for someone else'
);
select is((select count(*)::int from public.parent_preferences), 1, 'parent reads only their own preference');
select is((select count(*)::int from public.weekly_digest_log), 0, 'parent cannot read the digest log');
select throws_ok(
  $$insert into public.houses (name, colour) values ('TEST Rogue dh', '#000000')$$,
  '42501', null, 'parent cannot create a house'
);
select throws_ok(
  $$insert into public.house_point_awards (house_id, points, reason, awarded_by) values ('f7300000-0000-0000-0000-000000000011', 50, 'cheat', 'e7300000-0000-0000-0000-000000000003')$$,
  '42501', null, 'parent cannot award house points'
);
select is((select count(*)::int from public.house_members), 1, 'parent reads only their own child''s house membership');

-- House standings: merits counted automatically, flagged as mine -------------
select is((select total_points from public.house_standings() where name = 'TEST Red dh'), 3, 'merits add house points (voided merits and demerits ignored)');
select is((select is_mine from public.house_standings() where name = 'TEST Red dh'), true, 'own child''s house is flagged as mine');
select is((select is_mine from public.house_standings() where name = 'TEST Blue dh'), false, 'another house is not flagged as mine');

-- Head/admin: bonus points, then void -----------------------------------------
set local "request.jwt.claims" to '{"sub": "e7300000-0000-0000-0000-000000000001"}';
insert into public.house_point_awards (id, house_id, points, reason) values
  ('f7300000-0000-0000-0000-000000000021', 'f7300000-0000-0000-0000-000000000012', 10, 'House charity drive');
select is((select total_points from public.house_standings() where name = 'TEST Blue dh'), 11, 'admin bonus points add to merit points');
select throws_ok(
  $$update public.house_point_awards set points = 99 where id = 'f7300000-0000-0000-0000-000000000021'$$,
  'P0001', null, 'an award''s points cannot be edited, only voided'
);
update public.house_point_awards set voided_at = now() where id = 'f7300000-0000-0000-0000-000000000021';
select is((select total_points from public.house_standings() where name = 'TEST Blue dh'), 1, 'a voided award stops counting');
select is((select count(*)::int from public.weekly_digest_log), 1, 'head/admin can read the digest log');

-- Teacher can see the table; admissions-only staff cannot ---------------------
set local "request.jwt.claims" to '{"sub": "e7300000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.house_standings() where name like 'TEST % dh'), 2, 'teacher can see the house table');
set local "request.jwt.claims" to '{"sub": "e7300000-0000-0000-0000-000000000005"}';
select throws_ok($$select * from public.house_standings()$$, '42501', null, 'admissions-only staff cannot see the house table');

select * from finish();
rollback;
