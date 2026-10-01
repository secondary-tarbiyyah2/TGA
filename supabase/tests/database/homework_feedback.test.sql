-- Run via `supabase test db`. Covers 0071 (homework feedback loop): who may
-- read/write feedback, the server-side resubmission status, parent
-- resubmission rights, audio path scoping, and the Late & missing view.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('e7000000-0000-0000-0000-000000000001', 'ht-fb@example.com'),
  ('e7000000-0000-0000-0000-000000000002', 'teacher-fb1@example.com'),
  ('e7000000-0000-0000-0000-000000000003', 'teacher-fb2@example.com'),
  ('e7000000-0000-0000-0000-000000000004', 'parent-fb1@example.com'),
  ('e7000000-0000-0000-0000-000000000005', 'parent-fb2@example.com'),
  ('e7000000-0000-0000-0000-000000000006', 'student-fb1@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e7000000-0000-0000-0000-000000000001', 'admin', 'HT FB', 'ht-fb@example.com'),
  ('e7000000-0000-0000-0000-000000000002', 'teacher', 'Teacher FB1', 'teacher-fb1@example.com'),
  ('e7000000-0000-0000-0000-000000000003', 'teacher', 'Teacher FB2', 'teacher-fb2@example.com'),
  ('e7000000-0000-0000-0000-000000000004', 'parent', 'Parent FB1', 'parent-fb1@example.com'),
  ('e7000000-0000-0000-0000-000000000005', 'parent', 'Parent FB2', 'parent-fb2@example.com'),
  ('e7000000-0000-0000-0000-000000000006', 'student', 'Student FB1', 'student-fb1@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);

insert into public.year_groups (id, name) values ('f7000000-0000-0000-0000-000000000001', 'TEST Year 6 fb');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f7000000-0000-0000-0000-000000000002', 'TEST Class A fb', 'TEST Year 6 fb', 'f7000000-0000-0000-0000-000000000001'),
  ('f7000000-0000-0000-0000-000000000003', 'TEST Class B fb', 'TEST Year 6 fb', 'f7000000-0000-0000-0000-000000000001');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e7000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f7000000-0000-0000-0000-000000000002'),
  ('e7000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f7000000-0000-0000-0000-000000000003');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f7000000-0000-0000-0000-000000000004', 'e7000000-0000-0000-0000-000000000004', 'TEST Child FB1', '2014-01-01', 'f7000000-0000-0000-0000-000000000001', true),
  ('f7000000-0000-0000-0000-000000000005', 'e7000000-0000-0000-0000-000000000005', 'TEST Child FB2', '2014-01-01', 'f7000000-0000-0000-0000-000000000001', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f7000000-0000-0000-0000-000000000004', 'e7000000-0000-0000-0000-000000000006');
insert into public.enrolments (class_id, child_id) values
  ('f7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000004'),
  ('f7000000-0000-0000-0000-000000000003', 'f7000000-0000-0000-0000-000000000005');

-- Three homeworks for class A: one with a submission (hw1), a second with a
-- submission and no feedback yet (hw2), and an overdue one nobody handed in (hw3).
insert into public.homework (id, class_id, teacher_id, title, due_at) values
  ('f7000000-0000-0000-0000-000000000006', 'f7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'TEST hw1 fb', now() + interval '1 day'),
  ('f7000000-0000-0000-0000-000000000007', 'f7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'TEST hw2 fb', now() + interval '1 day'),
  ('f7000000-0000-0000-0000-000000000008', 'f7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'TEST hw3 fb', now() - interval '1 day');
insert into public.homework_submissions (id, homework_id, child_id, kind, response_text, submitted_at) values
  ('f7000000-0000-0000-0000-000000000009', 'f7000000-0000-0000-0000-000000000006', 'f7000000-0000-0000-0000-000000000004', 'text', 'orig', now()),
  ('f7000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-000000000007', 'f7000000-0000-0000-0000-000000000004', 'text', 'orig', now());

select is(
  (select file_size_limit::int from storage.buckets where id = 'homework-feedback-audio'),
  2097152,
  'the feedback audio bucket exists with a 2MB cap'
);

set local role authenticated;

-- ── teacher gives feedback and requests a resubmission ───────────────────
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.homework_feedback (submission_id, status, feedback_text, given_by) values ('f7000000-0000-0000-0000-000000000009', 'resubmission_requested', 'Please add working', 'e7000000-0000-0000-0000-000000000002')$$,
  'the class teacher can give feedback and request a resubmission'
);

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.homework_feedback), 0, 'a teacher of another class cannot see the feedback');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$update public.homework_feedback set status = 'resubmitted' where submission_id = 'f7000000-0000-0000-0000-000000000009'$$,
  '42501',
  null,
  'a teacher cannot set the resubmitted status themselves'
);

-- ── family visibility ────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.homework_feedback), 1, 'the parent sees their child''s feedback');
select throws_ok(
  $$insert into public.homework_feedback (submission_id, status, feedback_text) values ('f7000000-0000-0000-0000-00000000000a', 'feedback_given', 'forged')$$,
  '42501',
  null,
  'a parent cannot write feedback'
);

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.homework_feedback), 0, 'another family cannot see the feedback');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.homework_feedback), 1, 'the student sees their own feedback');
select throws_ok(
  $$insert into public.homework_feedback (submission_id, status, feedback_text) values ('f7000000-0000-0000-0000-00000000000a', 'feedback_given', 'forged')$$,
  '42501',
  null,
  'a student cannot write feedback'
);

-- ── the parent resubmits while a resubmission is requested ───────────────
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000004"}';
select lives_ok(
  $$update public.homework_submissions set response_text = 'v2', submitted_at = now() where id = 'f7000000-0000-0000-0000-000000000009'$$,
  'a parent can resubmit while a resubmission is requested'
);
select is(
  (select status from public.homework_feedback where submission_id = 'f7000000-0000-0000-0000-000000000009'),
  'resubmitted',
  'the status moves to resubmitted automatically'
);
select is(
  (select resubmit_count from public.homework_feedback where submission_id = 'f7000000-0000-0000-0000-000000000009'),
  1,
  'the resubmission is counted'
);

-- Once resubmitted there is no open request, so a further edit is refused
-- (the update matches no row and the text stays as it was).
update public.homework_submissions set response_text = 'v3' where id = 'f7000000-0000-0000-0000-000000000009';
select is(
  (select response_text from public.homework_submissions where id = 'f7000000-0000-0000-0000-000000000009'),
  'v2',
  'a parent cannot edit a submission once there is no open request'
);

-- No request at all on hw2, so the parent cannot touch it.
update public.homework_submissions set response_text = 'tampered' where id = 'f7000000-0000-0000-0000-00000000000a';
select is(
  (select response_text from public.homework_submissions where id = 'f7000000-0000-0000-0000-00000000000a'),
  'orig',
  'a parent cannot edit a submission that has no resubmission request'
);

-- ── audio notes must live in the submission's own folder ─────────────────
set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.homework_feedback (submission_id, status, audio_path) values ('f7000000-0000-0000-0000-00000000000a', 'feedback_given', 'f7000000-0000-0000-0000-000000000007/f7000000-0000-0000-0000-000000000005/note.webm')$$,
  '22023',
  null,
  'audio feedback cannot point into another child''s folder'
);
select lives_ok(
  $$insert into public.homework_feedback (submission_id, status, audio_path, audio_seconds) values ('f7000000-0000-0000-0000-00000000000a', 'feedback_given', 'f7000000-0000-0000-0000-000000000007/f7000000-0000-0000-0000-000000000004/note.webm', 20)$$,
  'audio feedback in the submission''s own folder is accepted'
);

-- ── Late & missing ───────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.homework_attention where attention = 'missing'),
  1,
  'the teacher''s Late & missing view lists the overdue homework nobody handed in'
);

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.homework_attention), 0, 'another family sees nothing in the Late & missing view');

set local "request.jwt.claims" to '{"sub": "e7000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.homework_attention where attention = 'missing'),
  1,
  'the head sees the whole school''s missing homework'
);

select * from finish();
rollback;
