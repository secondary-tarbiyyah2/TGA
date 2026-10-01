-- Run via `supabase test db`. Covers 0066_school_day_periods.sql: the starter
-- day is seeded, any signed-in user can read it, only head_teacher/admin can
-- change it, and bad rows are rejected by the table checks.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('e6600000-0000-0000-0000-000000000001', 'ht-periods@example.com'),
  ('e6600000-0000-0000-0000-000000000002', 'teacher-periods@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e6600000-0000-0000-0000-000000000001', 'admin', 'HT Periods', 'ht-periods@example.com'),
  ('e6600000-0000-0000-0000-000000000002', 'teacher', 'Teacher Periods', 'teacher-periods@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e6600000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e6600000-0000-0000-0000-000000000002', 'teacher', 'none', null);

select ok(
  (select count(*) from public.timetable_periods where kind = 'lesson' and 'all' = any(applies_to)) >= 6,
  'starter day has the six standard lesson periods'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6600000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select ok((select count(*) from public.timetable_periods) > 0, 'a teacher can read the periods');

select throws_ok(
  $$insert into public.timetable_periods (name, kind, start_time, end_time) values ('TEST nope', 'break', '10:00', '10:10')$$,
  '42501',
  null,
  'a teacher cannot add a period'
);

select is(
  (with u as (update public.timetable_periods set name = 'TEST hacked' returning 1) select count(*)::int from u),
  0,
  'a teacher cannot edit a period'
);

select set_config('request.jwt.claims', '{"sub":"e6600000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.timetable_periods (name, kind, start_time, end_time, activity) values ('TEST Enrichment', 'enrichment', '13:00', '13:30', 'Games')$$,
  'the head can add an enrichment block'
);

select throws_ok(
  $$insert into public.timetable_periods (name, kind, start_time, end_time) values ('TEST bad', 'lesson', '11:00', '10:00')$$,
  '23514',
  null,
  'end must be after start'
);

select throws_ok(
  $$insert into public.timetable_periods (name, kind, start_time, end_time) values ('TEST bad kind', 'recess', '10:00', '11:00')$$,
  '23514',
  null,
  'unknown kind is rejected'
);

select * from finish();
rollback;
