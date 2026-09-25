-- Run via `supabase test db`. Proves the double-booking EXCLUDE constraints
-- on timetable_slots reject an overlapping insert at the DB level — not an
-- app-level check that a buggy client could skip. Same technique/assurance
-- as supabase/tests/database's coverage of bookings_no_staff_overlap (see
-- 0001_init.sql) applied to teacher, virtual-session and class overlaps.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'teacher-excl@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e1000000-0000-0000-0000-000000000001', 'teacher', 'Teacher Excl', 'teacher-excl@example.com');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('e1000000-0000-0000-0000-000000000002', 'TEST 2099/00 EXCL', '2099-09-01', '2100-07-01', true);
insert into public.subjects (id, name) values ('e1000000-0000-0000-0000-000000000003', 'TEST Subject Excl');
insert into public.classes (id, name, year_group, academic_year_id, subject_id) values
  ('e1000000-0000-0000-0000-000000000004', 'TEST Class Excl A', 'TEST Year Excl', 'e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003'),
  ('e1000000-0000-0000-0000-000000000005', 'TEST Class Excl B', 'TEST Year Excl', 'e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003');
insert into public.virtual_sessions (id, name) values ('e1000000-0000-0000-0000-000000000006', 'TEST Session Excl');
insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000002', 'draft', 'TEST excl run', 'manual');

-- Baseline slot: Teacher Excl, Class A, Monday 09:00-10:00, Session Excl.
insert into public.timetable_slots (id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time) values
  ('e1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000006', 1, '09:00', '10:00');

-- Same teacher, overlapping time, different class -> rejected.
select throws_ok(
  $$ insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time)
     values ('e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 1, '09:30', '10:30') $$,
  null, null,
  'a teacher cannot be double-booked into an overlapping slot in the same run'
);

-- Same virtual session, overlapping time, different teacher -> rejected.
insert into auth.users (id, email) values ('e1000000-0000-0000-0000-000000000009', 'teacher-excl-2@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e1000000-0000-0000-0000-000000000009', 'teacher', 'Teacher Excl 2', 'teacher-excl-2@example.com');
select throws_ok(
  $$ insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time)
     values ('e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-000000000006', 1, '09:30', '10:30') $$,
  null, null,
  'a virtual session cannot be double-booked into an overlapping slot in the same run'
);

-- Same class, overlapping time, different teacher -> rejected (a class
-- can't be in two lessons at once).
select throws_ok(
  $$ insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time)
     values ('e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000009', 1, '09:30', '10:30') $$,
  null, null,
  'a class cannot be double-booked into an overlapping slot in the same run'
);

-- Non-overlapping time, same teacher -> succeeds.
select lives_ok(
  $$ insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time)
     values ('e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 1, '10:00', '11:00') $$,
  'a non-overlapping slot for the same teacher on the same day is allowed'
);

-- Same overlapping time but a DIFFERENT run -> succeeds (each run is an
-- independent draft; only overlaps WITHIN a run are rejected).
insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('e1000000-0000-0000-0000-0000000000aa', 'e1000000-0000-0000-0000-000000000002', 'draft', 'TEST excl run 2', 'manual');
select lives_ok(
  $$ insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time)
     values ('e1000000-0000-0000-0000-0000000000aa', 'e1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 1, '09:00', '10:00') $$,
  'an overlapping slot is allowed in a DIFFERENT run (each run is independent)'
);

-- Same class, adjacent (non-overlapping, touching) times -> succeeds.
select lives_ok(
  $$ insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time)
     values ('e1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000009', 1, '10:00', '11:00') $$,
  'back-to-back (touching, not overlapping) slots for the same class are allowed'
);

select * from finish();
rollback;
