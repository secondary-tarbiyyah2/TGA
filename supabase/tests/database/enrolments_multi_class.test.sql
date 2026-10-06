-- Run via `supabase test db`. Covers 0083: a child can be enrolled in several
-- classes; the parent and the student see every enrolment, a class teacher only
-- their own class's; and set_child_classes() replaces the whole list for
-- Headteacher/Admin but is refused for a parent or a teacher.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('e8300000-0000-0000-0000-000000000001', 'head-mc@example.com'),
  ('e8300000-0000-0000-0000-000000000002', 'teacher-mc@example.com'),
  ('e8300000-0000-0000-0000-000000000003', 'parent-mc@example.com'),
  ('e8300000-0000-0000-0000-000000000004', 'pupil.mc@students.tarbiyyah.internal');

insert into public.profiles (id, role, full_name, email) values
  ('e8300000-0000-0000-0000-000000000001', 'admin', 'Head Teacher', 'head-mc@example.com'),
  ('e8300000-0000-0000-0000-000000000002', 'teacher', 'Teacher A', 'teacher-mc@example.com'),
  ('e8300000-0000-0000-0000-000000000003', 'parent', 'Parent', 'parent-mc@example.com'),
  ('e8300000-0000-0000-0000-000000000004', 'student', 'Pupil MC', 'pupil.mc@students.tarbiyyah.internal');

insert into public.year_groups (id, name) values ('f8300000-0000-0000-0000-000000000001', 'TEST Year 5 mc');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f8300000-0000-0000-0000-000000000002', 'TEST Maths mc', 'TEST Year 5 mc', 'f8300000-0000-0000-0000-000000000001'),
  ('f8300000-0000-0000-0000-000000000003', 'TEST Arabic mc', 'TEST Year 5 mc', 'f8300000-0000-0000-0000-000000000001');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8300000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e8300000-0000-0000-0000-000000000002', 'teacher', 'class', 'f8300000-0000-0000-0000-000000000002');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f8300000-0000-0000-0000-000000000004', 'e8300000-0000-0000-0000-000000000003', 'Pupil MC', '2015-01-01', 'f8300000-0000-0000-0000-000000000001', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f8300000-0000-0000-0000-000000000004', 'e8300000-0000-0000-0000-000000000004');
insert into public.enrolments (class_id, child_id) values
  ('f8300000-0000-0000-0000-000000000002', 'f8300000-0000-0000-0000-000000000004'),
  ('f8300000-0000-0000-0000-000000000003', 'f8300000-0000-0000-0000-000000000004');

set local role authenticated;

set local "request.jwt.claims" to '{"sub": "e8300000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.enrolments where child_id = 'f8300000-0000-0000-0000-000000000004'), 2, 'a child can hold two enrolments');

set local "request.jwt.claims" to '{"sub": "e8300000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.enrolments where child_id = 'f8300000-0000-0000-0000-000000000004'), 2, 'the parent sees every class');

set local "request.jwt.claims" to '{"sub": "e8300000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.enrolments where child_id = 'f8300000-0000-0000-0000-000000000004'), 2, 'the student sees every class');

set local "request.jwt.claims" to '{"sub": "e8300000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.enrolments where child_id = 'f8300000-0000-0000-0000-000000000004'), 1, 'a class teacher sees only their own class''s enrolment');
select throws_ok(
  $$select public.set_child_classes('f8300000-0000-0000-0000-000000000004', array['f8300000-0000-0000-0000-000000000002']::uuid[])$$,
  '42501', null, 'a teacher cannot replace a child''s whole class list'
);

set local "request.jwt.claims" to '{"sub": "e8300000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$select public.set_child_classes('f8300000-0000-0000-0000-000000000004', array[]::uuid[])$$,
  '42501', null, 'a parent cannot change enrolments'
);

set local "request.jwt.claims" to '{"sub": "e8300000-0000-0000-0000-000000000001"}';
select public.set_child_classes('f8300000-0000-0000-0000-000000000004', array['f8300000-0000-0000-0000-000000000002']::uuid[]);
select is((select count(*)::int from public.enrolments where child_id = 'f8300000-0000-0000-0000-000000000004'), 1, 'set_child_classes removes classes that are no longer listed');
select public.set_child_classes('f8300000-0000-0000-0000-000000000004', array['f8300000-0000-0000-0000-000000000002', 'f8300000-0000-0000-0000-000000000003']::uuid[]);
select is((select count(*)::int from public.enrolments where child_id = 'f8300000-0000-0000-0000-000000000004'), 2, 'set_child_classes adds the missing class');

select * from finish();
rollback;
