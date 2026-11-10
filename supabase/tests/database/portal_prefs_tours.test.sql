-- Run via `supabase test db`. Covers 0202: "tour seen" is stored on each
-- person's own portal_prefs row, and nobody else can read or set it.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('a2010000-0000-0000-0000-000000000001', 'tour-head@example.com'),
  ('a2010000-0000-0000-0000-000000000002', 'tour-pupil@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2010000-0000-0000-0000-000000000001', 'staff', 'Tour Head', 'tour-head@example.com'),
  ('a2010000-0000-0000-0000-000000000002', 'student', 'Tour Pupil', 'tour-pupil@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2010000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a2010000-0000-0000-0000-000000000002', 'student', 'none', null);

select has_column('public', 'portal_prefs', 'tours_seen', 'portal_prefs has tours_seen');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2010000-0000-0000-0000-000000000002"}';
select lives_ok($$insert into public.portal_prefs (user_id, tours_seen) values ('a2010000-0000-0000-0000-000000000002', array['student:v1'])$$, 'a pupil records their own tour as seen');
select throws_ok($$insert into public.portal_prefs (user_id, tours_seen) values ('a2010000-0000-0000-0000-000000000001', array['admin:v1'])$$, '42501', null, 'nobody marks a tour seen for someone else');

set local "request.jwt.claims" to '{"sub": "a2010000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.portal_prefs where user_id = 'a2010000-0000-0000-0000-000000000002'), 0, 'the Headteacher cannot read a pupil''s tour record');
select lives_ok($$insert into public.portal_prefs (user_id, tours_seen) values ('a2010000-0000-0000-0000-000000000001', array['admin:v1', 'tip:planner:v1'])$$, 'staff record their own tours');

select * from finish();
rollback;
