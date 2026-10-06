-- Run via `supabase test db`. Covers 0085: staff directory + edit RPCs, the
-- Designated Safeguarding Lead switch, the parent-evening teacher list and
-- the messaging recipient rules.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('a8500000-0000-0000-0000-000000000001', 'ht85@example.com'),
  ('a8500000-0000-0000-0000-000000000002', 'teacher85a@example.com'),
  ('a8500000-0000-0000-0000-000000000003', 'teacher85b@example.com'),
  ('a8500000-0000-0000-0000-000000000004', 'parent85x@example.com'),
  ('a8500000-0000-0000-0000-000000000005', 'parent85y@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('a8500000-0000-0000-0000-000000000001', 'parent', 'Head 85', 'ht85@example.com'),
  ('a8500000-0000-0000-0000-000000000002', 'teacher', 'Teacher 85A', 'teacher85a@example.com'),
  ('a8500000-0000-0000-0000-000000000003', 'teacher', 'Teacher 85B', 'teacher85b@example.com'),
  ('a8500000-0000-0000-0000-000000000004', 'parent', 'Parent 85X', 'parent85x@example.com'),
  ('a8500000-0000-0000-0000-000000000005', 'parent', 'Parent 85Y', 'parent85y@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a8500000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a8500000-0000-0000-0000-000000000004', 'parent', 'none', null),
  ('a8500000-0000-0000-0000-000000000005', 'parent', 'none', null);

insert into public.year_groups (id, name) values ('f8500000-0000-0000-0000-000000000001', 'TEST Year 85');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f8500000-0000-0000-0000-000000000002', 'TEST Class 85A', 'TEST Year 85', 'f8500000-0000-0000-0000-000000000001'),
  ('f8500000-0000-0000-0000-000000000003', 'TEST Class 85B', 'TEST Year 85', 'f8500000-0000-0000-0000-000000000001');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a8500000-0000-0000-0000-000000000002', 'teacher', 'class', 'f8500000-0000-0000-0000-000000000002'),
  ('a8500000-0000-0000-0000-000000000003', 'teacher', 'class', 'f8500000-0000-0000-0000-000000000003');
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f8500000-0000-0000-0000-000000000004', 'a8500000-0000-0000-0000-000000000004', 'Child 85X', '2015-01-01', 'f8500000-0000-0000-0000-000000000001', true),
  ('f8500000-0000-0000-0000-000000000005', 'a8500000-0000-0000-0000-000000000005', 'Child 85Y', '2015-01-01', 'f8500000-0000-0000-0000-000000000001', true);
insert into public.enrolments (class_id, child_id) values
  ('f8500000-0000-0000-0000-000000000002', 'f8500000-0000-0000-0000-000000000004'),
  ('f8500000-0000-0000-0000-000000000003', 'f8500000-0000-0000-0000-000000000005');

set local role authenticated;

-- Headteacher: directory, edit, roles, DSL switch
set local "request.jwt.claims" to '{"sub": "a8500000-0000-0000-0000-000000000001"}';
select ok((select count(*) from public.admin_staff_directory() where user_id = 'a8500000-0000-0000-0000-000000000002') = 1, 'head sees teachers in the staff directory');
select lives_ok($$select public.admin_update_staff('a8500000-0000-0000-0000-000000000002', 'Teacher 85A Renamed', null, '07700 900123', 'Mr', true)$$, 'head edits staff details');
select is((select full_name from public.admin_staff_directory() where user_id = 'a8500000-0000-0000-0000-000000000002'), 'Teacher 85A Renamed', 'edited name shows in the directory');
select lives_ok($$select public.admin_set_staff_roles('a8500000-0000-0000-0000-000000000002', array['teacher', 'teaching_assistant_cover'])$$, 'head adds a role');
select throws_like($$select public.admin_set_staff_roles('a8500000-0000-0000-0000-000000000002', array['head_teacher'])$$, '%cannot be set here%', 'head_teacher cannot be granted through the staff editor');
select lives_ok($$select public.set_safeguarding_lead('a8500000-0000-0000-0000-000000000002', true)$$, 'head assigns a DSL');
select ok((select is_dsl from public.admin_staff_directory() where user_id = 'a8500000-0000-0000-0000-000000000002'), 'DSL flag shows in the directory');
select throws_like($$select public.set_safeguarding_lead('a8500000-0000-0000-0000-000000000002', false)$$, '%at least one Designated Safeguarding Lead%', 'the last DSL cannot be removed');
select ok((select count(*) from public.parent_evening_teacher_options() where user_id = 'a8500000-0000-0000-0000-000000000003') = 1, 'parent-evening picker lists active teachers');

-- Teacher A: not allowed to run admin RPCs; messaging rules
set local "request.jwt.claims" to '{"sub": "a8500000-0000-0000-0000-000000000002"}';
select throws_ok($$select public.admin_staff_directory()$$, '42501', null, 'a teacher cannot read the admin staff directory');
select is((select count(*)::int from public.message_directory() where user_id = 'a8500000-0000-0000-0000-000000000004'), 1, 'teacher can message the parent of a child they teach');
select is((select count(*)::int from public.message_directory() where user_id = 'a8500000-0000-0000-0000-000000000005'), 0, 'teacher cannot message an unrelated parent');

-- Parent X: their child's teacher and the head only
set local "request.jwt.claims" to '{"sub": "a8500000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.message_directory() where user_id = 'a8500000-0000-0000-0000-000000000002'), 1, 'parent can message their child''s teacher');
select is((select count(*)::int from public.message_directory() where user_id = 'a8500000-0000-0000-0000-000000000003'), 0, 'parent cannot message another class''s teacher');

select * from finish();
rollback;
