-- Run via `supabase test db`. Covers 0200: the term resource register is staff-only and read-only for users.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000001', 'res-teacher@example.com'),
  ('a2000000-0000-0000-0000-000000000002', 'res-pupil@example.com'),
  ('a2000000-0000-0000-0000-000000000003', 'res-parent@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2000000-0000-0000-0000-000000000001', 'teacher', 'Res Teacher', 'res-teacher@example.com'),
  ('a2000000-0000-0000-0000-000000000002', 'student', 'Res Pupil', 'res-pupil@example.com'),
  ('a2000000-0000-0000-0000-000000000003', 'parent', 'Res Parent', 'res-parent@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2000000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a2000000-0000-0000-0000-000000000002', 'student', 'none', null),
  ('a2000000-0000-0000-0000-000000000003', 'parent', 'none', null);
insert into public.curriculum_resources (id, terms, title, type, subject_slug, year, lesson_nos, source, status, pdf_path)
values ('test-res-200', array['spring-1'], 'Test worksheet', 'worksheet', 'test-subject-200', 'y7', array[1], 'generated', 'made', 'resources/test-subject-200/y7/test-res-200.pdf');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.curriculum_resources where id = 'test-res-200'), 1, 'a teacher sees the register');
select throws_ok($$insert into public.curriculum_resources (id, title, type, subject_slug, year, source, status) values ('x-200', 'x', 'worksheet', 's', 'y7', 'generated', 'made')$$, '42501', null, 'a teacher cannot add to the register');
select is((with u as (update public.curriculum_resources set title = 'changed' where id = 'test-res-200' returning 1) select count(*)::int from u), 0, 'a teacher cannot change the register');

set local "request.jwt.claims" to '{"sub": "a2000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.curriculum_resources), 0, 'a pupil does not see the register');

set local "request.jwt.claims" to '{"sub": "a2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.curriculum_resources), 0, 'a parent does not see the register');

select * from finish();
rollback;
