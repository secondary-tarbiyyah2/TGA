-- Run via `supabase test db`. Covers 0074_streaks_stars.sql: child_streaks()
-- (attendance + on-time homework, access limited to the family, the child's
-- teachers and head/admin), the star_of_the_week nomination/approval flow
-- (teachers nominate for their own class only and cannot approve; head/admin
-- decide), suggestions being staff-only, and the public board never
-- naming a child who opted out of the leaderboard.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('e7400000-0000-0000-0000-000000000001', 'ht-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000002', 'teacher-k-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000003', 'teacher-l-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000004', 'parent-p-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000005', 'parent-q-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000006', 'outsider-ss@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e7400000-0000-0000-0000-000000000001', 'admin', 'HT SS', 'ht-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000002', 'teacher', 'Teacher K SS', 'teacher-k-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000003', 'teacher', 'Teacher L SS', 'teacher-l-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000004', 'parent', 'Parent P SS', 'parent-p-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000005', 'parent', 'Parent Q SS', 'parent-q-ss@example.com'),
  ('e7400000-0000-0000-0000-000000000006', 'staff', 'Outsider SS', 'outsider-ss@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7400000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e7400000-0000-0000-0000-000000000006', 'admissions', 'none', null);

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f7400000-0000-0000-0000-000000000001', 'TEST 2099/00 ss', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f7400000-0000-0000-0000-000000000002', 'TEST Year 5 ss');
insert into public.subjects (id, name, is_core) values ('f7400000-0000-0000-0000-000000000003', 'TEST Maths ss', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f7400000-0000-0000-0000-000000000004', 'TEST Class K ss', 'TEST Year 5 ss', 'f7400000-0000-0000-0000-000000000001', 'f7400000-0000-0000-0000-000000000002', 'f7400000-0000-0000-0000-000000000003'),
  ('f7400000-0000-0000-0000-000000000005', 'TEST Class L ss', 'TEST Year 5 ss', 'f7400000-0000-0000-0000-000000000001', 'f7400000-0000-0000-0000-000000000002', 'f7400000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7400000-0000-0000-0000-000000000002', 'teacher', 'class', 'f7400000-0000-0000-0000-000000000004'),
  ('e7400000-0000-0000-0000-000000000003', 'teacher', 'class', 'f7400000-0000-0000-0000-000000000005');

-- C1 (parent P) and C2 (parent Q, opted out of the leaderboard) are in class K; C3 (parent Q) is in class L.
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test, hide_from_leaderboard) values
  ('f7400000-0000-0000-0000-000000000011', 'e7400000-0000-0000-0000-000000000004', 'Amina Khan', '2015-01-01', 'f7400000-0000-0000-0000-000000000002', true, false),
  ('f7400000-0000-0000-0000-000000000012', 'e7400000-0000-0000-0000-000000000005', 'Hidden Child', '2015-01-01', 'f7400000-0000-0000-0000-000000000002', true, true),
  ('f7400000-0000-0000-0000-000000000013', 'e7400000-0000-0000-0000-000000000005', 'Other Class', '2015-01-01', 'f7400000-0000-0000-0000-000000000002', true, false);

insert into public.enrolments (class_id, child_id, created_at) values
  ('f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000011', now() - interval '60 days'),
  ('f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000012', now() - interval '60 days'),
  ('f7400000-0000-0000-0000-000000000005', 'f7400000-0000-0000-0000-000000000013', now() - interval '60 days');

insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f7400000-0000-0000-0000-000000000021', 'f7400000-0000-0000-0000-000000000001', 'published', 'TEST published run ss', 'manual');
insert into public.timetable_slots (id, run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f7400000-0000-0000-0000-000000000022', 'f7400000-0000-0000-0000-000000000021', 'f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000003', 'e7400000-0000-0000-0000-000000000002', 1, '09:00', '10:00');

-- Four lesson days: 6 days ago (C1 absent), then 5, 4 and 3 days ago (C1 present) => streak of 3.
insert into public.lesson_instances (id, timetable_slot_id, date) values
  ('f7400000-0000-0000-0000-000000000031', 'f7400000-0000-0000-0000-000000000022', current_date - 6),
  ('f7400000-0000-0000-0000-000000000032', 'f7400000-0000-0000-0000-000000000022', current_date - 5),
  ('f7400000-0000-0000-0000-000000000033', 'f7400000-0000-0000-0000-000000000022', current_date - 4),
  ('f7400000-0000-0000-0000-000000000034', 'f7400000-0000-0000-0000-000000000022', current_date - 3);
insert into public.attendance_records (lesson_instance_id, child_id, status, marked_by) values
  ('f7400000-0000-0000-0000-000000000031', 'f7400000-0000-0000-0000-000000000011', 'absent', 'e7400000-0000-0000-0000-000000000002'),
  ('f7400000-0000-0000-0000-000000000032', 'f7400000-0000-0000-0000-000000000011', 'present', 'e7400000-0000-0000-0000-000000000002'),
  ('f7400000-0000-0000-0000-000000000033', 'f7400000-0000-0000-0000-000000000011', 'late', 'e7400000-0000-0000-0000-000000000002'),
  ('f7400000-0000-0000-0000-000000000034', 'f7400000-0000-0000-0000-000000000011', 'present', 'e7400000-0000-0000-0000-000000000002'),
  ('f7400000-0000-0000-0000-000000000034', 'f7400000-0000-0000-0000-000000000012', 'absent', 'e7400000-0000-0000-0000-000000000002');

-- Homework due in the past: missed (4 days ago), then on time twice => on-time streak of 2.
insert into public.homework (id, class_id, teacher_id, title, due_at) values
  ('f7400000-0000-0000-0000-000000000041', 'f7400000-0000-0000-0000-000000000004', 'e7400000-0000-0000-0000-000000000002', 'TEST hw missed', now() - interval '4 days'),
  ('f7400000-0000-0000-0000-000000000042', 'f7400000-0000-0000-0000-000000000004', 'e7400000-0000-0000-0000-000000000002', 'TEST hw one', now() - interval '3 days'),
  ('f7400000-0000-0000-0000-000000000043', 'f7400000-0000-0000-0000-000000000004', 'e7400000-0000-0000-0000-000000000002', 'TEST hw two', now() - interval '2 days');
insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at) values
  ('f7400000-0000-0000-0000-000000000042', 'f7400000-0000-0000-0000-000000000011', 'text', 'done', now() - interval '3 days 2 hours'),
  ('f7400000-0000-0000-0000-000000000043', 'f7400000-0000-0000-0000-000000000011', 'text', 'done', now() - interval '2 days 1 hour');

-- Merits this week (for suggestions): C1 has 5, hidden C2 has 2.
insert into public.behaviour_records (child_id, class_id, kind, points, category, recorded_by) values
  ('f7400000-0000-0000-0000-000000000011', 'f7400000-0000-0000-0000-000000000004', 'merit', 5, 'Excellent work', 'e7400000-0000-0000-0000-000000000001'),
  ('f7400000-0000-0000-0000-000000000012', 'f7400000-0000-0000-0000-000000000004', 'merit', 2, 'Helpfulness', 'e7400000-0000-0000-0000-000000000001');

-- A star for the hidden child from last week, approved by seed (service) so the board exclusion is tested.
insert into public.star_of_the_week (id, class_id, child_id, week_start, reason, nominated_by, status) values
  ('f7400000-0000-0000-0000-000000000051', 'f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000012',
   (date_trunc('week', current_date)::date - 7), 'Kindness all week', 'e7400000-0000-0000-0000-000000000002', 'approved');

set local role authenticated;

-- Streaks ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000004"}';
select is((select attendance_days from public.child_streaks('f7400000-0000-0000-0000-000000000011')), 3, 'attendance streak counts present/late days back to the last miss');
select is((select homework_on_time from public.child_streaks('f7400000-0000-0000-0000-000000000011')), 2, 'on-time homework streak stops at the missed piece');
select throws_ok($$select * from public.child_streaks('f7400000-0000-0000-0000-000000000012')$$, '42501', null, 'a parent cannot read another family''s streaks');

set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000005"}';
select is((select attendance_days from public.child_streaks('f7400000-0000-0000-0000-000000000012')), 0, 'a child with only absences has a zero streak');

set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000002"}';
select is((select attendance_days from public.child_streaks('f7400000-0000-0000-0000-000000000011')), 3, 'the class teacher can read a pupil''s streaks');
set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000003"}';
select throws_ok($$select * from public.child_streaks('f7400000-0000-0000-0000-000000000011')$$, '42501', null, 'another class''s teacher cannot read the streaks');

-- Nominations -----------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000002"}';
select is((select child_id from public.star_suggestions('f7400000-0000-0000-0000-000000000004', date_trunc('week', current_date)::date) limit 1), 'f7400000-0000-0000-0000-000000000011'::uuid, 'the top merit earner is suggested first');
select is((select hidden from public.star_suggestions('f7400000-0000-0000-0000-000000000004', date_trunc('week', current_date)::date) where child_id = 'f7400000-0000-0000-0000-000000000012'), true, 'an opted-out child is flagged hidden for staff');
select lives_ok(
  $$insert into public.star_of_the_week (class_id, child_id, week_start, reason) values ('f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000011', date_trunc('week', current_date)::date, 'Brilliant effort in Maths')$$,
  'a teacher can nominate a pupil in their own class'
);
select throws_ok(
  $$insert into public.star_of_the_week (class_id, child_id, week_start, reason) values ('f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000013', (date_trunc('week', current_date)::date - 14), 'Not in this class')$$,
  '42501', null, 'a teacher cannot nominate a pupil who is not in the class'
);
select throws_ok(
  $$update public.star_of_the_week set status = 'approved' where class_id = 'f7400000-0000-0000-0000-000000000004' and week_start = date_trunc('week', current_date)::date$$,
  'P0001', null, 'a teacher cannot approve their own nomination'
);
select lives_ok(
  $$insert into public.star_of_the_week (class_id, child_id, week_start, reason) values ('f7400000-0000-0000-0000-000000000004', 'f7400000-0000-0000-0000-000000000011', (date_trunc('week', current_date)::date - 21), 'Pending one')$$,
  'a teacher can add a second pending nomination'
);
delete from public.star_of_the_week where class_id = 'f7400000-0000-0000-0000-000000000004' and week_start = (date_trunc('week', current_date)::date - 21);
select is((select count(*)::int from public.star_of_the_week where week_start = (date_trunc('week', current_date)::date - 21)), 0, 'a teacher can withdraw a pending nomination');

-- Another class's teacher sees nothing; head/admin approve --------------------
set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.star_of_the_week), 0, 'another class''s teacher sees no nominations');

set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000001"}';
update public.star_of_the_week set status = 'approved' where class_id = 'f7400000-0000-0000-0000-000000000004' and week_start = date_trunc('week', current_date)::date;
select is((select decided_by from public.star_of_the_week where week_start = date_trunc('week', current_date)::date), 'e7400000-0000-0000-0000-000000000001'::uuid, 'approval stamps who decided');

-- Board: public shout-out hides the opted-out child ---------------------------
set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.star_of_the_week_board(2)), 1, 'the board lists the approved star but never the opted-out child');
select is((select count(*)::int from public.star_of_the_week where child_id = 'f7400000-0000-0000-0000-000000000012'), 1, 'the opted-out child''s own family still sees their star');

select throws_ok($$select * from public.star_suggestions('f7400000-0000-0000-0000-000000000004', date_trunc('week', current_date)::date)$$, '42501', null, 'a parent cannot see star suggestions');

set local "request.jwt.claims" to '{"sub": "e7400000-0000-0000-0000-000000000006"}';
select throws_ok($$select * from public.star_of_the_week_board()$$, '42501', null, 'admissions-only staff cannot see the board');

select * from finish();
rollback;
