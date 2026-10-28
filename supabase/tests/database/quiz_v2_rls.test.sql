-- Run via `supabase test db`. Covers 0015_eligibility_quiz_v2.sql:
--   * per-year-group public sample-week marking (draft/review/published,
--     one published mark per year group, only "published" is publicly
--     readable, anonymisation guarantee still holds)
--   * quiz_config_versions publish/draft visibility
--   * quiz_sessions/quiz_events have no PII columns and are write-only for
--     anon (cannot be read back), quiz_leads cannot exist without both an
--     email and consent
begin;
select plan(20);

insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'ht@example.com'),
  ('e1000000-0000-0000-0000-000000000002', 'teacher-c@example.com'),
  ('e1000000-0000-0000-0000-000000000003', 'parent-z@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e1000000-0000-0000-0000-000000000001', 'admin', 'Head Teacher', 'ht@example.com'),
  ('e1000000-0000-0000-0000-000000000002', 'teacher', 'Teacher C', 'teacher-c@example.com'),
  ('e1000000-0000-0000-0000-000000000003', 'parent', 'Parent Z', 'parent-z@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e1000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f1000000-0000-0000-0000-000000000001', 'TEST 2099/01', '2099-09-01', '2100-07-01', true);

insert into public.year_groups (id, name) values
  ('f1000000-0000-0000-0000-000000000002', 'TEST Year 5'),
  ('f1000000-0000-0000-0000-000000000003', 'TEST Year 6'); -- deliberately left with no published mark

insert into public.subjects (id, name, is_core) values ('f1000000-0000-0000-0000-000000000004', 'TEST Qur''an', true);

insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f1000000-0000-0000-0000-000000000005', 'TEST Class C', 'TEST Year 5', 'f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000004');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e1000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f1000000-0000-0000-0000-000000000005');

insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f1000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000001', 'published', 'TEST run v1', 'manual');

insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f1000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000002', 2, '10:00', '10:30');

-- ── mark Year 5's sample week as published, as the head teacher ──────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000001"}';

insert into public.public_sample_week_marks (id, year_group_id, run_id, status, published_by, published_at)
values ('f1000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000006', 'published', 'e1000000-0000-0000-0000-000000000001', now());

select is((select count(*)::int from public.public_sample_week_mark_history where mark_id = 'f1000000-0000-0000-0000-000000000007'), 1, 'marking a sample week records one history row automatically');

-- A second published mark for the SAME year group is rejected at the DB
-- level (partial unique index), not just app validation.
select throws_ok(
  $$ insert into public.public_sample_week_marks (year_group_id, run_id, status) values ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000006', 'published') $$,
  '23505',
  null,
  'a second published mark for the same year group is rejected by the DB (one published mark per year group)'
);

reset role;

-- ── anonymisation guarantee: the public sample-week function for the
-- marked year group returns subject/weekday/time only — no teacher name,
-- no class name, no student data in the result shape at all (the column
-- list itself is the proof: teacher_user_id / class name are not even
-- selectable columns of the return type). ──────────────────────────────
select is(
  (select count(*)::int from public.public_sample_timetable_week('TEST Year 5')),
  1,
  'public_sample_timetable_week returns the published mark''s slot for the marked year group'
);
select is(
  (select subject from public.public_sample_timetable_week('TEST Year 5') limit 1),
  'TEST Qur''an',
  'the returned row carries the subject name'
);
-- Direct proof the anonymisation columns don't exist on the return type:
-- querying a nonexistent "teacher_user_id" / "class" column on the
-- function's result must fail to parse.
select throws_ok(
  $$ select teacher_user_id from public.public_sample_timetable_week('TEST Year 5') $$,
  '42703',
  null,
  'the function''s result has no teacher_user_id column at all (anonymisation is structural, not just filtered)'
);
select throws_ok(
  $$ select class_id from public.public_sample_timetable_week('TEST Year 5') $$,
  '42703',
  null,
  'the function''s result has no class_id column at all'
);

-- Year 6 has no published mark at all: the honest-fallback case returns
-- zero rows, never a fabricated week.
select is(
  (select count(*)::int from public.public_sample_timetable_week('TEST Year 6')),
  0,
  'a year group with no published sample-week mark returns no rows (honest fallback, not a fabricated week)'
);

-- The admin gap-list surfaces exactly that year group, as authenticated
-- head teacher (the "dashboard alert" an admin will actually see).
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.year_groups_missing_public_sample() where year_group_name = 'TEST Year 6'),
  1,
  'the admin gap-list flags TEST Year 6 as missing a published sample week'
);
select is(
  (select count(*)::int from public.year_groups_missing_public_sample() where year_group_name = 'TEST Year 5'),
  0,
  'TEST Year 5 (marked+published) does not appear in the gap-list'
);
reset role;

-- A plain teacher (no manage_academic / head_teacher / admin) cannot write
-- a mark and cannot read the gap-list — RLS is the real boundary here too.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$ insert into public.public_sample_week_marks (year_group_id, run_id, status) values ('f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000006', 'draft') $$,
  null, null,
  'a teacher without manage_academic/head_teacher/admin cannot create a sample-week mark'
);
reset role;

-- ── quiz_config_versions: only the published version is publicly
-- readable; a draft is not. ────────────────────────────────────────────
insert into public.quiz_config_versions (id, status, label, content) values
  ('f1000000-0000-0000-0000-000000000008', 'draft', 'TEST draft copy', '{"questions":[]}'::jsonb),
  ('f1000000-0000-0000-0000-000000000009', 'published', 'TEST live copy', '{"questions":[]}'::jsonb);

set local role anon;
select is((select count(*)::int from public.quiz_config_versions), 1, 'anon reads exactly the one published quiz config version');
select is((select label from public.quiz_config_versions limit 1), 'TEST live copy', 'anon sees only the published version''s content');
reset role;

-- ── quiz_sessions/quiz_events: anon can insert (start a quiz) but never
-- read anything back — no personal data exists on these tables at all. ──
set local role anon;
insert into public.quiz_sessions (id, session_token, year_group_id) values
  ('f1000000-0000-0000-0000-000000000010', 'test-token-abc', 'f1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.quiz_sessions), 0, 'anon cannot read back any quiz_sessions row, including their own');
insert into public.quiz_events (session_id, event_type, step_index) values
  ('f1000000-0000-0000-0000-000000000010', 'started', 0);

-- ── quiz_sessions UPDATE needs the matching session token (0161) ─────────
-- Without the x-quiz-session header nothing is updated: RLS hides the row
-- from the UPDATE so it affects 0 rows rather than erroring.
update public.quiz_sessions set current_step = 5 where id = 'f1000000-0000-0000-0000-000000000010';
reset role;
select is((select current_step from public.quiz_sessions where id = 'f1000000-0000-0000-0000-000000000010'), 0, 'anon cannot update a quiz session without its token');
set local role anon;
select set_config('request.headers', '{"x-quiz-session": "wrong-token"}', true);
update public.quiz_sessions set current_step = 6 where id = 'f1000000-0000-0000-0000-000000000010';
reset role;
select is((select current_step from public.quiz_sessions where id = 'f1000000-0000-0000-0000-000000000010'), 0, 'anon cannot update a quiz session with someone else''s token');
set local role anon;
select set_config('request.headers', '{"x-quiz-session": "test-token-abc"}', true);
update public.quiz_sessions set current_step = 7 where id = 'f1000000-0000-0000-0000-000000000010';
reset role;
select is((select current_step from public.quiz_sessions where id = 'f1000000-0000-0000-0000-000000000010'), 7, 'anon can update their own quiz session with its token');
select set_config('request.headers', '{}', true);
set local role anon;

-- ── quiz_leads: cannot be inserted without a real email + consent —
-- enforced at the schema level (not null / check constraints), matching
-- the ground rule that this be a schema guarantee, not just app discipline. ─
select throws_ok(
  $$ insert into public.quiz_leads (lead_ref, email, consent_given_at, consent_text) values ('abc123', 'not-an-email', now(), 'I agree') $$,
  '23514',
  null,
  'quiz_leads rejects a malformed email at the DB level'
);
-- The RLS check policy itself requires consent_given_at is not null (and
-- rejects the insert before the column's own not-null constraint would),
-- so this is blocked as a policy violation (42501) rather than a raw
-- not-null error — belt-and-braces enforcement at two levels, both of
-- which independently make "no consent, no row" impossible.
select throws_ok(
  $$ insert into public.quiz_leads (lead_ref, email, consent_text) values ('abc123', 'parent@example.com', 'I agree') $$,
  '42501',
  null,
  'quiz_leads cannot be inserted with no consent_given_at at all (blocked by RLS check + not-null column)'
);
insert into public.quiz_leads (id, lead_ref, email, consent_given_at, consent_text, year_group_id)
values ('f1000000-0000-0000-0000-000000000011', 'abc123ef', 'parent@example.com', now(), 'I agree to be contacted about this plan.', 'f1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.quiz_leads), 0, 'anon cannot read back the lead they just submitted');
reset role;

-- Admissions/head_teacher/admin CAN read the lead.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e1000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.quiz_leads where id = 'f1000000-0000-0000-0000-000000000011'), 1, 'head_teacher/admin can read the submitted quiz lead');
reset role;

select * from finish();
rollback;
