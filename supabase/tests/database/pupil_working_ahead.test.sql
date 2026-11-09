-- Run via `supabase test db`. Covers 0184: a parent can still edit their own
-- child's ordinary fields, but cannot change the year group or mark the child
-- as working ahead; office staff (manage_people_accounts) can.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('e1840000-0000-0000-0000-000000000001', 'office-ahead@example.com'),
  ('e1840000-0000-0000-0000-000000000002', 'parent-ahead@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e1840000-0000-0000-0000-000000000001', 'admin', 'Office', 'office-ahead@example.com'),
  ('e1840000-0000-0000-0000-000000000002', 'parent', 'Parent', 'parent-ahead@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e1840000-0000-0000-0000-000000000001', 'admin', 'none', null);

insert into public.year_groups (id, name) values
  ('e1840000-0000-0000-0000-0000000000a7', 'TEST Year 7 ahead'),
  ('e1840000-0000-0000-0000-0000000000aa', 'TEST Year 10 ahead');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('e1840000-0000-0000-0000-0000000000c1', 'e1840000-0000-0000-0000-000000000002', 'TEST Ahead Child', '2014-03-01', 'e1840000-0000-0000-0000-0000000000a7', true);

-- Parent --------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1840000-0000-0000-0000-000000000002", "iat": 999999999}';

select lives_ok(
  $$update public.children set name = 'TEST Ahead Child Renamed' where id = 'e1840000-0000-0000-0000-0000000000c1'$$,
  'a parent can still edit their child''s name'
);
select throws_ok(
  $$update public.children set year_group_id = 'e1840000-0000-0000-0000-0000000000aa' where id = 'e1840000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'a parent cannot change their child''s year group'
);
select throws_ok(
  $$update public.children set working_ahead = true where id = 'e1840000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'a parent cannot mark their child as working ahead'
);
select throws_ok(
  $$insert into public.children (parent_user_id, name, dob, working_ahead) values ('e1840000-0000-0000-0000-000000000002', 'TEST Sneaky', '2015-01-01', true)$$,
  '42501', null, 'a parent cannot add a child already marked as working ahead'
);

-- Office ----------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e1840000-0000-0000-0000-000000000001", "iat": 999999999}';

select lives_ok(
  $$update public.children set year_group_id = 'e1840000-0000-0000-0000-0000000000aa', working_ahead = true, working_ahead_note = 'GCSE Maths with Year 10'
    where id = 'e1840000-0000-0000-0000-0000000000c1'$$,
  'office staff can move the year group and mark working ahead'
);

reset role;
select is(
  (select working_ahead from public.children where id = 'e1840000-0000-0000-0000-0000000000c1'),
  true,
  'the flag is saved'
);

select * from finish();
rollback;
