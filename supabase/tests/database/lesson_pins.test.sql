-- Run via `supabase test db`. Covers 0193: staff pin lessons for themselves only.
begin;
select plan(4);

insert into auth.users (id, email) values
  ('a1930000-0000-0000-0000-000000000001', 'pin-teacher@example.com'),
  ('a1930000-0000-0000-0000-000000000002', 'pin-other@example.com'),
  ('a1930000-0000-0000-0000-000000000003', 'pin-parent@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a1930000-0000-0000-0000-000000000001', 'teacher', 'Pin Teacher', 'pin-teacher@example.com'),
  ('a1930000-0000-0000-0000-000000000002', 'teacher', 'Pin Other', 'pin-other@example.com'),
  ('a1930000-0000-0000-0000-000000000003', 'parent', 'Pin Parent', 'pin-parent@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1930000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a1930000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('a1930000-0000-0000-0000-000000000003', 'parent', 'none', null);
insert into public.curriculum_lessons (id, subject_slug, subject, year, unit, lesson_no, title)
values ('a1930000-0000-0000-0000-0000000000a1', 'test-subject-193', 'Test subject', 'y7', 'Spring 1: Test', 902, 'Pin test lesson');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1930000-0000-0000-0000-000000000001"}';
select lives_ok($$insert into public.lesson_pins (user_id, lesson_id) values ('a1930000-0000-0000-0000-000000000001', 'a1930000-0000-0000-0000-0000000000a1')$$, 'a teacher can pin a lesson');
select throws_ok($$insert into public.lesson_pins (user_id, lesson_id) values ('a1930000-0000-0000-0000-000000000002', 'a1930000-0000-0000-0000-0000000000a1')$$, '42501', null, 'nobody can pin for someone else');

set local "request.jwt.claims" to '{"sub": "a1930000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.lesson_pins), 0, 'another teacher does not see my pins');

set local "request.jwt.claims" to '{"sub": "a1930000-0000-0000-0000-000000000003"}';
select throws_ok($$insert into public.lesson_pins (user_id, lesson_id) values ('a1930000-0000-0000-0000-000000000003', 'a1930000-0000-0000-0000-0000000000a1')$$, '42501', null, 'a parent cannot pin lessons');

select * from finish();
rollback;
