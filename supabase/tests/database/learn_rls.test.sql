-- Run via `supabase test db` (needs Docker — see SETUP.md). Covers
-- 0007_learn_roles_permissions.sql: proves a teacher can't reach another
-- class, a parent can't reach another family, a non-staff account can't
-- read others' role assignments, and no client role can self-escalate by
-- inserting into user_roles directly. (Manually re-verified against a real
-- local Postgres instance during development — see the session transcript;
-- this file is the same scenarios in the project's pgTAP convention so they
-- run in CI on every push, not just once by hand.)
begin;
select plan(9);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'ht@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'teacher-a@example.com'),
  ('a0000000-0000-0000-0000-000000000003', 'teacher-b@example.com'),
  ('a0000000-0000-0000-0000-000000000004', 'parent-x@example.com'),
  ('a0000000-0000-0000-0000-000000000005', 'parent-y@example.com'),
  ('a0000000-0000-0000-0000-000000000006', 'plain-parent@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'Head Teacher', 'ht@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A', 'teacher-a@example.com'),
  ('a0000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B', 'teacher-b@example.com'),
  ('a0000000-0000-0000-0000-000000000004', 'parent', 'Parent X', 'parent-x@example.com'),
  ('a0000000-0000-0000-0000-000000000005', 'parent', 'Parent Y', 'parent-y@example.com'),
  ('a0000000-0000-0000-0000-000000000006', 'parent', 'Plain Parent', 'plain-parent@example.com');

insert into public.classes (id, name, year_group) values
  ('b0000000-0000-0000-0000-000000000001', 'Class A', 'Year 4'),
  ('b0000000-0000-0000-0000-000000000002', 'Class B', 'Year 5');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a0000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a0000000-0000-0000-0000-000000000002', 'teacher', 'class', 'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'teacher', 'class', 'b0000000-0000-0000-0000-000000000002');

insert into public.families (id, family_name) values
  ('c0000000-0000-0000-0000-000000000001', 'Family X'),
  ('c0000000-0000-0000-0000-000000000002', 'Family Y');
insert into public.family_members (family_id, profile_id) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005');
insert into public.students (id, family_id, first_name, last_name, year_group) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Child', 'X', 'Year 4'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Child', 'Y', 'Year 4');

set local role authenticated;

-- Teacher A: sees own class, not the other one.
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.classes), 1, 'teacher A sees exactly their own class');
select is(
  (select count(*)::int from public.classes where id = 'b0000000-0000-0000-0000-000000000002'),
  0,
  'teacher A cannot see class B'
);

-- Parent X: sees own child, not Parent Y's.
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.students), 1, 'parent X sees exactly one student (their own)');
select is(
  (select count(*)::int from public.students where id = 'd0000000-0000-0000-0000-000000000002'),
  0,
  'parent X cannot see parent Y''s child'
);

-- A plain parent (no staff role at all) can't read other users' role rows
-- or any class.
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000006"}';
select is(
  (select count(*)::int from public.user_roles where user_id <> auth.uid()),
  0,
  'a non-staff account cannot read anyone else''s role assignments'
);
select is((select count(*)::int from public.classes), 0, 'a non-staff, non-teacher account sees no classes');

-- Head Teacher (via user_roles, not profiles.role): full visibility.
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.classes), 2, 'the head teacher sees all classes');
select is((select count(*)::int from public.user_roles), 3, 'the head teacher sees all role assignments');

-- The actual privilege-escalation guard: no client role can insert into
-- user_roles at all (every write goes through the service-role Edge
-- Function instead — see 0007's own comments).
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000006"}';
select throws_ok(
  $$insert into public.user_roles (user_id, role, scope_type, scope_id) values ('a0000000-0000-0000-0000-000000000006', 'head_teacher', 'none', null)$$,
  '42501',
  null,
  'a client cannot self-escalate by inserting into user_roles'
);

select * from finish();
rollback;
