-- Run via `supabase test db`. Covers the October 2026 portal rules:
--   0095 teacher-made revision packs (checked before pupils see them),
--   0096 one answer to "which classes does this teacher teach?",
--        assessment result status,
--   0097 progress report review, approval stamps and issued versions.
begin;
select plan(24);

-- People: head, a class-role teacher, a timetable-only teacher, a teacher
-- with only a DRAFT timetable slot, a teacher with nothing, a parent.
insert into auth.users (id, email) values
  ('a9600000-0000-0000-0000-000000000001', 'head-96@example.com'),
  ('a9600000-0000-0000-0000-000000000002', 'role-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000003', 'tt-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000004', 'draft-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000005', 'no-class-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000006', 'parent-96@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a9600000-0000-0000-0000-000000000001', 'admin', 'Head 96', 'head-96@example.com'),
  ('a9600000-0000-0000-0000-000000000002', 'teacher', 'Role Teacher 96', 'role-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000003', 'teacher', 'Timetable Teacher 96', 'tt-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000004', 'teacher', 'Draft Teacher 96', 'draft-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000005', 'teacher', 'No Class Teacher 96', 'no-class-teacher-96@example.com'),
  ('a9600000-0000-0000-0000-000000000006', 'parent', 'Parent 96', 'parent-96@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a9600000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('a9600000-0000-0000-0000-000000000005', 'teacher', 'none', null),
  ('a9600000-0000-0000-0000-000000000006', 'parent', 'none', null);

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('b9600000-0000-0000-0000-000000000001', 'TEST 2098/99 rules', '2098-09-01', '2099-07-01', true);
insert into public.year_groups (id, name) values ('b9600000-0000-0000-0000-000000000002', 'TEST Year 10 rules');
insert into public.subjects (id, name, is_core) values ('b9600000-0000-0000-0000-000000000003', 'TEST Islamic Studies rules', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('b9600000-0000-0000-0000-000000000004', 'TEST 10A rules', 'Year 10', 'b9600000-0000-0000-0000-000000000001', 'b9600000-0000-0000-0000-000000000002', 'b9600000-0000-0000-0000-000000000003');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a9600000-0000-0000-0000-000000000002', 'teacher', 'class', 'b9600000-0000-0000-0000-000000000004');
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('b9600000-0000-0000-0000-000000000005', 'a9600000-0000-0000-0000-000000000006', 'TEST Pupil rules', '2011-01-01', 'b9600000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values
  ('b9600000-0000-0000-0000-000000000004', 'b9600000-0000-0000-0000-000000000005');

-- A published timetable gives the class to the timetable-only teacher; a
-- draft one gives it to the draft teacher.
insert into public.timetable_runs (id, academic_year_id, status, label, generated_by) values
  ('b9600000-0000-0000-0000-000000000006', 'b9600000-0000-0000-0000-000000000001', 'published', 'TEST published rules', 'manual'),
  ('b9600000-0000-0000-0000-000000000007', 'b9600000-0000-0000-0000-000000000001', 'draft', 'TEST draft rules', 'manual');
insert into public.timetable_slots (run_id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time) values
  ('b9600000-0000-0000-0000-000000000006', 'b9600000-0000-0000-0000-000000000004', 'b9600000-0000-0000-0000-000000000003', 'a9600000-0000-0000-0000-000000000003', 1, '09:00', '09:50'),
  ('b9600000-0000-0000-0000-000000000007', 'b9600000-0000-0000-0000-000000000004', 'b9600000-0000-0000-0000-000000000003', 'a9600000-0000-0000-0000-000000000004', 2, '10:00', '10:50');

set local role authenticated;

-- ── 0096: one source for a teacher's classes ─────────────────────────────
set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.my_teaching_classes() where id = 'b9600000-0000-0000-0000-000000000004'), 1, 'a teacher given the class by the published timetable sees it in My classes');
select ok(public.class_taught_by_current_user('b9600000-0000-0000-0000-000000000004'), 'and the permission rule agrees');
select is((select count(*)::int from public.enrolments where class_id = 'b9600000-0000-0000-0000-000000000004'), 1, 'so they can read the class list to take a register');
select is((select count(*)::int from public.classes where id = 'b9600000-0000-0000-0000-000000000004'), 1, 'and open the class');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.my_teaching_classes()), 0, 'a slot in a DRAFT timetable gives no access');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.my_teaching_classes()), 0, 'a teacher with no class sees no classes');
select is((select count(*)::int from public.enrolments where class_id = 'b9600000-0000-0000-0000-000000000004'), 0, 'and cannot read another class''s pupils');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.my_teaching_classes()), 1, 'a class-role teacher still sees their class');

-- ── 0096: assessment results say why there is no score ───────────────────
reset role;
insert into public.assessment_types (id, name) values ('b9600000-0000-0000-0000-000000000008', 'TEST quiz rules') on conflict do nothing;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000003"}';
insert into public.assessments (class_id, child_id, assessment_type_id, title, date, status, entered_by) values
  ('b9600000-0000-0000-0000-000000000004', 'b9600000-0000-0000-0000-000000000005', 'b9600000-0000-0000-0000-000000000008', 'TEST unit test', '2098-10-01', 'absent', 'a9600000-0000-0000-0000-000000000003');
select is((select status from public.assessments where title = 'TEST unit test'), 'absent', 'a timetable teacher can record a pupil as absent for an assessment');
select throws_ok(
  $$insert into public.assessments (class_id, child_id, assessment_type_id, title, date, status) values ('b9600000-0000-0000-0000-000000000004', 'b9600000-0000-0000-0000-000000000005', 'b9600000-0000-0000-0000-000000000008', 'TEST bad', '2098-10-02', 'lost')$$,
  23514, null, 'an unknown result status is refused'
);

-- ── 0097: report review ──────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000002"}';
insert into public.term_reports (id, child_id, term_id, status, written_by) values
  ('b9600000-0000-0000-0000-000000000009', 'b9600000-0000-0000-0000-000000000005', null, 'draft', 'a9600000-0000-0000-0000-000000000002');
select throws_ok(
  $$update public.term_reports set status = 'pending_approval' where id = 'b9600000-0000-0000-0000-000000000009'$$,
  23514, null, 'a report with no comment cannot be submitted'
);
update public.term_reports set overall_comment = 'A thoughtful term.' where id = 'b9600000-0000-0000-0000-000000000009';
select throws_ok(
  $$update public.term_reports set status = 'pending_approval' where id = 'b9600000-0000-0000-0000-000000000009'$$,
  23514, null, 'a report without its generated summary cannot be submitted'
);
update public.term_reports set narrative = '{"attendance": {}}'::jsonb, status = 'pending_approval' where id = 'b9600000-0000-0000-0000-000000000009';
select is((select submitted_by from public.term_reports where id = 'b9600000-0000-0000-0000-000000000009'), 'a9600000-0000-0000-0000-000000000002'::uuid, 'submitting records who submitted it');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000001"}';
update public.term_reports set status = 'released', approved_by = 'a9600000-0000-0000-0000-000000000006' where id = 'b9600000-0000-0000-0000-000000000009';
select is((select approved_by from public.term_reports where id = 'b9600000-0000-0000-0000-000000000009'), 'a9600000-0000-0000-0000-000000000001'::uuid, 'the approver is the signed-in head, whatever the client sends');
select is((select count(*)::int from public.term_report_versions where report_id = 'b9600000-0000-0000-0000-000000000009'), 1, 'issuing saves version 1');
select throws_ok(
  $$update public.term_reports set overall_comment = 'Changed after issue' where id = 'b9600000-0000-0000-0000-000000000009'$$,
  23514, null, 'an issued report cannot be edited in place'
);

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.term_report_versions), 1, 'the parent can read the issued copy');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000001"}';
update public.term_reports set status = 'draft', returned_reason = 'Reopened for a correction.' where id = 'b9600000-0000-0000-0000-000000000009';
select is((select returned_by from public.term_reports where id = 'b9600000-0000-0000-0000-000000000009'), 'a9600000-0000-0000-0000-000000000001'::uuid, 'reopening records who reopened it');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.term_report_versions), 1, 'after reopening, the family still has the issued copy');
select is((select count(*)::int from public.term_reports), 0, 'but not the draft being corrected');

set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.term_report_versions), 0, 'a teacher who doesn''t teach the pupil cannot read their reports');

-- ── 0095: teacher-made revision packs ────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "a9600000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.revision_units (subject_slug, subject, year, unit, title, kind, published, source) values ('test-rules', 'TEST', 'y10', 'TEST unit A', 'TEST', 'summary', true, 'staff')$$,
  23514, null, 'a teacher-made pack cannot be shown to pupils before it is checked'
);
insert into public.revision_units (subject_slug, subject, year, unit, title, kind, published, source) values ('test-rules', 'TEST', 'y10', 'TEST unit B', 'TEST', 'summary', false, 'staff');
select is((select count(*)::int from public.revision_units where unit = 'TEST unit B'), 1, 'a teacher can make a hidden pack');
select throws_ok(
  $$insert into public.revision_units (subject_slug, subject, year, unit, title, kind, published, source) values ('test-rules', 'TEST', 'y10', 'TEST unit C', 'TEST', 'summary', false, 'content')$$,
  42501, null, 'a teacher cannot create a pack that claims to come from the repository'
);

select * from finish();
rollback;
