-- Run via `supabase test db`. Covers 0008_timetabling.sql RLS: a parent
-- only sees their own child's timetable, a student only sees their own, a
-- teacher only sees their own slots, staff with the timetabler permission
-- see everything (including drafts), and a draft run is invisible to
-- parents/students/other teachers until published.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'timetabler@example.com'),
  ('e0000000-0000-0000-0000-000000000002', 'teacher-a@example.com'),
  ('e0000000-0000-0000-0000-000000000003', 'teacher-b@example.com'),
  ('e0000000-0000-0000-0000-000000000004', 'parent-x@example.com'),
  ('e0000000-0000-0000-0000-000000000005', 'parent-y@example.com'),
  ('e0000000-0000-0000-0000-000000000006', 'student-x@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e0000000-0000-0000-0000-000000000001', 'admin', 'Timetabler', 'timetabler@example.com'),
  ('e0000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A', 'teacher-a@example.com'),
  ('e0000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B', 'teacher-b@example.com'),
  ('e0000000-0000-0000-0000-000000000004', 'parent', 'Parent X', 'parent-x@example.com'),
  ('e0000000-0000-0000-0000-000000000005', 'parent', 'Parent Y', 'parent-y@example.com'),
  ('e0000000-0000-0000-0000-000000000006', 'student', 'Student X', 'student-x@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e0000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e0000000-0000-0000-0000-000000000001', 'timetabler');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f0000000-0000-0000-0000-000000000001', 'TEST 2099/00', '2099-09-01', '2100-07-01', true);

insert into public.year_groups (id, name) values ('f0000000-0000-0000-0000-000000000002', 'TEST Year 4');
insert into public.subjects (id, name, is_core) values ('f0000000-0000-0000-0000-000000000003', 'TEST Arabic', true);

insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f0000000-0000-0000-0000-000000000004', 'TEST Class A', 'TEST Year 4', 'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000005', 'TEST Class B', 'TEST Year 4', 'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e0000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f0000000-0000-0000-0000-000000000005');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000004', 'TEST Child X', '2015-01-01', 'f0000000-0000-0000-0000-000000000002', true),
  ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000005', 'TEST Child Y', '2015-01-01', 'f0000000-0000-0000-0000-000000000002', true);

insert into public.student_accounts (child_id, profile_id) values
  ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000006');

insert into public.enrolments (class_id, child_id) values
  ('f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000006'),
  ('f0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000007');

-- One draft run, one published run, each with one slot for Class A taught
-- by Teacher A.
insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000001', 'draft', 'TEST draft run', 'manual'),
  ('f0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000001', 'published', 'TEST published run', 'manual');

insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 1, '09:00', '10:00'),
  ('f0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 1, '09:00', '10:00');

set local role authenticated;

-- Parent X sees the PUBLISHED slot for their own child's class, not the draft.
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.timetable_slots), 1, 'parent X sees exactly one (published) slot');
select is(
  (select count(*)::int from public.timetable_slots where run_id = 'f0000000-0000-0000-0000-000000000008'),
  0,
  'parent X cannot see the draft run''s slot'
);

-- Parent Y (different child, different class) sees nothing for Class A.
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.timetable_slots), 0, 'parent Y sees no slots for a class their child is not in');

-- Student X sees their own published slot only.
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.timetable_slots), 1, 'student X sees exactly one (published) slot for their own class');

-- Teacher A sees their own slots in BOTH runs (draft and published).
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.timetable_slots), 2, 'teacher A sees own slots in both draft and published runs');

-- Teacher B has no slots at all, sees none.
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.timetable_slots), 0, 'teacher B (no slots of their own) sees nothing');

-- Timetabler (head teacher + timetabler permission) sees everything,
-- including draft, and can read conflicts.
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.timetable_slots), 2, 'the timetabler sees every slot in every run');
select is((select count(*)::int from public.timetable_runs), 2, 'the timetabler sees every run regardless of status');

reset role;
insert into public.timetable_conflicts (run_id, severity, class_id, subject_id, message) values
  ('f0000000-0000-0000-0000-000000000008', 'hard', 'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'TEST Year 4 Arabic cannot be placed: no teacher available');
set local role authenticated;

set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.timetable_conflicts), 1, 'the timetabler can read plain-language conflicts');

-- A plain parent cannot read conflicts at all (sensitive staff-facing data).
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.timetable_conflicts), 0, 'a parent cannot read timetable_conflicts');

-- The public sample-week function returns rows for the published run's
-- class only, with no teacher/student identity in its result columns.
select is(
  (select count(*)::int from public.public_sample_timetable_week() where subject = 'TEST Arabic'),
  1,
  'public_sample_timetable_week surfaces the published (non-test-flagged) run''s slot'
);

select * from finish();
rollback;
