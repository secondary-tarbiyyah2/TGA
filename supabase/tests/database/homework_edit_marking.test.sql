-- Run via `supabase test db`. Covers 0077 (edit / archive homework, allowed
-- submission types, multi-file submissions, parent first submission, late
-- policy) and 0078 (markup strokes are staff-only, marked files and marks on
-- homework_feedback, path scoping).
begin;
select plan(36);

insert into auth.users (id, email) values
  ('e9000000-0000-0000-0000-000000000001', 'ht-hm@example.com'),
  ('e9000000-0000-0000-0000-000000000002', 'teacher-hm1@example.com'),
  ('e9000000-0000-0000-0000-000000000003', 'teacher-hm2@example.com'),
  ('e9000000-0000-0000-0000-000000000004', 'parent-hm1@example.com'),
  ('e9000000-0000-0000-0000-000000000005', 'parent-hm2@example.com'),
  ('e9000000-0000-0000-0000-000000000006', 'student-hm1@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e9000000-0000-0000-0000-000000000001', 'admin', 'HT HM', 'ht-hm@example.com'),
  ('e9000000-0000-0000-0000-000000000002', 'teacher', 'Teacher HM1', 'teacher-hm1@example.com'),
  ('e9000000-0000-0000-0000-000000000003', 'teacher', 'Teacher HM2', 'teacher-hm2@example.com'),
  ('e9000000-0000-0000-0000-000000000004', 'parent', 'Parent HM1', 'parent-hm1@example.com'),
  ('e9000000-0000-0000-0000-000000000005', 'parent', 'Parent HM2', 'parent-hm2@example.com'),
  ('e9000000-0000-0000-0000-000000000006', 'student', 'Student HM1', 'student-hm1@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e9000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);

insert into public.year_groups (id, name) values ('f9000000-0000-0000-0000-000000000001', 'TEST Year 6 hm');
insert into public.classes (id, name, year_group, year_group_id) values
  ('f9000000-0000-0000-0000-000000000002', 'TEST Class A hm', 'TEST Year 6 hm', 'f9000000-0000-0000-0000-000000000001'),
  ('f9000000-0000-0000-0000-000000000003', 'TEST Class B hm', 'TEST Year 6 hm', 'f9000000-0000-0000-0000-000000000001');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e9000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f9000000-0000-0000-0000-000000000002'),
  ('e9000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f9000000-0000-0000-0000-000000000003');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f9000000-0000-0000-0000-000000000004', 'e9000000-0000-0000-0000-000000000004', 'TEST Child HM1', '2014-01-01', 'f9000000-0000-0000-0000-000000000001', true),
  ('f9000000-0000-0000-0000-000000000005', 'e9000000-0000-0000-0000-000000000005', 'TEST Child HM2', '2014-01-01', 'f9000000-0000-0000-0000-000000000001', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f9000000-0000-0000-0000-000000000004', 'e9000000-0000-0000-0000-000000000006');
insert into public.enrolments (class_id, child_id) values
  ('f9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000004'),
  ('f9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000005');

-- All set by teacher 1 for class A and created a day ago (so the "edited" stamp applies).
--   a = edit target, a2 = archive target, c = text only, d = one PDF only,
--   e = everything allowed, g = parent hands in, h = late work blocked, i = no submissions
insert into public.homework (id, class_id, teacher_id, title, due_at, created_at, allowed_submission_types, allowed_file_types, late_policy) values
  ('f9000000-0000-0000-0000-000000000010', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw a', now() + interval '2 days', now() - interval '1 day', default, default, default),
  ('f9000000-0000-0000-0000-000000000011', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw a2', now() + interval '2 days', now() - interval '1 day', default, default, default),
  ('f9000000-0000-0000-0000-000000000012', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw c', now() + interval '2 days', now() - interval '1 day', array['text'], default, default),
  ('f9000000-0000-0000-0000-000000000013', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw d', now() + interval '2 days', now() - interval '1 day', array['file'], array['pdf'], default),
  ('f9000000-0000-0000-0000-000000000014', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw e', now() + interval '2 days', now() - interval '1 day', default, default, default),
  ('f9000000-0000-0000-0000-000000000015', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw g', now() + interval '2 days', now() - interval '1 day', default, default, default),
  ('f9000000-0000-0000-0000-000000000016', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw h', now() - interval '1 day', now() - interval '3 days', default, default, 'block'),
  ('f9000000-0000-0000-0000-000000000017', 'f9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'TEST hw i', now() + interval '2 days', now() - interval '1 day', default, default, default);

select is(
  (select file_size_limit::int from storage.buckets where id = 'homework-submissions'),
  52428800,
  'the submissions bucket now allows 50MB files'
);
select is(
  (select count(*)::int from storage.buckets where id in ('homework-attachments', 'homework-marked')),
  2,
  'the attachments and marked-work buckets exist'
);

set local role authenticated;

-- ── editing ──────────────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$update public.homework set title = 'Edited title', max_points = 10 where id = 'f9000000-0000-0000-0000-000000000010'$$,
  'the assigning teacher can edit their homework'
);
select ok(
  (select edited_at is not null from public.homework where id = 'f9000000-0000-0000-0000-000000000010'),
  'an edit stamps edited_at'
);
select is(
  (select edited_by from public.homework where id = 'f9000000-0000-0000-0000-000000000010'),
  'e9000000-0000-0000-0000-000000000002'::uuid,
  'an edit records who edited'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$update public.homework set title = 'Edited by head', teacher_id = 'e9000000-0000-0000-0000-000000000001' where id = 'f9000000-0000-0000-0000-000000000010'$$,
  'the head can edit any homework'
);
select is(
  (select teacher_id from public.homework where id = 'f9000000-0000-0000-0000-000000000010'),
  'e9000000-0000-0000-0000-000000000002'::uuid,
  'the original setter stays the setter after the head edits'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000003"}';
update public.homework set title = 'hijack' where id = 'f9000000-0000-0000-0000-000000000010';

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000002"}';
select is(
  (select title from public.homework where id = 'f9000000-0000-0000-0000-000000000010'),
  'Edited by head',
  'a teacher of another class cannot edit the homework'
);

-- ── archive (soft delete) ────────────────────────────────────────────────
select lives_ok(
  $$update public.homework set archived_at = now() where id = 'f9000000-0000-0000-0000-000000000011'$$,
  'the assigning teacher can archive homework'
);
select is(
  (select archived_by from public.homework where id = 'f9000000-0000-0000-0000-000000000011'),
  'e9000000-0000-0000-0000-000000000002'::uuid,
  'archiving records who did it'
);
select is(
  (select count(*)::int from public.homework where id in ('f9000000-0000-0000-0000-000000000010', 'f9000000-0000-0000-0000-000000000011')),
  2,
  'staff still see archived homework (so it can be restored)'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000006"}';
select is(
  (select count(*)::int from public.homework where id in ('f9000000-0000-0000-0000-000000000010', 'f9000000-0000-0000-0000-000000000011')),
  1,
  'a student no longer sees archived homework'
);
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at) values ('f9000000-0000-0000-0000-000000000011', 'f9000000-0000-0000-0000-000000000004', 'text', 'late', now())$$,
  '42501',
  null,
  'a student cannot hand in to archived homework'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000004"}';
select is(
  (select count(*)::int from public.homework where id in ('f9000000-0000-0000-0000-000000000010', 'f9000000-0000-0000-0000-000000000011')),
  1,
  'a parent no longer sees archived homework'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$update public.homework set archived_at = null where id = 'f9000000-0000-0000-0000-000000000011'$$,
  'the head can restore archived homework'
);

-- ── what may be handed in ────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000006"}';
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, link_url, submitted_at) values ('f9000000-0000-0000-0000-000000000012', 'f9000000-0000-0000-0000-000000000004', 'link', 'https://example.com', now())$$,
  '23514',
  null,
  'a link is refused when the homework only takes typed answers'
);
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, file_path, files, submitted_at) values ('f9000000-0000-0000-0000-000000000013', 'f9000000-0000-0000-0000-000000000004', 'file', 'f9000000-0000-0000-0000-000000000013/f9000000-0000-0000-0000-000000000004/1-a.png', '[{"path": "f9000000-0000-0000-0000-000000000013/f9000000-0000-0000-0000-000000000004/1-a.png", "name": "a.png", "mime": "image/png", "size": 1}]'::jsonb, now())$$,
  '23514',
  null,
  'an image is refused when only PDFs are allowed'
);
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, file_path, files, submitted_at) values ('f9000000-0000-0000-0000-000000000017', 'f9000000-0000-0000-0000-000000000004', 'file', 'f9000000-0000-0000-0000-000000000017/f9000000-0000-0000-0000-000000000005/1-a.pdf', '[{"path": "f9000000-0000-0000-0000-000000000017/f9000000-0000-0000-0000-000000000005/1-a.pdf", "name": "a.pdf", "mime": "application/pdf", "size": 1}]'::jsonb, now())$$,
  '22023',
  null,
  'a file path inside another child''s folder is refused'
);
select lives_ok(
  $$insert into public.homework_submissions (id, homework_id, child_id, kind, response_text, file_path, files, submitted_at) values ('f9000000-0000-0000-0000-000000000020', 'f9000000-0000-0000-0000-000000000014', 'f9000000-0000-0000-0000-000000000004', 'mixed', 'see attached', null, '[{"path": "f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/1-a.pdf", "name": "a.pdf", "mime": "application/pdf", "size": 1}, {"path": "f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/2-b.jpg", "name": "b.jpg", "mime": "image/jpeg", "size": 1}]'::jsonb, now())$$,
  'a student can hand in text and several files together'
);
select is(
  (select file_path from public.homework_submissions where id = 'f9000000-0000-0000-0000-000000000020'),
  'f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/1-a.pdf',
  'file_path mirrors the first file in the list'
);
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at) values ('f9000000-0000-0000-0000-000000000016', 'f9000000-0000-0000-0000-000000000004', 'text', 'too late', now())$$,
  '42501',
  null,
  'a student cannot hand in after the due time when late work is blocked'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000004"}';
select lives_ok(
  $$insert into public.homework_submissions (id, homework_id, child_id, kind, response_text, submitted_at) values ('f9000000-0000-0000-0000-000000000021', 'f9000000-0000-0000-0000-000000000015', 'f9000000-0000-0000-0000-000000000004', 'text', 'handed in by parent', now())$$,
  'a parent can hand in the first submission for their child'
);
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000005"}';
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at) values ('f9000000-0000-0000-0000-000000000017', 'f9000000-0000-0000-0000-000000000004', 'text', 'not my child', now())$$,
  '42501',
  null,
  'another family cannot hand in for someone else''s child'
);

-- ── a class cannot change once work has been handed in ──────────────────
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$update public.homework set class_id = 'f9000000-0000-0000-0000-000000000003' where id = 'f9000000-0000-0000-0000-000000000014'$$,
  '23514',
  null,
  'homework with submissions cannot move to another class'
);
select throws_ok(
  $$update public.homework set class_id = 'f9000000-0000-0000-0000-000000000003' where id = 'f9000000-0000-0000-0000-000000000017'$$,
  '42501',
  null,
  'a teacher cannot move homework to a class they do not teach'
);

-- ── marking: strokes are staff-only ──────────────────────────────────────
select lives_ok(
  $$insert into public.homework_markup (submission_id, source_path, strokes) values ('f9000000-0000-0000-0000-000000000020', 'f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/1-a.pdf', '{"v": 1, "pages": {"1": []}}'::jsonb)$$,
  'the class teacher can save annotation strokes'
);
select throws_ok(
  $$insert into public.homework_markup (submission_id, source_path) values ('f9000000-0000-0000-0000-000000000020', 'f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000005/1-a.pdf')$$,
  '22023',
  null,
  'strokes cannot point at a file in another child''s folder'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.homework_markup), 0, 'a student cannot read the annotation strokes');
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.homework_markup), 0, 'a parent cannot read the annotation strokes');
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.homework_markup), 0, 'a teacher of another class cannot read the annotation strokes');

-- ── returning marked work ────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.homework_feedback (submission_id, status) values ('f9000000-0000-0000-0000-000000000021', 'feedback_given')$$,
  '23514',
  null,
  'returning with no mark, feedback, audio or marked file is refused'
);
select throws_ok(
  $$insert into public.homework_feedback (submission_id, status, marked_files) values ('f9000000-0000-0000-0000-000000000020', 'feedback_given', '[{"path": "f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000005/m.pdf", "name": "m.pdf", "mime": "application/pdf"}]'::jsonb)$$,
  '22023',
  null,
  'a marked file in another child''s folder is refused'
);
select lives_ok(
  $$insert into public.homework_feedback (submission_id, status, mark, marked_files) values ('f9000000-0000-0000-0000-000000000020', 'feedback_given', 7, '[{"path": "f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/m.pdf", "name": "a (marked).pdf", "mime": "application/pdf"}]'::jsonb)$$,
  'a teacher can return work with just a mark and a marked file'
);

set local "request.jwt.claims" to '{"sub": "e9000000-0000-0000-0000-000000000006"}';
select is(
  (select mark from public.homework_feedback where submission_id = 'f9000000-0000-0000-0000-000000000020'),
  7::numeric,
  'the student sees the returned mark'
);
select ok(
  public.homework_marked_returned('f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/m.pdf'),
  'a returned marked file counts as visible to the family'
);
select ok(
  not public.homework_marked_returned('f9000000-0000-0000-0000-000000000014/f9000000-0000-0000-0000-000000000004/draft.pdf'),
  'a marked file that was never returned stays hidden'
);

select * from finish();
rollback;
