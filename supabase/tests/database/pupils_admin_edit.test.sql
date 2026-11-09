-- Run via `supabase test db`. Covers Tafweed T26, T27 and T31 (0185):
--  * only the Headteacher and Admin roles can add and edit pupils (children);
--    a teacher can't, and a parent keeps editing only their own child;
--  * "working above year group" can be set by Headteacher/Admin only;
--  * pupil_pronoun() gives the pronoun to staff who may see the pupil and to
--    no one else.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('e2600000-0000-0000-0000-000000000001', 'head-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000002', 'admin-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000003', 'teacher-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000004', 'other-teacher-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000005', 'parent-t26@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e2600000-0000-0000-0000-000000000001', 'admin', 'Head T26', 'head-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000002', 'admin', 'Admin T26', 'admin-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000003', 'teacher', 'Teacher T26', 'teacher-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000004', 'teacher', 'Other Teacher T26', 'other-teacher-t26@example.com'),
  ('e2600000-0000-0000-0000-000000000005', 'parent', 'Parent T26', 'parent-t26@example.com');

insert into public.year_groups (id, name) values ('f2600000-0000-0000-0000-000000000001', 'TEST Year 7 t26');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f2600000-0000-0000-0000-000000000002', 'TEST Maths t26', 'TEST Year 7 t26', 'f2600000-0000-0000-0000-000000000001'),
  ('f2600000-0000-0000-0000-000000000003', 'TEST Arabic t26', 'TEST Year 7 t26', 'f2600000-0000-0000-0000-000000000001');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e2600000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e2600000-0000-0000-0000-000000000002', 'admin', 'none', null),
  ('e2600000-0000-0000-0000-000000000003', 'teacher', 'class', 'f2600000-0000-0000-0000-000000000002'),
  ('e2600000-0000-0000-0000-000000000004', 'teacher', 'class', 'f2600000-0000-0000-0000-000000000003');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f2600000-0000-0000-0000-000000000004', 'e2600000-0000-0000-0000-000000000005', 'Pupil T26', '2014-10-10', 'f2600000-0000-0000-0000-000000000001', true);
insert into public.enrolments (class_id, child_id) values
  ('f2600000-0000-0000-0000-000000000002', 'f2600000-0000-0000-0000-000000000004');
insert into public.pupil_details (child_id, gender) values
  ('f2600000-0000-0000-0000-000000000004', 'male');

set local role authenticated;

-- Headteacher adds a pupil, marked as working above their year group.
set local "request.jwt.claims" to '{"sub": "e2600000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.children (id, parent_user_id, name, dob, year_group_id, working_above_year_group, is_test)
    values ('f2600000-0000-0000-0000-000000000005', 'e2600000-0000-0000-0000-000000000005', 'New Pupil T26', '2015-01-01', 'f2600000-0000-0000-0000-000000000001', true, true)$$,
  'the Headteacher can add a pupil and mark them as working above their year group'
);

-- Admin edits a pupil.
set local "request.jwt.claims" to '{"sub": "e2600000-0000-0000-0000-000000000002"}';
update public.children set name = 'Pupil T26 Edited', working_above_year_group = true where id = 'f2600000-0000-0000-0000-000000000004';
select is((select name from public.children where id = 'f2600000-0000-0000-0000-000000000004'), 'Pupil T26 Edited', 'Admin can edit a pupil');
select is((select working_above_year_group from public.children where id = 'f2600000-0000-0000-0000-000000000004'), true, 'Admin can set working above year group');
select is(public.pupil_pronoun('f2600000-0000-0000-0000-000000000004'), 'he', 'Admin gets the pronoun from the pupil record');

-- A teacher can't add or edit pupils.
set local "request.jwt.claims" to '{"sub": "e2600000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.children (parent_user_id, name, dob, is_test) values ('e2600000-0000-0000-0000-000000000005', 'Sneaky T26', '2015-01-01', true)$$,
  '42501', null, 'a teacher cannot add a pupil'
);
update public.children set name = 'Renamed by teacher' where id = 'f2600000-0000-0000-0000-000000000004';
select is((select count(*)::int from public.children where name = 'Renamed by teacher'), 0, 'a teacher cannot edit a pupil');
select is(public.pupil_pronoun('f2600000-0000-0000-0000-000000000004'), 'he', 'a teacher of the pupil''s class gets the pronoun');

set local "request.jwt.claims" to '{"sub": "e2600000-0000-0000-0000-000000000004"}';
select is(public.pupil_pronoun('f2600000-0000-0000-0000-000000000004'), null, 'a teacher of another class gets no pronoun');
update public.children set name = 'Renamed by other teacher' where id = 'f2600000-0000-0000-0000-000000000004';
select is((select count(*)::int from public.children where name = 'Renamed by other teacher'), 0, 'another teacher cannot edit a pupil either');

-- The parent: may still edit their own child as before, but not the flag.
set local "request.jwt.claims" to '{"sub": "e2600000-0000-0000-0000-000000000005"}';
select lives_ok(
  $$update public.children set name = 'Pupil T26 Family' where id = 'f2600000-0000-0000-0000-000000000004'$$,
  'a parent can still correct their own child''s name'
);
select throws_ok(
  $$update public.children set working_above_year_group = false where id = 'f2600000-0000-0000-0000-000000000004'$$,
  '42501', null, 'a parent cannot change working above year group'
);
select throws_ok(
  $$insert into public.children (parent_user_id, name, dob, working_above_year_group) values ('e2600000-0000-0000-0000-000000000005', 'Second T26', '2016-01-01', true)$$,
  '42501', null, 'a parent cannot add a child marked as working above year group'
);
select lives_ok(
  $$insert into public.children (parent_user_id, name, dob, is_test) values ('e2600000-0000-0000-0000-000000000005', 'Third T26', '2016-01-01', true)$$,
  'a parent can still add their own child (flag left off)'
);
select is(public.pupil_pronoun('f2600000-0000-0000-0000-000000000004'), null, 'pupil_pronoun is for staff only');

-- Headteacher can clear the flag again.
set local "request.jwt.claims" to '{"sub": "e2600000-0000-0000-0000-000000000001"}';
update public.children set working_above_year_group = false where id = 'f2600000-0000-0000-0000-000000000004';
select is((select working_above_year_group from public.children where id = 'f2600000-0000-0000-0000-000000000004'), false, 'the Headteacher can clear working above year group');
select is((select count(*)::int from public.children where id in ('f2600000-0000-0000-0000-000000000004', 'f2600000-0000-0000-0000-000000000005')), 2, 'the Headteacher sees both pupils');

select * from finish();
rollback;
