-- Run via `supabase test db`. Covers 0192: the lesson review workflow
-- (draft -> submitted -> in_review -> changes_needed | approved -> published),
-- who may take each step, the event history, and that editing an approved
-- lesson reopens its review.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('a1920000-0000-0000-0000-000000000001', 'teacher-192@example.com'),
  ('a1920000-0000-0000-0000-000000000002', 'head-192@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a1920000-0000-0000-0000-000000000001', 'teacher', 'Teacher 192', 'teacher-192@example.com'),
  ('a1920000-0000-0000-0000-000000000002', 'head_teacher', 'Head 192', 'head-192@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1920000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a1920000-0000-0000-0000-000000000002', 'head_teacher', 'none', null);

insert into public.curriculum_lessons (id, subject_slug, subject, year, unit, lesson_no, title, version)
values ('a1920000-0000-0000-0000-0000000000a1', 'test-subject-192', 'Test subject', 'y7', 'Spring 1: Test', 901, 'Test lesson', 1);

set local role authenticated;

-- Teacher
set local "request.jwt.claims" to '{"sub": "a1920000-0000-0000-0000-000000000001"}';
select is(public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'submitted', 'Ready'), 'submitted', 'a teacher can submit a lesson for review');
select is((select submitted_name from public.curriculum_signoffs where ref = 'y7/901'), 'Teacher 192', 'the submitter is recorded');
select throws_ok($$select public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'approved', null)$$, '42501', null, 'a teacher cannot approve');

-- Head teacher (reviewer)
set local "request.jwt.claims" to '{"sub": "a1920000-0000-0000-0000-000000000002"}';
select is(public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'in_review', null), 'in_review', 'a reviewer can start a review');
select throws_ok($$select public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'changes_needed', '  ')$$, '22023', null, 'requesting changes needs a comment');
select is(public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'approved', 'Good'), 'approved', 'a reviewer can approve');
select is((select approved_version from public.curriculum_signoffs where ref = 'y7/901'), 1, 'the approved version is recorded');
select throws_ok($$select public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'approved', null)$$, '42501', null, 'an approved lesson cannot be approved again');
select is(public.curriculum_review_transition('test-subject-192', 'lesson', 'y7/901', 'published', null), 'published', 'an approved lesson can be published');

-- Editing the published lesson reopens the review.
reset role;
update public.curriculum_lessons set version = 2, deck_path = 'rebuilt.pptx' where id = 'a1920000-0000-0000-0000-0000000000a1';
select is((select status from public.curriculum_signoffs where ref = 'y7/901'), 'published', 'a rebuild of unchanged content keeps the approval');
update public.curriculum_lessons set title = 'Test lesson (edited)' where id = 'a1920000-0000-0000-0000-0000000000a1';
select is((select status from public.curriculum_signoffs where ref = 'y7/901'), 'submitted', 'editing a published lesson reopens its review');
select is((select changed_since_approval from public.curriculum_signoffs where ref = 'y7/901'), true, 'it is marked as changed since approval');
select is((select count(*)::int from public.curriculum_review_events where ref = 'y7/901'), 5, 'every step is in the history');

-- Staff can read the history; nobody can write it directly.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1920000-0000-0000-0000-000000000001"}';
select throws_ok($$insert into public.curriculum_review_events (subject_slug, scope, ref, to_status) values ('x', 'lesson', 'y7/1', 'approved')$$, '42501', null, 'history cannot be written directly');

select * from finish();
rollback;
