-- Run via `supabase test db`. Covers 0206 (classwork quizzes): only the class's staff build a
-- quiz; pupils never read the questions (answers); pupils start, save and submit through the
-- functions, which mark on the server, hand the quiz in and return the mark; the clock and the
-- attempt limit are enforced; teachers mark long answers.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('e8100000-0000-0000-0000-000000000001', 'teacher-qz1@example.com'),
  ('e8100000-0000-0000-0000-000000000002', 'teacher-qz2@example.com'),
  ('e8100000-0000-0000-0000-000000000003', 'parent-qz1@example.com'),
  ('e8100000-0000-0000-0000-000000000004', 'student-qz1@example.com'),
  ('e8100000-0000-0000-0000-000000000005', 'student-qz2@example.com'),
  ('e8100000-0000-0000-0000-000000000006', 'parent-qz2@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e8100000-0000-0000-0000-000000000001', 'teacher', 'Teacher QZ1', 'teacher-qz1@example.com'),
  ('e8100000-0000-0000-0000-000000000002', 'teacher', 'Teacher QZ2', 'teacher-qz2@example.com'),
  ('e8100000-0000-0000-0000-000000000003', 'parent', 'Parent QZ1', 'parent-qz1@example.com'),
  ('e8100000-0000-0000-0000-000000000004', 'student', 'Student QZ1', 'student-qz1@example.com'),
  ('e8100000-0000-0000-0000-000000000005', 'student', 'Student QZ2', 'student-qz2@example.com'),
  ('e8100000-0000-0000-0000-000000000006', 'parent', 'Parent QZ2', 'parent-qz2@example.com');

insert into public.year_groups (id, name) values ('f8100000-0000-0000-0000-000000000001', 'TEST Year 7 qz');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f8100000-0000-0000-0000-000000000002', 'TEST Class A qz', 'TEST Year 7 qz', 'f8100000-0000-0000-0000-000000000001'),
  ('f8100000-0000-0000-0000-000000000003', 'TEST Class B qz', 'TEST Year 7 qz', 'f8100000-0000-0000-0000-000000000001');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8100000-0000-0000-0000-000000000001', 'teacher', 'class', 'f8100000-0000-0000-0000-000000000002'),
  ('e8100000-0000-0000-0000-000000000002', 'teacher', 'class', 'f8100000-0000-0000-0000-000000000003');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f8100000-0000-0000-0000-000000000004', 'e8100000-0000-0000-0000-000000000003', 'TEST Child QZ1', '2014-01-01', 'f8100000-0000-0000-0000-000000000001', true),
  ('f8100000-0000-0000-0000-000000000005', 'e8100000-0000-0000-0000-000000000006', 'TEST Child QZ2', '2014-01-01', 'f8100000-0000-0000-0000-000000000001', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f8100000-0000-0000-0000-000000000004', 'e8100000-0000-0000-0000-000000000004'),
  ('f8100000-0000-0000-0000-000000000005', 'e8100000-0000-0000-0000-000000000005');
insert into public.enrolments (class_id, child_id) values
  ('f8100000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000004'),
  ('f8100000-0000-0000-0000-000000000003', 'f8100000-0000-0000-0000-000000000005');

insert into public.homework (id, class_id, teacher_id, title, due_at, kind, allowed_submission_types) values
  ('f8100000-0000-0000-0000-000000000006', 'f8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-000000000001', 'TEST quiz qz', now() + interval '1 day', 'quiz', array['text']);

set local role authenticated;

-- ── the class teacher builds it ──────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.homework_quizzes (homework_id, time_limit_minutes, max_attempts) values ('f8100000-0000-0000-0000-000000000006', 20, 1)$$,
  'the class teacher can set up the quiz'
);
select lives_ok(
  $$insert into public.homework_quiz_questions (id, homework_id, position, qtype, prompt, options, answer, marks) values
    ('f8100000-0000-0000-0000-000000000010', 'f8100000-0000-0000-0000-000000000006', 1, 'single', 'Two plus two?', '["3", "4", "5"]', '{"correct": 1}', 1),
    ('f8100000-0000-0000-0000-000000000011', 'f8100000-0000-0000-0000-000000000006', 2, 'true_false', 'The sky is blue.', '[]', '{"correct": true}', 1),
    ('f8100000-0000-0000-0000-000000000012', 'f8100000-0000-0000-0000-000000000006', 3, 'long', 'Explain why.', '[]', '{"model": "Because"}', 3)$$,
  'the class teacher can write questions'
);

set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.homework_quiz_questions), 0, 'a teacher of another class cannot see the questions');
select throws_ok(
  $$insert into public.homework_quiz_questions (homework_id, qtype, prompt) values ('f8100000-0000-0000-0000-000000000006', 'single', 'forged')$$,
  '42501', null, 'a teacher of another class cannot add questions'
);

-- ── the pupil sits it ────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.homework_quiz_questions), 0, 'a pupil cannot read the questions and answers directly');
select is((public.quiz_info('f8100000-0000-0000-0000-000000000006') ->> 'questions')::int, 3, 'quiz_info counts the questions');
select ok(
  (select position('"answer"' in (public.quiz_start('f8100000-0000-0000-0000-000000000006') ->> 'questions')) = 0),
  'starting hands out the questions without the answers'
);
select ok(
  (select deadline_at is not null from public.homework_quiz_attempts where homework_id = 'f8100000-0000-0000-0000-000000000006'),
  'a timed quiz has a server deadline'
);
select is(
  (select public.quiz_submit(
     (select id from public.homework_quiz_attempts where homework_id = 'f8100000-0000-0000-0000-000000000006'),
     '{"f8100000-0000-0000-0000-000000000010": 1, "f8100000-0000-0000-0000-000000000011": false, "f8100000-0000-0000-0000-000000000012": "Because"}'::jsonb
   ) ->> 'score')::numeric,
  1::numeric,
  'submitting marks the auto-marked questions on the server'
);
select is(
  (select needs_marking from public.homework_quiz_attempts where homework_id = 'f8100000-0000-0000-0000-000000000006'),
  true,
  'a long answer waits for the teacher'
);
select is(
  (select count(*)::int from public.homework_submissions where homework_id = 'f8100000-0000-0000-0000-000000000006' and submitted_at is not null),
  1,
  'the quiz is handed in as a submission'
);
select throws_ok(
  $$select public.quiz_start('f8100000-0000-0000-0000-000000000006')$$,
  '42501', 'no_attempts_left', 'a pupil cannot go past the attempt limit'
);
update public.homework_quiz_attempts set score = 99;
select is(
  (select score from public.homework_quiz_attempts where homework_id = 'f8100000-0000-0000-0000-000000000006'),
  1::numeric,
  'a pupil cannot change their attempt directly'
);

-- ── other families ───────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000005"}';
select throws_ok(
  $$select public.quiz_start('f8100000-0000-0000-0000-000000000006')$$,
  '42501', 'not_your_quiz', 'a pupil of another class cannot start the quiz'
);
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.homework_quiz_attempts), 0, 'another family cannot see the attempt');

-- ── the teacher marks the long answer ────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e8100000-0000-0000-0000-000000000001"}';
select is(
  (select public.quiz_mark(
     (select id from public.homework_quiz_attempts where homework_id = 'f8100000-0000-0000-0000-000000000006'),
     '{"f8100000-0000-0000-0000-000000000012": 2}'::jsonb
   ) ->> 'score')::numeric,
  3::numeric,
  'the teacher marks the long answer and the score updates'
);
select is(
  (select f.mark from public.homework_feedback f join public.homework_submissions s on s.id = f.submission_id where s.homework_id = 'f8100000-0000-0000-0000-000000000006'),
  3::numeric,
  'the mark is returned to the pupil'
);

select * from finish();
rollback;
