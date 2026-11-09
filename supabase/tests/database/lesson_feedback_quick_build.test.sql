-- Run via `supabase test db`. Covers Tafweed T34 and T35 (migration 0190):
--  * lesson feedback: staff create their own and read only their own; the Headteacher reads
--    all and answers; a decline needs a reason; a note cannot be rewritten; every change is
--    logged; parents and pupils see nothing;
--  * lesson editing by subject: a teacher with a recorded subject edits only that subject's
--    lessons, a teacher with none edits all, the Headteacher edits all;
--  * the quick build request follows the same rule.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('e3400000-0000-0000-0000-000000000001', 'head-t34@example.com'),
  ('e3400000-0000-0000-0000-000000000002', 'maths-t34@example.com'),
  ('e3400000-0000-0000-0000-000000000003', 'free-t34@example.com'),
  ('e3400000-0000-0000-0000-000000000004', 'parent-t34@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e3400000-0000-0000-0000-000000000001', 'admin', 'Head T34', 'head-t34@example.com'),
  ('e3400000-0000-0000-0000-000000000002', 'teacher', 'Maths T34', 'maths-t34@example.com'),
  ('e3400000-0000-0000-0000-000000000003', 'teacher', 'Free T34', 'free-t34@example.com'),
  ('e3400000-0000-0000-0000-000000000004', 'parent', 'Parent T34', 'parent-t34@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e3400000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e3400000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('e3400000-0000-0000-0000-000000000003', 'teacher', 'none', null),
  ('e3400000-0000-0000-0000-000000000004', 'parent', 'none', null);

-- The maths teacher has "Maths" on their staff profile; the other teacher has no subject.
insert into public.staff_profiles (user_id, subjects_taught) values ('e3400000-0000-0000-0000-000000000002', '{Maths}');

insert into public.curriculum_lessons (id, subject_slug, subject, year, unit, lesson_no, title, objectives) values
  ('f3400000-0000-0000-0000-000000000001', 'mathematics-t34', 'Mathematics', 'y7', 'Number', 1, 'Place value', '["o"]'),
  ('f3400000-0000-0000-0000-000000000002', 'history-t34', 'History', 'y7', 'Normans', 1, 'Hastings', '["o"]');

set local role authenticated;

-- ── a teacher sends feedback ─────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e3400000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.curriculum_lesson_feedback (id, lesson_id, part, part_label, body) values ('f3400000-0000-0000-0000-000000000011', 'f3400000-0000-0000-0000-000000000001', 'teach:2', 'Slide 3', 'This slide needs a picture')$$,
  'a teacher can leave feedback on a slide'
);
select is((select author_name from public.curriculum_lesson_feedback where id = 'f3400000-0000-0000-0000-000000000011'), 'Maths T34', 'the note is stamped with its author');
select throws_ok(
  $$insert into public.curriculum_lesson_feedback (lesson_id, body, status) values ('f3400000-0000-0000-0000-000000000001', 'x', 'done')$$,
  '42501', null, 'a teacher cannot send a note already marked done'
);
select throws_ok(
  $$insert into public.curriculum_lesson_feedback (lesson_id, part, body) values ('f3400000-0000-0000-0000-000000000001', 'somewhere', 'x')$$,
  '23514', null, 'only known parts of a lesson are accepted'
);
update public.curriculum_lesson_feedback set status = 'done' where id = 'f3400000-0000-0000-0000-000000000011';
select is((select status from public.curriculum_lesson_feedback where id = 'f3400000-0000-0000-0000-000000000011'), 'open', 'a teacher cannot answer feedback');

set local "request.jwt.claims" to '{"sub": "e3400000-0000-0000-0000-000000000003"}';
select lives_ok(
  $$insert into public.curriculum_lesson_feedback (id, lesson_id, body) values ('f3400000-0000-0000-0000-000000000012', 'f3400000-0000-0000-0000-000000000002', 'Answer 3 is wrong')$$,
  'another teacher can leave feedback on a whole lesson'
);
select is((select count(*)::int from public.curriculum_lesson_feedback), 1, 'a teacher reads only their own feedback');

-- ── parents see nothing and cannot send feedback ─────────────────────────
set local "request.jwt.claims" to '{"sub": "e3400000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.curriculum_lesson_feedback) + (select count(*)::int from public.curriculum_lesson_feedback_events), 0, 'a parent sees no feedback and no log');
select throws_ok(
  $$insert into public.curriculum_lesson_feedback (lesson_id, body) values ('f3400000-0000-0000-0000-000000000001', 'x')$$,
  '42501', null, 'a parent cannot send lesson feedback'
);

-- ── the Headteacher answers ──────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e3400000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.curriculum_lesson_feedback), 2, 'the Headteacher reads every note');
select throws_ok(
  $$update public.curriculum_lesson_feedback set status = 'declined' where id = 'f3400000-0000-0000-0000-000000000012'$$,
  '23514', null, 'declining needs a reason'
);
select lives_ok(
  $$update public.curriculum_lesson_feedback set status = 'declined', response = 'Answer 3 is correct: check the units' where id = 'f3400000-0000-0000-0000-000000000012'$$,
  'the Headteacher can decline with a reason'
);
select lives_ok($$update public.curriculum_lesson_feedback set status = 'done', response = 'Picture added' where id = 'f3400000-0000-0000-0000-000000000011'$$, 'the Headteacher can mark a note done');
select is((select handled_by_name from public.curriculum_lesson_feedback where id = 'f3400000-0000-0000-0000-000000000011'), 'Head T34', 'the answer is stamped with who gave it');
select throws_ok($$update public.curriculum_lesson_feedback set body = 'changed' where id = 'f3400000-0000-0000-0000-000000000011'$$, '42501', null, 'the note itself cannot be rewritten');
select is((select count(*)::int from public.curriculum_lesson_feedback_events where feedback_id = 'f3400000-0000-0000-0000-000000000011'), 2, 'sending and answering are both logged');

-- ── editing lessons by subject ───────────────────────────────────────────
select is(public.curriculum_can_edit_lesson('f3400000-0000-0000-0000-000000000002'), true, 'the Headteacher can edit any lesson');
set local "request.jwt.claims" to '{"sub": "e3400000-0000-0000-0000-000000000002"}';
select is(public.curriculum_can_edit_lesson('f3400000-0000-0000-0000-000000000001') and not public.curriculum_can_edit_lesson('f3400000-0000-0000-0000-000000000002'), true, 'a maths teacher can edit maths lessons only');
select throws_ok(
  $$select public.curriculum_save_lesson_content('f3400000-0000-0000-0000-000000000002', '{"unit":"U","title":"T","objectives":["o"],"teach":[{},{},{}]}', null, false, null)$$,
  '42501', null, 'a maths teacher cannot save a history lesson'
);
set local "request.jwt.claims" to '{"sub": "e3400000-0000-0000-0000-000000000003"}';
select lives_ok($$select public.curriculum_request_lesson_build('f3400000-0000-0000-0000-000000000002')$$, 'a teacher with no subject recorded can edit and rebuild any lesson');

select * from finish();
rollback;
