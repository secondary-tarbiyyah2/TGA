-- Run via `supabase test db`. Covers 0067 (staff_profiles / meet_my_teachers)
-- and 0068 (merit_leaderboard): teacher edits own profile only, families see
-- only their child's teachers, compliance data stays admin-only, and the
-- leaderboard honours scope access, the opt-out flag and ignores demerits.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e6000000-0000-0000-0000-000000000001', 'ht@example.com'),
  ('e6000000-0000-0000-0000-000000000002', 'teacher-a@example.com'),
  ('e6000000-0000-0000-0000-000000000003', 'teacher-b@example.com'),
  ('e6000000-0000-0000-0000-000000000004', 'parent-x@example.com'),
  ('e6000000-0000-0000-0000-000000000005', 'parent-y@example.com'),
  ('e6000000-0000-0000-0000-000000000006', 'outsider@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e6000000-0000-0000-0000-000000000001', 'admin', 'Head Teacher', 'ht@example.com'),
  ('e6000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A', 'teacher-a@example.com'),
  ('e6000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B', 'teacher-b@example.com'),
  ('e6000000-0000-0000-0000-000000000004', 'parent', 'Parent X', 'parent-x@example.com'),
  ('e6000000-0000-0000-0000-000000000005', 'parent', 'Parent Y', 'parent-y@example.com'),
  ('e6000000-0000-0000-0000-000000000006', 'staff', 'Outsider', 'outsider@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e6000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e6000000-0000-0000-0000-000000000006', 'admissions', 'none', null);

insert into public.year_groups (id, name) values ('f6000000-0000-0000-0000-000000000001', 'TEST Year 6 lb');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f6000000-0000-0000-0000-000000000002', 'TEST Class A lb', 'TEST Year 6 lb', 'f6000000-0000-0000-0000-000000000001'),
  ('f6000000-0000-0000-0000-000000000003', 'TEST Class B lb', 'TEST Year 6 lb', 'f6000000-0000-0000-0000-000000000001');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e6000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f6000000-0000-0000-0000-000000000002'),
  ('e6000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f6000000-0000-0000-0000-000000000003');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test, hide_from_leaderboard) values
  ('f6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000004', 'Amina Khan', '2015-01-01', 'f6000000-0000-0000-0000-000000000001', true, false),
  ('f6000000-0000-0000-0000-000000000005', 'e6000000-0000-0000-0000-000000000005', 'Yusuf Ali', '2015-01-01', 'f6000000-0000-0000-0000-000000000001', true, false),
  ('f6000000-0000-0000-0000-000000000006', 'e6000000-0000-0000-0000-000000000005', 'Hidden Child', '2015-01-01', 'f6000000-0000-0000-0000-000000000001', true, true);
insert into public.enrolments (class_id, child_id) values
  ('f6000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000004'),
  ('f6000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000005'),
  ('f6000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000006');

insert into public.behaviour_records (child_id, class_id, kind, points, category, recorded_by) values
  ('f6000000-0000-0000-0000-000000000004', 'f6000000-0000-0000-0000-000000000002', 'merit', 2, 'Excellent work', 'e6000000-0000-0000-0000-000000000001'),
  ('f6000000-0000-0000-0000-000000000004', 'f6000000-0000-0000-0000-000000000002', 'demerit', -1, 'Lateness', 'e6000000-0000-0000-0000-000000000001'),
  ('f6000000-0000-0000-0000-000000000005', 'f6000000-0000-0000-0000-000000000003', 'merit', 1, 'Helpfulness', 'e6000000-0000-0000-0000-000000000001'),
  ('f6000000-0000-0000-0000-000000000006', 'f6000000-0000-0000-0000-000000000003', 'merit', 9, 'Leadership', 'e6000000-0000-0000-0000-000000000001');

insert into public.staff_vetting_records (user_id, dbs_check_date) values ('e6000000-0000-0000-0000-000000000002', '2025-01-01');

set local role authenticated;

-- Teacher A edits own profile, not Teacher B's
set local "request.jwt.claims" to '{"sub": "e6000000-0000-0000-0000-000000000002"}';
select lives_ok($$insert into public.staff_profiles (user_id, display_title, bio) values ('e6000000-0000-0000-0000-000000000002', 'Mr', 'Hello')$$, 'teacher can create own profile');
select throws_ok($$insert into public.staff_profiles (user_id, bio) values ('e6000000-0000-0000-0000-000000000003', 'x')$$, '42501', null, 'teacher cannot create another teacher''s profile');
select is((select count(*)::int from public.staff_vetting_records), 0, 'teacher cannot read compliance records');

-- Teacher B publishes a profile (as head) so families can see it
set local "request.jwt.claims" to '{"sub": "e6000000-0000-0000-0000-000000000001"}';
insert into public.staff_profiles (user_id, display_title, bio, contact_visible) values ('e6000000-0000-0000-0000-000000000003', 'Mrs', 'B bio', false);

-- Parent X: only Teacher A (their child's teacher), no email (contact_visible false)
set local "request.jwt.claims" to '{"sub": "e6000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.meet_my_teachers()), 1, 'parent X sees exactly one teacher');
select is((select full_name from public.meet_my_teachers()), 'Teacher A', 'parent X sees their child''s teacher');
select is((select count(*)::int from public.staff_profiles), 0, 'parent cannot read staff_profiles directly');

-- Leaderboard: class scope
select is((select merits from public.merit_leaderboard('class', 'f6000000-0000-0000-0000-000000000002')), 2, 'demerits are ignored; merits summed');
select throws_ok($$select * from public.merit_leaderboard('class', 'f6000000-0000-0000-0000-000000000003')$$, '42501', null, 'parent cannot view a class their child is not in');

-- School scope: hidden child excluded, own child flagged
select is((select count(*)::int from public.merit_leaderboard('school')), 2, 'opted-out child never appears');
select is((select is_mine from public.merit_leaderboard('school') where first_name = 'Amina'), true, 'own child is flagged');

-- Admissions-only staff are refused
set local "request.jwt.claims" to '{"sub": "e6000000-0000-0000-0000-000000000006"}';
select throws_ok($$select * from public.merit_leaderboard('school')$$, '42501', null, 'admissions staff cannot view the leaderboard');

select * from finish();
rollback;
