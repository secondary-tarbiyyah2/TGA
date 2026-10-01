-- Run via `supabase test db`. Covers 0070_live_lessons_noshow_cover.sql:
-- lesson_joins (who may log a join and who may read the log), noshow_alerts
-- (read-only for head/admin and the safeguarding lead), teacher_absences
-- (head/admin manage, a teacher reads their own) and the cover column.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('e7000000-0000-0000-0000-000000000001', 'ht-live@example.com'),
  ('e7000000-0000-0000-0000-000000000002', 'teacher-a-live@example.com'),
  ('e7000000-0000-0000-0000-000000000003', 'teacher-b-live@example.com'),
  ('e7000000-0000-0000-0000-000000000004', 'parent-x-live@example.com'),
  ('e7000000-0000-0000-0000-000000000005', 'parent-y-live@example.com'),
  ('e7000000-0000-0000-0000-000000000006', 'student-x-live@example.com'),
  ('e7000000-0000-0000-0000-000000000007', 'safeguarding-live@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e7000000-0000-0000-0000-000000000001', 'admin', 'HT Live', 'ht-live@example.com'),
  ('e7000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A Live', 'teacher-a-live@example.com'),
  ('e7000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B Live', 'teacher-b-live@example.com'),
  ('e7000000-0000-0000-0000-000000000004', 'parent', 'Parent X Live', 'parent-x-live@example.com'),
  ('e7000000-0000-0000-0000-000000000005', 'parent', 'Parent Y Live', 'parent-y-live@example.com'),
  ('e7000000-0000-0000-0000-000000000006', 'student', 'Student X Live', 'student-x-live@example.com'),
  ('e7000000-0000-0000-0000-000000000007', 'teacher', 'Safeguarding Live', 'safeguarding-live@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e7000000-0000-0000-0000-000000000007', 'safeguarding_lead');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f7000000-0000-0000-0000-000000000001', 'TEST 2099/00 live', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f7000000-0000-0000-0000-000000000002', 'TEST Year 5 live');
insert into public.subjects (id, name, is_core) values ('f7000000-0000-0000-0000-000000000003', 'TEST Maths live', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f7000000-0000-0000-0000-000000000004', 'TEST Class live', 'TEST Year 5 live', 'f7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f7000000-0000-0000-0000-000000000004');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f7000000-0000-0000-0000-000000000006', 'e7000000-0000-0000-0000-000000000004', 'TEST Child X live', '2015-01-01', 'f7000000-0000-0000-0000-000000000002', true),
  ('f7000000-0000-0000-0000-000000000007', 'e7000000-0000-0000-0000-000000000005', 'TEST Child Y live', '2015-01-01', 'f7000000-0000-0000-0000-000000000002', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f7000000-0000-0000-0000-000000000006', 'e7000000-0000-0000-0000-000000000006');
insert into public.enrolments (class_id, child_id) values
  ('f7000000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000006'),
  ('f7000000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000007');

insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f7000000-0000-0000-0000-000000000008', 'f7000000-0000-0000-0000-000000000001', 'published', 'TEST published run live', 'manual');
insert into public.timetable_slots (id, run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f7000000-0000-0000-0000-000000000009', 'f7000000-0000-0000-0000-000000000008', 'f7000000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000003', 'e7000000-0000-0000-0000-000000000002', 1, '09:00', '10:00');
insert into public.lesson_instances (id, timetable_slot_id, date, objectives) values
  ('f700000a-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000009', '2099-09-07', 'TEST objective');

-- Written by the edge function in real life (service role); seeded here as the owner.
insert into public.noshow_alerts (lesson_instance_id, child_id) values
  ('f700000a-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000006');

set local role authenticated;

-- lesson_joins: recording a join ---------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000004"}';
select lives_ok(
  $$insert into public.lesson_joins (lesson_instance_id, user_id, child_id, role) values ('f700000a-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000006', 'child')$$,
  'a parent can log a join for their own enrolled child'
);
select throws_ok(
  $$insert into public.lesson_joins (lesson_instance_id, user_id, child_id, role) values ('f700000a-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000007', 'child')$$,
  '42501',
  null,
  'a parent cannot log a join for someone else''s child'
);
select throws_ok(
  $$insert into public.lesson_joins (lesson_instance_id, user_id, child_id, role) values ('f700000a-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000006', 'child')$$,
  '42501',
  null,
  'a join cannot be logged in someone else''s name'
);

-- lesson_joins: reading the log ---------------------------------------------
select is((select count(*)::int from public.lesson_joins), 1, 'the parent reads their own child''s join');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.lesson_joins), 1, 'the child''s own student account reads the join');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.lesson_joins), 0, 'another family reads no joins');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.lesson_joins), 1, 'the class teacher reads the joins for their lesson');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.lesson_joins), 0, 'a teacher of another class reads no joins');

-- lesson_joins: teacher joins -------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.lesson_joins (lesson_instance_id, user_id, role, joined_at) values ('f700000a-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002', 'teacher', '2000-01-01')$$,
  'the class teacher can log their own join'
);
select ok(
  (select joined_at from public.lesson_joins where user_id = 'e7000000-0000-0000-0000-000000000002') > now() - interval '1 hour',
  'the join time is stamped by the server, not the client'
);

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.lesson_joins (lesson_instance_id, user_id, role) values ('f700000a-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000003', 'teacher')$$,
  '42501',
  null,
  'a teacher who does not teach the lesson cannot log a join'
);

-- noshow_alerts ----------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.noshow_alerts), 1, 'the head can read no-show alerts');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.noshow_alerts), 0, 'a parent cannot read no-show alerts');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000007"}';
select is((select count(*)::int from public.noshow_alerts), 1, 'the safeguarding lead can read no-show alerts');

-- teacher_absences ---------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.teacher_absences (teacher_user_id, starts_on, ends_on, reason) values ('e7000000-0000-0000-0000-000000000002', '2099-09-07', '2099-09-08', 'TEST unwell')$$,
  'the head can record a teacher absence'
);

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.teacher_absences), 1, 'a teacher can read their own absence');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.teacher_absences), 0, 'another teacher cannot read it');
select throws_ok(
  $$insert into public.teacher_absences (teacher_user_id, starts_on, ends_on) values ('e7000000-0000-0000-0000-000000000003', '2099-09-07', '2099-09-07')$$,
  '42501',
  null,
  'a teacher cannot record absences'
);

reset role;
select has_column('public', 'cover_assignments', 'families_notified_at', 'cover_assignments records when families were told');

select * from finish();
rollback;
