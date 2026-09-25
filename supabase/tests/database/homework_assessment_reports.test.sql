-- Run via `supabase test db`. Covers 0010_homework.sql,
-- 0011_assessment.sql and 0012_reports.sql RLS: homework/submission/mark
-- visibility and release-gating, assessments moderation_notes hiding from
-- family, quran_progress assessment_lead gating, and term_reports approval
-- state-machine gating.
begin;
select plan(26);

insert into auth.users (id, email) values
  ('e2000000-0000-0000-0000-000000000001', 'ht2@example.com'),
  ('e2000000-0000-0000-0000-000000000002', 'teacher-c@example.com'),
  ('e2000000-0000-0000-0000-000000000003', 'parent-z@example.com'),
  ('e2000000-0000-0000-0000-000000000004', 'student-z@example.com'),
  ('e2000000-0000-0000-0000-000000000005', 'assessment-lead@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e2000000-0000-0000-0000-000000000001', 'admin', 'HT Two', 'ht2@example.com'),
  ('e2000000-0000-0000-0000-000000000002', 'teacher', 'Teacher C', 'teacher-c@example.com'),
  ('e2000000-0000-0000-0000-000000000003', 'parent', 'Parent Z', 'parent-z@example.com'),
  ('e2000000-0000-0000-0000-000000000004', 'student', 'Student Z', 'student-z@example.com'),
  ('e2000000-0000-0000-0000-000000000005', 'teacher', 'Assessment Lead', 'assessment-lead@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e2000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e2000000-0000-0000-0000-000000000005', 'assessment_lead');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f2000000-0000-0000-0000-000000000001', 'TEST 2099/00 hw', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f2000000-0000-0000-0000-000000000002', 'TEST Year 6 hw');
insert into public.subjects (id, name, is_core) values ('f2000000-0000-0000-0000-000000000003', 'TEST English hw', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f2000000-0000-0000-0000-000000000004', 'TEST Class HW', 'TEST Year 6 hw', 'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e2000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f2000000-0000-0000-0000-000000000004');

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f2000000-0000-0000-0000-000000000005', 'e2000000-0000-0000-0000-000000000003', 'TEST Child Z hw', '2014-01-01', 'f2000000-0000-0000-0000-000000000002', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f2000000-0000-0000-0000-000000000005', 'e2000000-0000-0000-0000-000000000004');
insert into public.enrolments (class_id, child_id) values
  ('f2000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000005');

insert into public.homework (id, class_id, teacher_id, title, due_at) values
  ('f2000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000002', 'TEST homework', now() + interval '1 day');

set local role authenticated;

-- ── homework visibility ────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.homework), 1, 'parent sees own child''s class homework');

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.homework), 1, 'student sees own class homework');

-- ── homework_submissions: student can create own, cannot forge another
-- child's ──────────────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000004"}';
insert into public.homework_submissions (id, homework_id, child_id, kind, response_text, submitted_at) values
  ('f2000000-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000005', 'text', 'my answer', now());
select is((select count(*)::int from public.homework_submissions where id = 'f2000000-0000-0000-0000-000000000007'), 1, 'student can submit own homework');

reset role;
insert into public.children (id, parent_user_id, name, dob, is_test) values
  ('f2000000-0000-0000-0000-000000000008', 'e2000000-0000-0000-0000-000000000001', 'TEST Child Other hw', '2014-01-01', true);
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000004"}';
select throws_ok(
  $$insert into public.homework_submissions (homework_id, child_id, kind, response_text, submitted_at) values ('f2000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000008', 'text', 'forged', now())$$,
  42501,
  null,
  'student cannot submit on behalf of a child that is not their own'
);

-- ── homework_marks: grade/feedback hidden from family until released ────
reset role;
insert into public.homework_marks (id, submission_id, grade, feedback, released, marked_by, marked_at) values
  ('f2000000-0000-0000-0000-000000000009', 'f2000000-0000-0000-0000-000000000007', 'B+', 'Good effort', false, 'e2000000-0000-0000-0000-000000000002', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.homework_marks where submission_id = 'f2000000-0000-0000-0000-000000000007'), 0, 'parent cannot see an unreleased mark');

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.homework_marks where submission_id = 'f2000000-0000-0000-0000-000000000007'), 0, 'student cannot see an unreleased mark');

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.homework_marks where submission_id = 'f2000000-0000-0000-0000-000000000007'), 1, 'the marking teacher can see their own unreleased mark');

reset role;
update public.homework_marks set released = true, released_by = 'e2000000-0000-0000-0000-000000000002', released_at = now() where id = 'f2000000-0000-0000-0000-000000000009';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.homework_marks where submission_id = 'f2000000-0000-0000-0000-000000000007'), 1, 'parent CAN see the mark once released');
select is((select grade from public.homework_marks where submission_id = 'f2000000-0000-0000-0000-000000000007'), 'B+', 'released grade is visible to the parent');

-- ── assessments: moderation_notes never reaches family ───────────────────
reset role;
insert into public.assessment_types (id, name) values ('f200000a-0000-0000-0000-000000000001', 'TEST Class test hw') on conflict do nothing;
insert into public.assessments (id, class_id, child_id, assessment_type_id, title, date, raw_score, max_score, moderation_notes, entered_by) values
  ('f200000a-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000005', 'f200000a-0000-0000-0000-000000000001', 'TEST test', '2099-10-01', 45, 50, 'Borderline — moderated up from 42', 'e2000000-0000-0000-0000-000000000002');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.assessments), 0, 'parent has NO direct read access to the base assessments table');
select is((select count(*)::int from public.assessments_for_family), 1, 'parent sees their child''s assessment via the family view');
select ok(
  not exists (select 1 from information_schema.columns where table_name = 'assessments_for_family' and column_name = 'moderation_notes'),
  'assessments_for_family view has no moderation_notes column at all'
);

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000002"}';
select is((select moderation_notes from public.assessments where id = 'f200000a-0000-0000-0000-000000000002'), 'Borderline — moderated up from 42', 'the class teacher CAN read moderation_notes directly');

-- ── quran_progress: assessment_lead gating ────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.quran_progress (child_id, class_id, milestone_type, surah_from, surah_to, standard, recorded_by) values ('f2000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000004', 'quran_memorisation', 78, 78, 'secure', 'e2000000-0000-0000-0000-000000000002')$$,
  42501,
  null,
  'an ordinary class teacher (without assessment_lead) cannot write quran_progress'
);

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000005"}';
insert into public.quran_progress (id, child_id, class_id, milestone_type, surah_from, surah_to, standard, recorded_by) values
  ('f200000a-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000004', 'quran_memorisation', 78, 78, 'secure', 'e2000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.quran_progress where id = 'f200000a-0000-0000-0000-000000000003'), 1, 'assessment_lead CAN write quran_progress');

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.quran_progress), 1, 'parent can read their child''s quran_progress');

-- ── term_reports: draft->approve gated to head_teacher/admin ─────────────
reset role;
insert into public.terms (id, academic_year_id, name, starts_on, ends_on) values
  ('f200000a-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000001', 'TEST Autumn hw', '2099-09-01', '2099-12-20');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000002"}';
insert into public.term_reports (id, child_id, term_id, status, overall_comment, written_by) values
  ('f200000a-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000005', 'f200000a-0000-0000-0000-000000000004', 'draft', 'Doing well', 'e2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.term_reports where id = 'f200000a-0000-0000-0000-000000000005'), 1, 'teacher can draft a term report for their own class''s child');

select throws_ok(
  $$update public.term_reports set status = 'approved' where id = 'f200000a-0000-0000-0000-000000000005'$$,
  42501,
  null,
  'a teacher cannot self-approve a term report'
);

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.term_reports where child_id = 'f2000000-0000-0000-0000-000000000005'), 0, 'parent cannot see a draft (unreleased) term report');

reset role;
update public.term_reports set status = 'approved', approved_by = 'e2000000-0000-0000-0000-000000000001', approved_at = now() where id = 'f200000a-0000-0000-0000-000000000005';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.term_reports where child_id = 'f2000000-0000-0000-0000-000000000005'), 0, 'parent still cannot see an approved-but-not-released term report');

reset role;
update public.term_reports set status = 'released', released_at = now() where id = 'f200000a-0000-0000-0000-000000000005';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.term_reports where child_id = 'f2000000-0000-0000-0000-000000000005'), 1, 'parent CAN see the term report once released');

set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.term_reports where child_id = 'f2000000-0000-0000-0000-000000000005'), 1, 'student CAN see their own released term report');

-- ── homework_status view: computed late/missing, matches expectation ────
reset role;
insert into public.homework (id, class_id, teacher_id, title, due_at) values
  ('f200000a-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000002', 'TEST overdue homework', now() - interval '2 days');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e2000000-0000-0000-0000-000000000002"}';
select is(
  (select status from public.homework_status where homework_id = 'f200000a-0000-0000-0000-000000000006' and child_id = 'f2000000-0000-0000-0000-000000000005'),
  'missing',
  'homework_status correctly computes "missing" for an unsubmitted, past-due homework'
);
select is(
  (select status from public.homework_status where homework_id = 'f2000000-0000-0000-0000-000000000006' and child_id = 'f2000000-0000-0000-0000-000000000005'),
  'on_time',
  'homework_status correctly computes "on_time" for the earlier, submitted-before-due homework'
);

-- ── mark scheme / grade boundary lookup ──────────────────────────────────
reset role;
insert into public.mark_schemes (id, subject_id, scale_name) values ('f200000a-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000003', 'TEST A*-U hw');
insert into public.grade_boundaries (mark_scheme_id, label, min_percent) values
  ('f200000a-0000-0000-0000-000000000007', 'C', 40),
  ('f200000a-0000-0000-0000-000000000007', 'B', 60),
  ('f200000a-0000-0000-0000-000000000007', 'A', 80);
select is(public.grade_for_percent('f200000a-0000-0000-0000-000000000007', 65), 'B', 'grade_for_percent resolves the correct band, not a hardcoded value');
select is(public.grade_for_percent('f200000a-0000-0000-0000-000000000007', 39), null, 'grade_for_percent returns null below the lowest boundary');

select * from finish();
rollback;
