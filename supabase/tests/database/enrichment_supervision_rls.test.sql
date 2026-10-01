-- Run via `supabase test db`. Covers 0069_enrichment_supervision.sql:
-- the supervisor name is visible to families (name only), the roster and the
-- enrichment_attendance ticks are limited to the block's supervisor and
-- Headteacher/Admin, and a supervisor cannot tick a child outside the roster.
begin;
select plan(13);

insert into auth.users (id, email) values
  ('e6900000-0000-0000-0000-000000000001', 'ht-enr@example.com'),
  ('e6900000-0000-0000-0000-000000000002', 'sup-enr@example.com'),
  ('e6900000-0000-0000-0000-000000000003', 'other-enr@example.com'),
  ('e6900000-0000-0000-0000-000000000004', 'parent-enr@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e6900000-0000-0000-0000-000000000001', 'admin', 'HT Enr', 'ht-enr@example.com'),
  ('e6900000-0000-0000-0000-000000000002', 'teacher', 'Supervisor Enr', 'sup-enr@example.com'),
  ('e6900000-0000-0000-0000-000000000003', 'teacher', 'Other Teacher Enr', 'other-enr@example.com'),
  ('e6900000-0000-0000-0000-000000000004', 'parent', 'Parent Enr', 'parent-enr@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e6900000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e6900000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('e6900000-0000-0000-0000-000000000003', 'teacher', 'none', null);

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f6900000-0000-0000-0000-000000000001', 'TEST 2099/00 enr', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f6900000-0000-0000-0000-000000000002', 'TEST Year 5 enr');
insert into public.subjects (id, name, is_core) values ('f6900000-0000-0000-0000-000000000003', 'TEST Maths enr', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f6900000-0000-0000-0000-000000000004', 'TEST Class enr', 'TEST Year 5 enr', 'f6900000-0000-0000-0000-000000000001', 'f6900000-0000-0000-0000-000000000002', 'f6900000-0000-0000-0000-000000000003');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f6900000-0000-0000-0000-000000000005', 'e6900000-0000-0000-0000-000000000004', 'TEST Child enr', '2015-01-01', 'f6900000-0000-0000-0000-000000000002', true),
  ('f6900000-0000-0000-0000-000000000006', 'e6900000-0000-0000-0000-000000000004', 'TEST Unenrolled enr', '2015-01-01', 'f6900000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values
  ('f6900000-0000-0000-0000-000000000004', 'f6900000-0000-0000-0000-000000000005');
-- The second child is deliberately NOT enrolled, so is not on any roster.

insert into public.timetable_periods (id, name, kind, start_time, end_time, applies_to, activity, supervisor_user_id) values
  ('f6900000-0000-0000-0000-000000000007', 'TEST Enrichment enr', 'enrichment', '13:00', '13:30', '{primary}', 'Games', 'e6900000-0000-0000-0000-000000000002');

set local role authenticated;

-- Families can see the supervisor's NAME and nothing else about them.
select set_config('request.jwt.claims', '{"sub":"e6900000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select supervisor_name from public.period_supervisor_names() where period_id = 'f6900000-0000-0000-0000-000000000007'),
  'Supervisor Enr',
  'a parent can read the supervisor name of a block'
);
select is((select count(*)::int from public.enrichment_roster('f6900000-0000-0000-0000-000000000007')), 0, 'a parent gets no roster');

select is(
  public.year_group_audiences('Year 10'),
  array['all', 'year 10', 'gcse']::text[],
  'year group audiences mirror the app (Year 10 is gcse)'
);

-- Another teacher is not the supervisor.
select set_config('request.jwt.claims', '{"sub":"e6900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.enrichment_roster('f6900000-0000-0000-0000-000000000007')), 0, 'a different teacher gets no roster');
select is(public.period_supervised_by_me('f6900000-0000-0000-0000-000000000007'), false, 'a different teacher is not the supervisor');
select throws_ok(
  $$insert into public.enrichment_attendance (period_id, attendance_date, child_id) values ('f6900000-0000-0000-0000-000000000007', '2099-09-07', 'f6900000-0000-0000-0000-000000000005')$$,
  '42501',
  null,
  'a different teacher cannot tick the register'
);

-- The supervisor.
select set_config('request.jwt.claims', '{"sub":"e6900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.enrichment_roster('f6900000-0000-0000-0000-000000000007')), 1, 'the supervisor sees the one enrolled child on the roster');
select lives_ok(
  $$insert into public.enrichment_attendance (period_id, attendance_date, child_id, present) values ('f6900000-0000-0000-0000-000000000007', '2099-09-07', 'f6900000-0000-0000-0000-000000000005', true)$$,
  'the supervisor can tick an enrolled child'
);
select throws_ok(
  $$insert into public.enrichment_attendance (period_id, attendance_date, child_id) values ('f6900000-0000-0000-0000-000000000007', '2099-09-07', 'f6900000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'the supervisor cannot tick a child who is not on the roster'
);
select is(
  (select marked_by from public.enrichment_attendance limit 1),
  'e6900000-0000-0000-0000-000000000002'::uuid,
  'marked_by is stamped with the supervisor'
);

-- Families cannot see the ticks; the head can see and correct them.
select set_config('request.jwt.claims', '{"sub":"e6900000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.enrichment_attendance), 0, 'a parent cannot read the enrichment register');

select set_config('request.jwt.claims', '{"sub":"e6900000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.enrichment_attendance), 1, 'the head can read the enrichment register');
update public.enrichment_attendance set present = false;
select is((select present from public.enrichment_attendance limit 1), false, 'the head can correct a tick');

select * from finish();
rollback;
