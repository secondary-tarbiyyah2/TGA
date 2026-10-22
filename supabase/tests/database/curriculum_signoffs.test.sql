-- Run via `supabase test db`. Covers 0102: teachers sign off curriculum content;
-- staff can read sign-offs; parents can neither read nor write them.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('a1020000-0000-0000-0000-000000000001', 'teacher-102@example.com'),
  ('a1020000-0000-0000-0000-000000000002', 'parent-102@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a1020000-0000-0000-0000-000000000001', 'teacher', 'Teacher 102', 'teacher-102@example.com'),
  ('a1020000-0000-0000-0000-000000000002', 'parent', 'Parent 102', 'parent-102@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1020000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a1020000-0000-0000-0000-000000000002', 'parent', 'none', null);

set local role authenticated;

set local "request.jwt.claims" to '{"sub": "a1020000-0000-0000-0000-000000000001"}';
select lives_ok($$select public.curriculum_set_signoff('business', 'spec', '1.1', 'approved', 'Checked against 4BS1')$$, 'a teacher can sign off a spec unit');
select is((select checked_name from public.curriculum_signoffs where ref = '1.1'), 'Teacher 102', 'the sign-off records the teacher''s name');
select lives_ok($$select public.curriculum_set_signoff('business', 'spec', '1.1', 'changes_needed', 'Point 3 wording')$$, 'a teacher can change a sign-off');
select is((select status from public.curriculum_signoffs where ref = '1.1'), 'changes_needed', 'the sign-off was updated, not duplicated');
select throws_ok($$select public.curriculum_set_signoff('business', 'other', '1.1', 'approved', null)$$, '22023', null, 'an invalid scope is refused');

set local "request.jwt.claims" to '{"sub": "a1020000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.curriculum_signoffs), 0, 'a parent cannot read sign-offs');
select throws_ok($$select public.curriculum_set_signoff('business', 'spec', '1.2', 'approved', null)$$, '42501', null, 'a parent cannot sign anything off');

select * from finish();
rollback;
