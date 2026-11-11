-- Run via `supabase test db`. Covers 0211: the five register codes are all valid marks (the older
-- 'not_engaged' still is, so nothing saved is lost), the office can record "exceptional circumstances
-- approved by the Headteacher" as a reason, a teacher cannot, and unknown codes are refused.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('a2110000-0000-0000-0000-000000000001', 'arc-head@example.com'),
  ('a2110000-0000-0000-0000-000000000002', 'arc-teacher@example.com'),
  ('a2110000-0000-0000-0000-000000000003', 'arc-parent@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2110000-0000-0000-0000-000000000001', 'admin', 'ARC Head', 'arc-head@example.com'),
  ('a2110000-0000-0000-0000-000000000002', 'teacher', 'ARC Teacher', 'arc-teacher@example.com'),
  ('a2110000-0000-0000-0000-000000000003', 'parent', 'ARC Parent', 'arc-parent@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2110000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a2110000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('a2110000-0000-0000-0000-000000000003', 'parent', 'none', null);
insert into public.children (id, parent_user_id, name, dob, is_test) values ('a2110000-0000-0000-0000-0000000000d1', 'a2110000-0000-0000-0000-000000000003', 'ARC Pupil', '2014-03-01', true);

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check')
    ~ 'present' and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') ~ 'late'
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') ~ 'excused'
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') ~ 'absent'
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') ~ 'technical',
  'present, late, authorised (excused), unauthorised (absent) and technical are all register marks');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attendance_records_status_check') ~ 'not_engaged',
  'the older not_engaged mark is still valid, so saved marks are kept');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2110000-0000-0000-0000-000000000001"}';
select lives_ok($$insert into public.absence_reasons (child_id, absence_date, reason_code) values ('a2110000-0000-0000-0000-0000000000d1', '2026-11-10', 'exceptional')$$, 'the Headteacher records exceptional circumstances');
select lives_ok($$insert into public.absence_reasons (child_id, absence_date, reason_code) values ('a2110000-0000-0000-0000-0000000000d1', '2026-11-09', 'family_emergency')$$, 'older reason codes are still accepted');
select throws_ok($$insert into public.absence_reasons (child_id, absence_date, reason_code) values ('a2110000-0000-0000-0000-0000000000d1', '2026-11-08', 'pigeon')$$, '23514', null, 'unknown reason codes are refused');

set local "request.jwt.claims" to '{"sub": "a2110000-0000-0000-0000-000000000002"}';
select throws_ok($$insert into public.absence_reasons (child_id, absence_date, reason_code) values ('a2110000-0000-0000-0000-0000000000d1', '2026-11-07', 'exceptional')$$, '42501', null, 'a teacher cannot record a reason (the office approves)');

reset role;
select is((select reason_code from public.absence_reasons where child_id = 'a2110000-0000-0000-0000-0000000000d1' and absence_date = '2026-11-10'), 'exceptional', 'the reason is saved');

select * from finish();
rollback;
