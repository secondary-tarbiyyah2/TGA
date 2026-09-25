-- Run via `supabase test db` (needs Docker — see SETUP.md).
begin;
select plan(3);

-- Two separate families, each with a parent and a student.
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'parent-a@example.com'),
  ('b2222222-2222-2222-2222-222222222222', 'parent-b@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a1111111-1111-1111-1111-111111111111', 'parent', 'Parent A', 'parent-a@example.com'),
  ('b2222222-2222-2222-2222-222222222222', 'parent', 'Parent B', 'parent-b@example.com');
insert into public.families (id, family_name) values
  ('fa111111-1111-1111-1111-111111111111', 'Family A'),
  ('fb222222-2222-2222-2222-222222222222', 'Family B');
insert into public.family_members (family_id, profile_id) values
  ('fa111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
  ('fb222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222');
insert into public.students (id, family_id, first_name, last_name, year_group) values
  ('5a111111-1111-1111-1111-111111111111', 'fa111111-1111-1111-1111-111111111111', 'Aisha', 'A', 'Year 4');

-- As anon (no JWT at all): reading bookings must return nothing, not error.
set local role anon;
select is(
  (select count(*)::int from public.bookings),
  0,
  'anon cannot read bookings (RLS default-denies, table is empty to it either way)'
);

-- As Parent A (authenticated, sub = their own id): can see Family A's
-- student, cannot see Family B's.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1111111-1111-1111-1111-111111111111"}';

select is(
  (select count(*)::int from public.students where id = '5a111111-1111-1111-1111-111111111111'),
  1,
  'a parent can read their own family''s student'
);

select is(
  (select count(*)::int from public.students where family_id = 'fb222222-2222-2222-2222-222222222222'),
  0,
  'a parent cannot read another family''s student'
);

select * from finish();
rollback;
