-- Run via `supabase test db`. Covers 0089: GCSE grade history snapshots
-- (written by trigger), mock exam rows and who can see or add them.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('ea000000-0000-0000-0000-000000000001', 'ht-gh@example.com'),
  ('ea000000-0000-0000-0000-000000000002', 'teacher-gh1@example.com'),
  ('ea000000-0000-0000-0000-000000000003', 'teacher-gh2@example.com'),
  ('ea000000-0000-0000-0000-000000000004', 'parent-gh1@example.com'),
  ('ea000000-0000-0000-0000-000000000005', 'parent-gh2@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('ea000000-0000-0000-0000-000000000001', 'admin', 'HT GH', 'ht-gh@example.com'),
  ('ea000000-0000-0000-0000-000000000002', 'teacher', 'Teacher GH1', 'teacher-gh1@example.com'),
  ('ea000000-0000-0000-0000-000000000003', 'teacher', 'Teacher GH2', 'teacher-gh2@example.com'),
  ('ea000000-0000-0000-0000-000000000004', 'parent', 'Parent GH1', 'parent-gh1@example.com'),
  ('ea000000-0000-0000-0000-000000000005', 'parent', 'Parent GH2', 'parent-gh2@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('ea000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);

insert into public.year_groups (id, name) values ('fa000000-0000-0000-0000-000000000001', 'TEST Year 11 gh');
insert into public.subjects (id, name) values ('fa000000-0000-0000-0000-000000000002', 'TEST Maths gh');
insert into public.classes (id, name, year_group, year_group_id, subject_id) values
  ('fa000000-0000-0000-0000-000000000003', 'TEST Class A gh', 'TEST Year 11 gh', 'fa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000004', 'TEST Class B gh', 'TEST Year 11 gh', 'fa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('ea000000-0000-0000-0000-000000000002', 'teacher', 'class', 'fa000000-0000-0000-0000-000000000003'),
  ('ea000000-0000-0000-0000-000000000003', 'teacher', 'class', 'fa000000-0000-0000-0000-000000000004');
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('fa000000-0000-0000-0000-000000000005', 'ea000000-0000-0000-0000-000000000004', 'TEST Child GH1', '2010-01-01', 'fa000000-0000-0000-0000-000000000001', true),
  ('fa000000-0000-0000-0000-000000000006', 'ea000000-0000-0000-0000-000000000005', 'TEST Child GH2', '2010-01-01', 'fa000000-0000-0000-0000-000000000001', true);
insert into public.enrolments (class_id, child_id) values
  ('fa000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000005'),
  ('fa000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000006');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "ea000000-0000-0000-0000-000000000002"}';

insert into public.gcse_grades (child_id, subject_id, class_id, target_grade, predicted_grade, entered_by) values
  ('fa000000-0000-0000-0000-000000000005', 'fa000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000003', 7, 6, 'ea000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.gcse_grade_history), 1, 'entering grades leaves a snapshot');

update public.gcse_grades set actual_grade = 5 where child_id = 'fa000000-0000-0000-0000-000000000005';
select is((select count(*)::int from public.gcse_grade_history), 2, 'changing a grade leaves another snapshot');

update public.gcse_grades set comment = 'Working hard' where child_id = 'fa000000-0000-0000-0000-000000000005';
select is((select count(*)::int from public.gcse_grade_history), 2, 'editing only the comment leaves no snapshot');

select lives_ok(
  $$insert into public.gcse_grade_history (child_id, subject_id, class_id, kind, label, actual_grade, mark, out_of) values ('fa000000-0000-0000-0000-000000000005', 'fa000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000003', 'mock', 'Dec mock', 6, 71, 100)$$,
  'the class teacher can add a mock exam result'
);
select throws_ok(
  $$insert into public.gcse_grade_history (child_id, subject_id, class_id, kind, actual_grade) values ('fa000000-0000-0000-0000-000000000005', 'fa000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000003', 'snapshot', 9)$$,
  '42501',
  null,
  'a teacher cannot forge a snapshot row'
);

set local "request.jwt.claims" to '{"sub": "ea000000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.gcse_grade_history (child_id, subject_id, class_id, kind, actual_grade) values ('fa000000-0000-0000-0000-000000000005', 'fa000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000003', 'mock', 9)$$,
  '42501',
  null,
  'a teacher of another class cannot add a mock result'
);

set local "request.jwt.claims" to '{"sub": "ea000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.gcse_grade_history), 3, 'the parent sees their child''s history');
set local "request.jwt.claims" to '{"sub": "ea000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.gcse_grade_history), 0, 'another family sees no history');
set local "request.jwt.claims" to '{"sub": "ea000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.gcse_grade_history), 3, 'the head sees all history');

select * from finish();
rollback;
