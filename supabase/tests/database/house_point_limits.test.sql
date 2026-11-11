-- Run via `supabase test db`. Covers 0217: the head teacher sets house point limits; a teacher's award over the
-- most per award, or over the day's most per pupil, is refused; the head teacher is not limited; families cannot
-- read the settings.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('e2160000-0000-0000-0000-000000000001', 'ht-hp@example.com'),
  ('e2160000-0000-0000-0000-000000000002', 'teacher-hp@example.com'),
  ('e2160000-0000-0000-0000-000000000003', 'parent-hp@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e2160000-0000-0000-0000-000000000001', 'admin', 'HT HP', 'ht-hp@example.com'),
  ('e2160000-0000-0000-0000-000000000002', 'teacher', 'Teacher HP', 'teacher-hp@example.com'),
  ('e2160000-0000-0000-0000-000000000003', 'parent', 'Parent HP', 'parent-hp@example.com');
insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f2160000-0000-0000-0000-000000000001', 'TEST 2099/00 hp', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f2160000-0000-0000-0000-000000000002', 'TEST Year 7 hp');
insert into public.subjects (id, name, is_core) values ('f2160000-0000-0000-0000-000000000003', 'TEST English hp', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f2160000-0000-0000-0000-000000000004', 'TEST Class HP', 'TEST Year 7 hp', 'f2160000-0000-0000-0000-000000000001', 'f2160000-0000-0000-0000-000000000002', 'f2160000-0000-0000-0000-000000000003');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e2160000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e2160000-0000-0000-0000-000000000002', 'teacher', 'class', 'f2160000-0000-0000-0000-000000000004'),
  ('e2160000-0000-0000-0000-000000000003', 'parent', 'none', null);
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f2160000-0000-0000-0000-000000000011', 'e2160000-0000-0000-0000-000000000003', 'TEST Child hp', '2014-01-01', 'f2160000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values ('f2160000-0000-0000-0000-000000000004', 'f2160000-0000-0000-0000-000000000011');

set local role authenticated;

-- Head teacher: sets the limits (3 an award, 4 a day) and is not limited.
set local "request.jwt.claims" to '{"sub": "e2160000-0000-0000-0000-000000000001"}';
select lives_ok($$update public.house_point_settings set max_per_award = 3, daily_cap_per_pupil = 4 where singleton$$, 'the head teacher sets the limits');
select lives_ok($$insert into public.behaviour_records (child_id, kind, points, category, recorded_by) values ('f2160000-0000-0000-0000-000000000011', 'merit', 10, 'Leadership', 'e2160000-0000-0000-0000-000000000001')$$, 'the head teacher is not limited');

-- Teacher of the class.
set local "request.jwt.claims" to '{"sub": "e2160000-0000-0000-0000-000000000002"}';
select is((select max_per_award from public.house_point_settings), 3, 'a teacher reads the limits');
select throws_ok($$insert into public.behaviour_records (child_id, class_id, kind, points, category, recorded_by) values ('f2160000-0000-0000-0000-000000000011', 'f2160000-0000-0000-0000-000000000004', 'merit', 4, 'Excellent work', 'e2160000-0000-0000-0000-000000000002')$$, 'P0001', null, 'an award over the most per award is refused');
select lives_ok($$insert into public.behaviour_records (child_id, class_id, kind, points, category, recorded_by) values ('f2160000-0000-0000-0000-000000000011', 'f2160000-0000-0000-0000-000000000004', 'merit', 3, 'Excellent work', 'e2160000-0000-0000-0000-000000000002')$$, 'an award within the limits is saved');
select throws_ok($$insert into public.behaviour_records (child_id, class_id, kind, points, category, recorded_by) values ('f2160000-0000-0000-0000-000000000011', 'f2160000-0000-0000-0000-000000000004', 'merit', 2, 'Helpfulness', 'e2160000-0000-0000-0000-000000000002')$$, 'P0001', null, 'going over the day''s most for one pupil is refused');
update public.house_point_settings set max_per_award = 50;
select is((select max_per_award from public.house_point_settings), 3, 'a teacher cannot change the limits');

-- Parent.
set local "request.jwt.claims" to '{"sub": "e2160000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.house_point_settings), 0, 'families cannot read the settings');

select * from finish();
rollback;
