-- Run via `supabase test db`. Covers 0208: staff read the Qur'an marking standard and class levels, only the
-- head teacher changes them, families cannot read them, and a moved mark needs a reason.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('a2050000-0000-0000-0000-000000000001', 'qm-head@example.com'),
  ('a2050000-0000-0000-0000-000000000002', 'qm-teacher@example.com'),
  ('a2050000-0000-0000-0000-000000000003', 'qm-parent@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a2050000-0000-0000-0000-000000000001', 'admin', 'QM Head', 'qm-head@example.com'),
  ('a2050000-0000-0000-0000-000000000002', 'teacher', 'QM Teacher', 'qm-teacher@example.com'),
  ('a2050000-0000-0000-0000-000000000003', 'parent', 'QM Parent', 'qm-parent@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a2050000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a2050000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('a2050000-0000-0000-0000-000000000003', 'parent', 'none', null);
insert into public.classes (id, name, year_group) values ('a2050000-0000-0000-0000-0000000000c1', 'QM Year 7 Quran', 'y7');
insert into public.children (id, name, parent_user_id, dob, is_test) values ('a2050000-0000-0000-0000-0000000000d1', 'QM Pupil', 'a2050000-0000-0000-0000-000000000003', '2014-01-01', true);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2050000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.quran_marking_standard), 1, 'a teacher reads the marking standard');
update public.quran_marking_standard set standard = '{"x": 1}'::jsonb;
select is((select standard from public.quran_marking_standard), '{}'::jsonb, 'a teacher cannot change the standard');
select throws_ok($$insert into public.quran_class_settings (class_id, marking_level) values ('a2050000-0000-0000-0000-0000000000c1', 'senior')$$, '42501', null, 'a teacher cannot set a class level');
select throws_ok(
  $$insert into public.quran_progress (child_id, milestone_type, surah_from, surah_to, score, worked_out_score, recorded_by) values ('a2050000-0000-0000-0000-0000000000d1', 'quran_memorisation', 67, 67, 8, 6, 'a2050000-0000-0000-0000-000000000002')$$,
  '23514', null, 'a moved mark without a reason is refused');
select lives_ok(
  $$insert into public.quran_progress (child_id, milestone_type, surah_from, surah_to, score, worked_out_score, adjust_reason, mistakes, marking_level, recorded_by) values ('a2050000-0000-0000-0000-0000000000d1', 'quran_memorisation', 67, 67, 7, 6, 'Nervous but knew it well', '[{"kind":"prompt","ayah":3}]', 'senior', 'a2050000-0000-0000-0000-000000000002')$$,
  'a teacher saves a recitation with its mistakes');
select throws_ok(
  $$insert into public.quran_progress (child_id, milestone_type, surah_from, surah_to, recitation_kind, recorded_by) values ('a2050000-0000-0000-0000-0000000000d1', 'quran_memorisation', 67, 67, 'sabaq', 'a2050000-0000-0000-0000-000000000002')$$,
  '23514', null, 'an unknown kind of recitation is refused');
select lives_ok(
  $$insert into public.quran_progress (child_id, milestone_type, surah_from, surah_to, score, recitation_kind, date_reason, mistakes, recorded_by) values ('a2050000-0000-0000-0000-0000000000d1', 'quran_memorisation', 78, 78, 9, 'revision', 'Heard on Tuesday instead of Monday', '[{"kind":"tajweed","surah":78,"ayah":2,"word":1,"gap":true},{"kind":"skipped","surah":78,"ayah":40}]', 'a2050000-0000-0000-0000-000000000002')$$,
  'a revision with marks on the page and a date reason saves');

set local "request.jwt.claims" to '{"sub": "a2050000-0000-0000-0000-000000000001"}';
select lives_ok($$update public.quran_marking_standard set standard = '{"limits": {}}'::jsonb$$, 'the head teacher changes the standard');
select lives_ok($$insert into public.quran_class_settings (class_id, marking_level) values ('a2050000-0000-0000-0000-0000000000c1', 'senior')$$, 'the head teacher sets a class level');

set local "request.jwt.claims" to '{"sub": "a2050000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.quran_marking_standard), 0, 'a parent cannot read the standard');
select is((select count(*)::int from public.quran_class_settings), 0, 'a parent cannot read class levels');

reset role;
select throws_ok(
  $$insert into public.announcements (scope, class_id, title, body, author_id, kind) values ('class', 'a2050000-0000-0000-0000-0000000000c1', 'Lesson note', 'x', 'a2050000-0000-0000-0000-000000000002', 'lesson_note')$$,
  '23514', null, 'a lesson note needs its lesson date');

select * from finish();
rollback;
