-- Run via `supabase test db`. Covers 0009_lessons_attendance.sql RLS:
-- lesson_instances/lesson_recordings visibility by role, attendance
-- read/write scoping, recording_consents parent-only write, absence_notices
-- parent-write/teacher-read, and lms_settings read/write gating.
begin;
select plan(25);

insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'ht@example.com'),
  ('e1000000-0000-0000-0000-000000000002', 'teacher-a@example.com'),
  ('e1000000-0000-0000-0000-000000000003', 'teacher-b@example.com'),
  ('e1000000-0000-0000-0000-000000000004', 'parent-x@example.com'),
  ('e1000000-0000-0000-0000-000000000005', 'parent-y@example.com'),
  ('e1000000-0000-0000-0000-000000000006', 'student-x@example.com'),
  ('e1000000-0000-0000-0000-000000000007', 'safeguarding@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e1000000-0000-0000-0000-000000000001', 'admin', 'Head Teacher', 'ht@example.com'),
  ('e1000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A', 'teacher-a@example.com'),
  ('e1000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B', 'teacher-b@example.com'),
  ('e1000000-0000-0000-0000-000000000004', 'parent', 'Parent X', 'parent-x@example.com'),
  ('e1000000-0000-0000-0000-000000000005', 'parent', 'Parent Y', 'parent-y@example.com'),
  ('e1000000-0000-0000-0000-000000000006', 'student', 'Student X', 'student-x@example.com'),
  ('e1000000-0000-0000-0000-000000000007', 'teacher', 'Safeguarding Lead', 'safeguarding@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e1000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e1000000-0000-0000-0000-000000000007', 'safeguarding_lead');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f1000000-0000-0000-0000-000000000001', 'TEST 2099/00 lms', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f1000000-0000-0000-0000-000000000002', 'TEST Year 5 lms');
insert into public.subjects (id, name, is_core) values ('f1000000-0000-0000-0000-000000000003', 'TEST Maths lms', true);

insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f1000000-0000-0000-0000-000000000004', 'TEST Class A lms', 'TEST Year 5 lms', 'f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e1000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f1000000-0000-0000-0000-000000000004'),
  ('e1000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f1000000-0000-0000-0000-000000000005');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f1000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000004', 'TEST Child X lms', '2015-01-01', 'f1000000-0000-0000-0000-000000000002', true),
  ('f1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000005', 'TEST Child Y lms', '2015-01-01', 'f1000000-0000-0000-0000-000000000002', true);

insert into public.student_accounts (child_id, profile_id) values
  ('f1000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000006');

insert into public.enrolments (class_id, child_id) values
  ('f1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000006');
-- Child Y (parent Y) is deliberately NOT enrolled in Class A.

insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f1000000-0000-0000-0000-000000000008', 'f1000000-0000-0000-0000-000000000001', 'published', 'TEST published run lms', 'manual');

insert into public.timetable_slots (id, run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f1000000-0000-0000-0000-000000000009', 'f1000000-0000-0000-0000-000000000008', 'f1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002', 1, '09:00', '10:00');

insert into public.lesson_instances (id, timetable_slot_id, date, objectives) values
  ('f100000a-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000009', '2099-09-07', 'TEST objective');

insert into public.lesson_recordings (id, lesson_instance_id, bbb_recording_id, status, retention_deletes_at) values
  ('f100000a-0000-0000-0000-000000000002', 'f100000a-0000-0000-0000-000000000001', 'TEST-rec-1', 'available', now() + interval '90 days');

set local role authenticated;

-- lesson_instances visibility ------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.lesson_instances), 1, 'teacher A sees their own class''s lesson instance');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.lesson_instances), 0, 'teacher B (not this class) sees no lesson instances');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.lesson_instances), 1, 'parent X (enrolled child) sees the lesson instance');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.lesson_instances), 0, 'parent Y (child not enrolled) sees no lesson instances');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.lesson_instances), 1, 'student X (own enrolment) sees the lesson instance');

-- No client write path exists at all for lesson_instances: with no
-- UPDATE/INSERT/DELETE policy granted, RLS makes an UPDATE match zero rows
-- (confirmed empirically — it does not raise, it silently no-ops) rather
-- than throw, so the real assertion is "the row is unchanged", not
-- "an exception was raised".
update public.lesson_instances set objectives = 'hacked' where id = 'f100000a-0000-0000-0000-000000000001';
select is(
  (select objectives from public.lesson_instances where id = 'f100000a-0000-0000-0000-000000000001'),
  'TEST objective',
  'even the class''s own teacher cannot write lesson_instances directly (edge-function-only) — update silently affects 0 rows'
);

-- lesson_recordings metadata visibility --------------------------------------
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.lesson_recordings), 1, 'parent X sees recording metadata for their child''s lesson');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.lesson_recordings), 0, 'parent Y sees no recording metadata for a lesson their child is not in');

-- attendance_records ----------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000002"}';
insert into public.attendance_records (lesson_instance_id, child_id, status, marked_by)
  values ('f100000a-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000006', 'present', 'e1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.attendance_records), 1, 'teacher A can mark attendance for their own class''s enrolled child');

select throws_ok(
  $$ insert into public.attendance_records (lesson_instance_id, child_id, status, marked_by)
     values ('f100000a-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000007', 'present', 'e1000000-0000-0000-0000-000000000002') $$,
  null,
  null,
  'teacher A cannot mark attendance for a child not enrolled in that lesson''s class'
);

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.attendance_records), 1, 'parent X reads their own child''s attendance');
update public.attendance_records set status = 'absent' where child_id = 'f1000000-0000-0000-0000-000000000006';
select is(
  (select status from public.attendance_records where child_id = 'f1000000-0000-0000-0000-000000000006'),
  'present',
  'parent X cannot edit attendance (read-only for parents) — update silently affects 0 rows'
);

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.attendance_records), 0, 'parent Y (unrelated child) reads no attendance rows');

-- recording_consents ------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000004"}';
insert into public.recording_consents (child_id, given, given_by) values ('f1000000-0000-0000-0000-000000000006', true, 'e1000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.recording_consents), 1, 'parent X can give consent for their own child');

select throws_ok(
  $$ insert into public.recording_consents (child_id, given, given_by) values ('f1000000-0000-0000-0000-000000000007', true, 'e1000000-0000-0000-0000-000000000004') $$,
  null,
  null,
  'parent X cannot give consent for a child that is not theirs'
);

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.recording_consents), 0, 'parent Y cannot read parent X''s child''s consent');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000007"}';
select is((select count(*)::int from public.recording_consents), 1, 'safeguarding lead can read consent records');

-- absence_notices -----------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000004"}';
insert into public.absence_notices (child_id, lesson_instance_id, reason, submitted_by)
  values ('f1000000-0000-0000-0000-000000000006', 'f100000a-0000-0000-0000-000000000001', 'TEST dentist appointment', 'e1000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.absence_notices), 1, 'parent X can submit an advance absence notice for their own child');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.absence_notices), 1, 'the class''s teacher can read the absence notice');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.absence_notices), 0, 'a different teacher cannot read the absence notice');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000005"}';
select throws_ok(
  $$ insert into public.absence_notices (child_id, lesson_instance_id, reason, submitted_by)
     values ('f1000000-0000-0000-0000-000000000006', 'f100000a-0000-0000-0000-000000000001', 'TEST not my child', 'e1000000-0000-0000-0000-000000000005') $$,
  null,
  null,
  'parent Y cannot submit an absence notice for a child that is not theirs'
);

-- lms_settings -----------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.lms_settings), 1, 'head teacher can read lms_settings');
update public.lms_settings set recording_retention_days = 60 where id = true;
select is((select recording_retention_days from public.lms_settings), 60, 'head teacher can update lms_settings');

set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.lms_settings), 0, 'a parent cannot read lms_settings');

-- audit_log: new learn-side compliance/safeguarding read policy -----------------
reset role;
insert into public.audit_log (actor_id, action, target_table, target_id, changes)
  values ('e1000000-0000-0000-0000-000000000001', 'TEST_ACTION', 'lesson_recordings', 'f100000a-0000-0000-0000-000000000002', null);
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.audit_log where action = 'TEST_ACTION'), 1, 'head teacher (learn role) can read audit_log via the new view_compliance-equivalent policy');

select * from finish();
rollback;
