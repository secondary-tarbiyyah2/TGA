-- Run via `supabase test db`. Covers 0206: calendar events are seen only by
-- their audience, and only staff add them (teachers: staff-only entries and
-- their own classes; the office: anything).
begin;
select plan(12);

insert into auth.users (id, email) values
  ('e4300000-0000-0000-0000-000000000001', 'ht-cal@example.com'),
  ('e4300000-0000-0000-0000-000000000002', 'teacher-cal@example.com'),
  ('e4300000-0000-0000-0000-000000000003', 'parent-cal@example.com'),
  ('e4300000-0000-0000-0000-000000000004', 'parent2-cal@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e4300000-0000-0000-0000-000000000001', 'admin', 'HT Cal', 'ht-cal@example.com'),
  ('e4300000-0000-0000-0000-000000000002', 'teacher', 'Teacher Cal', 'teacher-cal@example.com'),
  ('e4300000-0000-0000-0000-000000000003', 'parent', 'Parent Cal', 'parent-cal@example.com'),
  ('e4300000-0000-0000-0000-000000000004', 'parent', 'Parent Two Cal', 'parent2-cal@example.com');
insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f4300000-0000-0000-0000-000000000001', 'TEST 2099/00 cal', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f4300000-0000-0000-0000-000000000002', 'TEST Year 8 cal');
insert into public.subjects (id, name, is_core) values ('f4300000-0000-0000-0000-000000000003', 'TEST Science cal', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f4300000-0000-0000-0000-000000000004', 'TEST Class CAL', 'TEST Year 8 cal', 'f4300000-0000-0000-0000-000000000001', 'f4300000-0000-0000-0000-000000000002', 'f4300000-0000-0000-0000-000000000003'),
  ('f4300000-0000-0000-0000-000000000005', 'TEST Other CAL', 'TEST Year 8 cal', 'f4300000-0000-0000-0000-000000000001', 'f4300000-0000-0000-0000-000000000002', 'f4300000-0000-0000-0000-000000000003');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e4300000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e4300000-0000-0000-0000-000000000002', 'teacher', 'class', 'f4300000-0000-0000-0000-000000000004'),
  ('e4300000-0000-0000-0000-000000000003', 'parent', 'none', null),
  ('e4300000-0000-0000-0000-000000000004', 'parent', 'none', null);
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f4300000-0000-0000-0000-000000000011', 'e4300000-0000-0000-0000-000000000003', 'TEST Child cal', '2013-01-01', 'f4300000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values ('f4300000-0000-0000-0000-000000000004', 'f4300000-0000-0000-0000-000000000011');

set local role authenticated;

-- Teacher
set local "request.jwt.claims" to '{"sub": "e4300000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.calendar_events (title, category, starts_on, audience, class_id) values ('TEST class test', 'assessment', '2099-10-01', 'class', 'f4300000-0000-0000-0000-000000000004')$$,
  'a teacher adds an entry for their own class'
);
select lives_ok(
  $$insert into public.calendar_events (title, category, starts_on, start_time, end_time, audience) values ('TEST department meeting', 'meeting', '2099-10-02', '15:30', '16:30', 'staff')$$,
  'a teacher adds a staff-only meeting'
);
select throws_ok(
  $$insert into public.calendar_events (title, category, starts_on, audience, class_id) values ('TEST other class', 'assessment', '2099-10-01', 'class', 'f4300000-0000-0000-0000-000000000005')$$,
  '42501', null, 'a teacher cannot add an entry for a class they do not teach'
);
select throws_ok(
  $$insert into public.calendar_events (title, category, starts_on, audience) values ('TEST whole school', 'school_event', '2099-10-03', 'everyone')$$,
  '42501', null, 'only the office adds whole-school entries'
);

-- Head teacher
set local "request.jwt.claims" to '{"sub": "e4300000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.calendar_events (title, category, starts_on, ends_on, audience) values ('TEST sports day', 'school_event', '2099-10-05', '2099-10-05', 'everyone')$$,
  'the office adds a whole-school event'
);
select lives_ok(
  $$insert into public.calendar_events (title, category, starts_on, audience) values ('TEST open morning', 'admissions', '2099-10-06', 'staff')$$,
  'the office adds an admissions entry for staff'
);
select throws_ok(
  $$insert into public.calendar_events (title, category, starts_on, audience) values ('TEST open morning public', 'admissions', '2099-10-06', 'everyone')$$,
  '23514', null, 'admissions entries are always staff only'
);

-- Parent of a pupil in the class
set local "request.jwt.claims" to '{"sub": "e4300000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.calendar_events where title like 'TEST %'), 2, 'a parent sees whole-school entries and their child''s class, not staff ones');
select throws_ok(
  $$insert into public.calendar_events (title, category, starts_on, audience, class_id) values ('TEST parent', 'school_event', '2099-10-01', 'class', 'f4300000-0000-0000-0000-000000000004')$$,
  '42501', null, 'a parent cannot add entries'
);
select is((select count(*)::int from (select 1 from public.calendar_events where title = 'TEST sports day') x), 1, 'the parent sees sports day');
update public.calendar_events set title = 'TEST hacked' where title = 'TEST sports day';
select is((select count(*)::int from public.calendar_events where title = 'TEST hacked'), 0, 'a parent cannot change an entry');

-- Another parent: only whole-school
set local "request.jwt.claims" to '{"sub": "e4300000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.calendar_events where title like 'TEST %'), 1, 'a parent of another class sees only whole-school entries');

select * from finish();
rollback;
