-- Run via `supabase test db`. Covers 0101: withdrawal notices (parents give
-- notice for their own children only; teachers and other parents can't see
-- them; the office manages them) and the two extra register marks.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('a1010000-0000-0000-0000-000000000001', 'head-101@example.com'),
  ('a1010000-0000-0000-0000-000000000002', 'teacher-101@example.com'),
  ('a1010000-0000-0000-0000-000000000003', 'parent-101@example.com'),
  ('a1010000-0000-0000-0000-000000000004', 'other-parent-101@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a1010000-0000-0000-0000-000000000001', 'admin', 'Head 101', 'head-101@example.com'),
  ('a1010000-0000-0000-0000-000000000002', 'teacher', 'Teacher 101', 'teacher-101@example.com'),
  ('a1010000-0000-0000-0000-000000000003', 'parent', 'Parent 101', 'parent-101@example.com'),
  ('a1010000-0000-0000-0000-000000000004', 'parent', 'Other Parent 101', 'other-parent-101@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1010000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a1010000-0000-0000-0000-000000000003', 'parent', 'none', null),
  ('a1010000-0000-0000-0000-000000000004', 'parent', 'none', null);

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('b1010000-0000-0000-0000-000000000001', 'TEST 2098/99 withdrawal', '2098-09-01', '2099-07-01', true);
insert into public.year_groups (id, name) values ('b1010000-0000-0000-0000-000000000002', 'TEST Year 5 withdrawal');
insert into public.classes (id, name, year_group, academic_year_id, year_group_id) values
  ('b1010000-0000-0000-0000-000000000003', 'TEST 5A withdrawal', 'Year 5', 'b1010000-0000-0000-0000-000000000001', 'b1010000-0000-0000-0000-000000000002');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1010000-0000-0000-0000-000000000002', 'teacher', 'class', 'b1010000-0000-0000-0000-000000000003');
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('b1010000-0000-0000-0000-000000000004', 'a1010000-0000-0000-0000-000000000003', 'TEST Pupil withdrawal', '2016-01-01', 'b1010000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values
  ('b1010000-0000-0000-0000-000000000003', 'b1010000-0000-0000-0000-000000000004');

set local role authenticated;

-- Parent gives notice.
set local "request.jwt.claims" to '{"sub": "a1010000-0000-0000-0000-000000000003"}';
select lives_ok(
  $$insert into public.withdrawal_notices (child_id, last_day, reason, destination, new_school_name, signed_name, notice_acknowledged)
    values ('b1010000-0000-0000-0000-000000000004', '2098-12-01', 'Moving nearer family', 'state_school', 'TEST Primary', 'Parent 101', true)$$,
  'a parent can give notice for their own child');
select throws_ok(
  $$insert into public.withdrawal_notices (child_id, last_day, reason, destination, signed_name, notice_acknowledged)
    values ('b1010000-0000-0000-0000-000000000004', '2098-12-01', 'x', 'state_school', 'Parent 101', true)$$,
  '23514', null, 'moving to a school needs the school''s name');
select throws_ok(
  $$insert into public.withdrawal_notices (child_id, last_day, reason, destination, signed_name, notice_acknowledged, fees_outstanding)
    values ('b1010000-0000-0000-0000-000000000004', '2098-12-01', 'x', 'other', 'Parent 101', true, 0)$$,
  '42501', null, 'a parent cannot fill in the office-use fields');
select is((select count(*)::int from public.withdrawal_notices), 1, 'the parent sees their notice');

set local "request.jwt.claims" to '{"sub": "a1010000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.withdrawal_notices), 0, 'another parent cannot see it');
select throws_ok(
  $$insert into public.withdrawal_notices (child_id, last_day, reason, destination, signed_name, notice_acknowledged)
    values ('b1010000-0000-0000-0000-000000000004', '2098-12-01', 'x', 'other', 'Someone', true)$$,
  '42501', null, 'or give notice for a child who is not theirs');

set local "request.jwt.claims" to '{"sub": "a1010000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.withdrawal_notices), 0, 'the class teacher cannot see withdrawal notices');

set local "request.jwt.claims" to '{"sub": "a1010000-0000-0000-0000-000000000001"}';
update public.withdrawal_notices set status = 'acknowledged', received_on = '2098-10-20', fees_outstanding = 304.29
where child_id = 'b1010000-0000-0000-0000-000000000004';
select is((select status from public.withdrawal_notices where child_id = 'b1010000-0000-0000-0000-000000000004'), 'acknowledged', 'the office acknowledges it');

set local "request.jwt.claims" to '{"sub": "a1010000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$select public.cancel_my_withdrawal_notice((select id from public.withdrawal_notices limit 1))$$,
  '42501', null, 'once acknowledged, the parent cannot cancel it online');

-- Register marks.
reset role;
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') like '%technical%',
  'a register can record "couldn''t connect"');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') like '%not_engaged%',
  'and "present but not engaged"');

select * from finish();
rollback;
