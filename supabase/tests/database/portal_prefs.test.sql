-- Run via `supabase test db`. Covers 0200: each person reads and writes only
-- their own menu preferences (pinned pages, open categories).
begin;
select plan(6);

insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000001', 'prefs-teacher@example.com'),
  ('a2000000-0000-0000-0000-000000000002', 'prefs-parent@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2000000-0000-0000-0000-000000000001', 'teacher', 'Prefs Teacher', 'prefs-teacher@example.com'),
  ('a2000000-0000-0000-0000-000000000002', 'parent', 'Prefs Parent', 'prefs-parent@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2000000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a2000000-0000-0000-0000-000000000002', 'parent', 'none', null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2000000-0000-0000-0000-000000000001"}';
select lives_ok($$insert into public.portal_prefs (user_id, pinned_pages, nav_open) values ('a2000000-0000-0000-0000-000000000001', array['/teach/review'], array['teach:Curriculum'])$$, 'staff save their own pins');
select throws_ok($$insert into public.portal_prefs (user_id) values ('a2000000-0000-0000-0000-000000000002')$$, '42501', null, 'nobody writes preferences for someone else');
select lives_ok($$update public.portal_prefs set pinned_pages = array['/teach/review', '/teach/stars'] where user_id = 'a2000000-0000-0000-0000-000000000001'$$, 'staff change their own pins');

set local "request.jwt.claims" to '{"sub": "a2000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.portal_prefs), 0, 'a parent cannot see a teacher''s pins');
select lives_ok($$insert into public.portal_prefs (user_id, nav_open) values ('a2000000-0000-0000-0000-000000000002', array['family:Progress'])$$, 'a parent saves their own row');

reset role;
set local role anon;
select throws_ok($$select * from public.portal_prefs$$, '42501', null, 'signed-out visitors cannot read preferences');

select * from finish();
rollback;
