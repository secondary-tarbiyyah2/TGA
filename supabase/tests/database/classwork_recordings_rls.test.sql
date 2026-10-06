-- Run via `supabase test db`. Covers 0079 (class stream, comments, settings,
-- scheduled posts, the read-only review queue) and 0080 (lesson recording
-- links with the mandatory safeguarding acknowledgement, the non-raising
-- lesson-join logger).
begin;
select plan(18);

insert into auth.users (id, email) values
  ('e8000000-0000-0000-0000-000000000001', 'ht-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000002', 'teacher-a-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000003', 'teacher-b-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000004', 'parent-p-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000005', 'parent-q-cw@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e8000000-0000-0000-0000-000000000001', 'admin', 'HT CW', 'ht-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A CW', 'teacher-a-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B CW', 'teacher-b-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000004', 'parent', 'Parent P CW', 'parent-p-cw@example.com'),
  ('e8000000-0000-0000-0000-000000000005', 'parent', 'Parent Q CW', 'parent-q-cw@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f8000000-0000-0000-0000-000000000001', 'TEST 2099/00 cw', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f8000000-0000-0000-0000-000000000002', 'TEST Year 5 cw');
insert into public.subjects (id, name, is_core) values ('f8000000-0000-0000-0000-000000000003', 'TEST Maths cw', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f8000000-0000-0000-0000-000000000004', 'TEST Class A cw', 'TEST Year 5 cw', 'f8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003'),
  ('f8000000-0000-0000-0000-000000000005', 'TEST Class B cw', 'TEST Year 5 cw', 'f8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f8000000-0000-0000-0000-000000000004'),
  ('e8000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f8000000-0000-0000-0000-000000000005');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f8000000-0000-0000-0000-000000000011', 'e8000000-0000-0000-0000-000000000004', 'Amina CW', '2015-01-01', 'f8000000-0000-0000-0000-000000000002', true),
  ('f8000000-0000-0000-0000-000000000012', 'e8000000-0000-0000-0000-000000000005', 'Other CW', '2015-01-01', 'f8000000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values
  ('f8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000011'),
  ('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000012');

insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('f8000000-0000-0000-0000-000000000021', 'f8000000-0000-0000-0000-000000000001', 'published', 'TEST published run cw', 'manual');
insert into public.timetable_slots (id, run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('f8000000-0000-0000-0000-000000000022', 'f8000000-0000-0000-0000-000000000021', 'f8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000003', 'e8000000-0000-0000-0000-000000000002', 1, '09:00', '10:00');
insert into public.lesson_instances (id, timetable_slot_id, date) values
  ('f8000000-0000-0000-0000-000000000031', 'f8000000-0000-0000-0000-000000000022', current_date);

-- Class A posts (seeded as the service role): one comment-enabled notice, one scheduled for later.
insert into public.announcements (id, scope, class_id, title, body, author_id, allow_comments, publish_at) values
  ('f8000000-0000-0000-0000-000000000041', 'class', 'f8000000-0000-0000-0000-000000000004', 'TEST open notice', 'Hello', 'e8000000-0000-0000-0000-000000000002', true, null),
  ('f8000000-0000-0000-0000-000000000042', 'class', 'f8000000-0000-0000-0000-000000000004', 'TEST scheduled notice', 'Later', 'e8000000-0000-0000-0000-000000000002', false, now() + interval '2 days');

-- One handed-in, un-returned submission in class A for the review queue.
insert into public.homework (id, class_id, teacher_id, title, due_at) values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000002', 'TEST hw cw', now() - interval '2 days');
insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at) values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-000000000011', 'text', 'done', now() - interval '1 day');

set local role authenticated;

-- Recording links -------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.lesson_recording_links (lesson_instance_id, url, consent_acknowledged, consent_text, acknowledged_by) values ('f8000000-0000-0000-0000-000000000031', 'https://example.sharepoint.com/rec/1', true, 'I confirm this recording shows only me and my screen.', 'e8000000-0000-0000-0000-000000000002')$$,
  'the class teacher can add a recording link with the acknowledgement'
);
select throws_ok(
  $$insert into public.lesson_recording_links (lesson_instance_id, url, consent_acknowledged, consent_text, acknowledged_by) values ('f8000000-0000-0000-0000-000000000031', 'https://example.sharepoint.com/rec/2', false, 'I confirm this recording shows only me and my screen.', 'e8000000-0000-0000-0000-000000000002')$$,
  '23514', null, 'a link cannot be saved without ticking the acknowledgement'
);
select throws_ok(
  $$insert into public.lesson_recording_links (lesson_instance_id, url, consent_acknowledged, consent_text, acknowledged_by) values ('f8000000-0000-0000-0000-000000000031', 'javascript:alert(1)', true, 'I confirm this recording shows only me and my screen.', 'e8000000-0000-0000-0000-000000000002')$$,
  '23514', null, 'only https links are accepted'
);
select is((select acknowledged_by from public.lesson_recording_links limit 1), 'e8000000-0000-0000-0000-000000000002'::uuid, 'the acknowledging staff member is recorded');

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.lesson_recording_links (lesson_instance_id, url, consent_acknowledged, consent_text, acknowledged_by) values ('f8000000-0000-0000-0000-000000000031', 'https://example.com/other', true, 'I confirm this recording shows only me and my screen.', 'e8000000-0000-0000-0000-000000000003')$$,
  '42501', null, 'another class''s teacher cannot add a recording link'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.lesson_recording_links), 1, 'a parent of an enrolled child sees the recording link');
select throws_ok(
  $$insert into public.lesson_recording_links (lesson_instance_id, url, consent_acknowledged, consent_text, acknowledged_by) values ('f8000000-0000-0000-0000-000000000031', 'https://example.com/parent', true, 'I confirm this recording shows only me and my screen.', 'e8000000-0000-0000-0000-000000000004')$$,
  '42501', null, 'a parent cannot add a recording link'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.lesson_recording_links), 0, 'another family does not see the link');

-- Join logger never raises ------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000004"}';
select is(public.log_lesson_join('f8000000-0000-0000-0000-000000000031', 'f8000000-0000-0000-0000-000000000011'), true, 'a parent logs a join for their enrolled child');
select is(public.log_lesson_join('f8000000-0000-0000-0000-000000000031', 'f8000000-0000-0000-0000-000000000012'), false, 'a join for someone else''s child is refused quietly, not with an error');
select is((select count(*)::int from public.lesson_joins), 1, 'only the allowed join was logged');

-- Stream: audience, scheduling, comments -----------------------------------------
select is((select count(*)::int from public.announcements where class_id = 'f8000000-0000-0000-0000-000000000004'), 1, 'a scheduled notice is hidden from families until its time');
select throws_ok(
  $$insert into public.class_post_comments (class_id, announcement_id, author_id, body) values ('f8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000041', 'e8000000-0000-0000-0000-000000000004', 'Hi')$$,
  '42501', null, 'a parent cannot comment on the stream'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.class_post_comments (class_id, announcement_id, author_id, body) values ('f8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000041', 'e8000000-0000-0000-0000-000000000002', 'Welcome')$$,
  'the teacher can comment on a post that allows comments'
);
select is((select count(*)::int from public.homework_review_queue), 1, 'the teacher''s review queue lists the handed-in, un-returned work');

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.homework_review_queue), 0, 'another class''s teacher sees nothing in the queue');

-- Settings default to the safe side --------------------------------------------------
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000002"}';
insert into public.class_settings (class_id) values ('f8000000-0000-0000-0000-000000000004');
select is((select students_can_comment from public.class_settings where class_id = 'f8000000-0000-0000-0000-000000000004'), false, 'pupils cannot comment until a teacher turns it on');

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000001"}';
delete from public.lesson_recording_links;
select is((select count(*)::int from public.lesson_recording_links), 0, 'head/admin can remove a recording link');

select * from finish();
rollback;
