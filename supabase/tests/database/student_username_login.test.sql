-- Run via `supabase test db`. Covers 0082 (student username logins): a student
-- sees only their own login row, a parent only their own child's, a parent
-- cannot write the table, the student can only clear their own "must change
-- password" flag through the function, usernames are validated, and
-- admissions-only staff cannot read logins.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('e8200000-0000-0000-0000-000000000001', 'parent-sl-x@example.com'),
  ('e8200000-0000-0000-0000-000000000002', 'parent-sl-y@example.com'),
  ('e8200000-0000-0000-0000-000000000003', 'aisha.khan@students.tarbiyyah.internal'),
  ('e8200000-0000-0000-0000-000000000004', 'head-sl@example.com'),
  ('e8200000-0000-0000-0000-000000000005', 'admissions-sl@example.com'),
  ('e8200000-0000-0000-0000-000000000006', 'omar.khan@students.tarbiyyah.internal');

insert into public.profiles (id, role, full_name, email) values
  ('e8200000-0000-0000-0000-000000000001', 'parent', 'Parent X', 'parent-sl-x@example.com'),
  ('e8200000-0000-0000-0000-000000000002', 'parent', 'Parent Y', 'parent-sl-y@example.com'),
  ('e8200000-0000-0000-0000-000000000003', 'student', 'Aisha Khan', 'aisha.khan@students.tarbiyyah.internal'),
  ('e8200000-0000-0000-0000-000000000004', 'admin', 'Head Teacher', 'head-sl@example.com'),
  ('e8200000-0000-0000-0000-000000000005', 'admin', 'Admissions Only', 'admissions-sl@example.com'),
  ('e8200000-0000-0000-0000-000000000006', 'student', 'Omar Khan', 'omar.khan@students.tarbiyyah.internal');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8200000-0000-0000-0000-000000000004', 'head_teacher', 'none', null),
  ('e8200000-0000-0000-0000-000000000005', 'admissions', 'none', null);

insert into public.children (id, parent_user_id, name, dob, is_test) values
  ('f8200000-0000-0000-0000-000000000001', 'e8200000-0000-0000-0000-000000000001', 'Aisha Khan', '2015-01-01', true),
  ('f8200000-0000-0000-0000-000000000002', 'e8200000-0000-0000-0000-000000000001', 'Omar Khan', '2017-01-01', true);

insert into public.student_accounts (child_id, profile_id) values
  ('f8200000-0000-0000-0000-000000000001', 'e8200000-0000-0000-0000-000000000003');

insert into public.student_logins (child_id, profile_id, username) values
  ('f8200000-0000-0000-0000-000000000001', 'e8200000-0000-0000-0000-000000000003', 'aisha.khan');

select throws_ok(
  $$insert into public.student_logins (child_id, profile_id, username) values ('f8200000-0000-0000-0000-000000000002', 'e8200000-0000-0000-0000-000000000006', 'Omar Khan')$$,
  '23514', null, 'a username must be lowercase letters, digits and dots'
);

set local role authenticated;

set local "request.jwt.claims" to '{"sub": "e8200000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.student_logins), 1, 'a parent sees their own child''s login');
select throws_ok(
  $$insert into public.student_logins (child_id, profile_id, username) values ('f8200000-0000-0000-0000-000000000002', 'e8200000-0000-0000-0000-000000000006', 'omar.khan')$$,
  '42501', null, 'a parent cannot create a login row directly'
);

set local "request.jwt.claims" to '{"sub": "e8200000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.student_logins), 0, 'another family sees nothing');

set local "request.jwt.claims" to '{"sub": "e8200000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.student_logins), 1, 'a student sees their own login');
update public.student_logins set must_change_password = false;
select is((select must_change_password from public.student_logins), true, 'a student cannot edit the row directly');
select public.student_login_password_changed();
select is((select must_change_password from public.student_logins), false, 'the function clears the student''s own flag');

set local "request.jwt.claims" to '{"sub": "e8200000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.student_logins), 1, 'the headteacher can read logins');

set local "request.jwt.claims" to '{"sub": "e8200000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.student_logins), 0, 'admissions-only staff cannot read logins');

select * from finish();
rollback;
