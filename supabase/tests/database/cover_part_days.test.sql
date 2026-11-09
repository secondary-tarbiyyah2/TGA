-- Run via `supabase test db`. Covers Tafweed T30 (migration 0187):
--  * part-day staff absences and absence categories, with their checks;
--  * a cover records which absence it was for;
--  * no one gained access: a teacher can't record absences, reads only the
--    covers they give or receive, and can't mark themselves as notified.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('e3000000-0000-0000-0000-000000000301', 'head-t30@example.com'),
  ('e3000000-0000-0000-0000-000000000302', 'away-t30@example.com'),
  ('e3000000-0000-0000-0000-000000000303', 'cover-t30@example.com'),
  ('e3000000-0000-0000-0000-000000000304', 'other-t30@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e3000000-0000-0000-0000-000000000301', 'admin', 'Head T30', 'head-t30@example.com'),
  ('e3000000-0000-0000-0000-000000000302', 'teacher', 'Away T30', 'away-t30@example.com'),
  ('e3000000-0000-0000-0000-000000000303', 'teacher', 'Cover T30', 'cover-t30@example.com'),
  ('e3000000-0000-0000-0000-000000000304', 'teacher', 'Other T30', 'other-t30@example.com');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f3000000-0000-0000-0000-000000000301', 'TEST 2098/99 t30', '2098-09-01', '2099-07-01', true);
insert into public.year_groups (id, name) values ('f3000000-0000-0000-0000-000000000302', 'TEST Year 9 t30');
insert into public.subjects (id, name) values ('f3000000-0000-0000-0000-000000000303', 'TEST History t30');
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f3000000-0000-0000-0000-000000000304', 'TEST History 9 t30', 'TEST Year 9 t30', 'f3000000-0000-0000-0000-000000000301', 'f3000000-0000-0000-0000-000000000302', 'f3000000-0000-0000-0000-000000000303');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e3000000-0000-0000-0000-000000000301', 'head_teacher', 'none', null),
  ('e3000000-0000-0000-0000-000000000302', 'teacher', 'class', 'f3000000-0000-0000-0000-000000000304'),
  ('e3000000-0000-0000-0000-000000000303', 'teacher', 'none', null),
  ('e3000000-0000-0000-0000-000000000304', 'teacher', 'none', null);

insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f3000000-0000-0000-0000-000000000305', 'f3000000-0000-0000-0000-000000000301', 'published', 'TEST run t30', 'manual');
insert into public.timetable_slots (id, run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f3000000-0000-0000-0000-000000000306', 'f3000000-0000-0000-0000-000000000305', 'f3000000-0000-0000-0000-000000000304', 'f3000000-0000-0000-0000-000000000303', 'e3000000-0000-0000-0000-000000000302', 1, '13:00', '14:00');

set local role authenticated;

-- ── the Headteacher records a part-day absence and assigns cover ─────────
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000301"}';
select lives_ok(
  $$insert into public.teacher_absences (id, teacher_user_id, starts_on, ends_on, start_time, end_time, category, reason)
    values ('f3000000-0000-0000-0000-000000000307', 'e3000000-0000-0000-0000-000000000302', '2098-09-07', '2098-09-08', '12:00', '11:00', 'medical', 'Hospital appointment')$$,
  'a part-day absence over two days can be recorded'
);
select throws_ok(
  $$insert into public.teacher_absences (teacher_user_id, starts_on, ends_on, start_time, end_time) values ('e3000000-0000-0000-0000-000000000302', '2098-09-09', '2098-09-09', '14:00', '10:00')$$,
  '23514', null, 'on a single day, "from" must be before "until"'
);
select throws_ok(
  $$insert into public.teacher_absences (teacher_user_id, starts_on, ends_on, category) values ('e3000000-0000-0000-0000-000000000302', '2098-09-09', '2098-09-09', 'holiday in the sun')$$,
  '23514', null, 'only known absence categories are accepted'
);
select lives_ok(
  $$insert into public.cover_assignments (id, slot_id, cover_date, original_teacher_user_id, covering_teacher_user_id, absence_id, reason)
    values ('f3000000-0000-0000-0000-000000000308', 'f3000000-0000-0000-0000-000000000306', '2098-09-07', 'e3000000-0000-0000-0000-000000000302', 'e3000000-0000-0000-0000-000000000303', 'f3000000-0000-0000-0000-000000000307', 'Cover for Away T30')$$,
  'a cover records which absence it is for'
);
select is((select count(*)::int from public.cover_assignments where absence_id = 'f3000000-0000-0000-0000-000000000307'), 1, 'the Headteacher sees the cover in the log');

-- ── teachers ────────────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000302"}';
select throws_ok(
  $$insert into public.teacher_absences (teacher_user_id, starts_on, ends_on) values ('e3000000-0000-0000-0000-000000000302', '2098-09-10', '2098-09-10')$$,
  '42501', null, 'a teacher cannot record absences'
);
select is((select start_time::text from public.teacher_absences where id = 'f3000000-0000-0000-0000-000000000307'), '12:00:00', 'the absent teacher reads their own absence, with its times');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000303"}';
select is((select count(*)::int from public.cover_assignments), 1, 'the covering teacher reads the cover they give');
update public.cover_assignments set teacher_notified_at = now() where id = 'f3000000-0000-0000-0000-000000000308';
select is((select teacher_notified_at from public.cover_assignments where id = 'f3000000-0000-0000-0000-000000000308'), null, 'a teacher cannot mark a cover as notified');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000304"}';
select is((select count(*)::int from public.cover_assignments) + (select count(*)::int from public.teacher_absences), 0, 'another teacher sees no covers or absences');

select * from finish();
rollback;
