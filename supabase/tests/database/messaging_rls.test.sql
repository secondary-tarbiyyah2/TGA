-- Run via `supabase test db`. Covers 0013_messaging.sql RLS.
--
-- The headline assertion this file exists to prove empirically (not just
-- assume from reading the schema): a student account can NOT establish a
-- direct 1:1 message thread with a teacher, in either message_threads
-- "shape" (parent_teacher or staff) — both attempts are rejected, one by
-- the CHECK constraint itself, one by RLS.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('e3000000-0000-0000-0000-000000000001', 'ht3@example.com'),
  ('e3000000-0000-0000-0000-000000000002', 'teacher-d@example.com'),
  ('e3000000-0000-0000-0000-000000000003', 'teacher-e@example.com'),
  ('e3000000-0000-0000-0000-000000000004', 'parent-w@example.com'),
  ('e3000000-0000-0000-0000-000000000005', 'parent-v@example.com'),
  ('e3000000-0000-0000-0000-000000000006', 'student-w@example.com'),
  ('e3000000-0000-0000-0000-000000000007', 'safeguarding3@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e3000000-0000-0000-0000-000000000001', 'admin', 'HT Three', 'ht3@example.com'),
  ('e3000000-0000-0000-0000-000000000002', 'teacher', 'Teacher D', 'teacher-d@example.com'),
  ('e3000000-0000-0000-0000-000000000003', 'teacher', 'Teacher E', 'teacher-e@example.com'),
  ('e3000000-0000-0000-0000-000000000004', 'parent', 'Parent W', 'parent-w@example.com'),
  ('e3000000-0000-0000-0000-000000000005', 'parent', 'Parent V', 'parent-v@example.com'),
  ('e3000000-0000-0000-0000-000000000006', 'student', 'Student W', 'student-w@example.com'),
  ('e3000000-0000-0000-0000-000000000007', 'teacher', 'Safeguarding Lead 3', 'safeguarding3@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e3000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e3000000-0000-0000-0000-000000000007', 'safeguarding_lead');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f3000000-0000-0000-0000-000000000001', 'TEST 2099/00 msg', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f3000000-0000-0000-0000-000000000002', 'TEST Year 4 msg');
insert into public.subjects (id, name, is_core) values ('f3000000-0000-0000-0000-000000000003', 'TEST Science msg', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f3000000-0000-0000-0000-000000000004', 'TEST Class MSG', 'TEST Year 4 msg', 'f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e3000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f3000000-0000-0000-0000-000000000004'),
  ('e3000000-0000-0000-0000-000000000003', 'teacher', 'none', null);

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000004', 'TEST Child W msg', '2016-01-01', 'f3000000-0000-0000-0000-000000000002', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000006');
insert into public.enrolments (class_id, child_id) values
  ('f3000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000005');

set local role authenticated;

-- ── the headline guarantee: no teacher<->student direct messaging ───────
-- Attempt 1: student tries to pose as the thread's "parent" via the
-- parent_teacher shape (spoofing parent_id to themselves). Rejected by RLS
-- (they don't own the child, and even if they did, their own account is
-- the student's, not the parent's — child_belongs_to_parent(child_id)
-- fails for a student's auth.uid()).
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000006"}';
select throws_ok(
  $$insert into public.message_threads (kind, child_id, parent_id, teacher_id) values ('parent_teacher', 'f3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000002')$$,
  42501,
  null,
  'student cannot open a parent_teacher thread posing as the parent'
);

-- Attempt 2: student tries the staff shape (posing as one of the two
-- "staff" participants, with a teacher as the other). Rejected: even
-- though staff_a_id/staff_b_id = auth.uid() would pass the participant
-- check, is_staff_member() fails for a student account.
select throws_ok(
  $$insert into public.message_threads (kind, staff_a_id, staff_b_id) values ('staff', 'e3000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000002')$$,
  42501,
  null,
  'student cannot open a staff-shaped thread with a teacher either'
);

-- Attempt 3: a teacher tries to open a "staff" thread naming a student as
-- the other party. Rejected by is_staff_member() on the student side.
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.message_threads (kind, staff_a_id, staff_b_id) values ('staff', 'e3000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000006')$$,
  42501,
  null,
  'a teacher cannot open a staff-shaped thread naming a student as the other party'
);

-- Attempt 4: even at the schema level, a thread naming a student column
-- directly is simply not representable — there is no student_id column on
-- message_threads at all (structural, not just policy-enforced).
select hasnt_column('public', 'message_threads', 'student_id', 'message_threads has no student_id column — a student-involved thread cannot even be represented');

-- ── legitimate parent<->teacher thread works ─────────────────────────────
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000004"}';
insert into public.message_threads (id, kind, child_id, parent_id, teacher_id) values
  ('f3000000-0000-0000-0000-000000000006', 'parent_teacher', 'f3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.message_threads where id = 'f3000000-0000-0000-0000-000000000006'), 1, 'parent CAN open a thread with their own child''s teacher');

-- Parent cannot open a thread with a teacher who does NOT teach their child.
select throws_ok(
  $$insert into public.message_threads (kind, child_id, parent_id, teacher_id) values ('parent_teacher', 'f3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-000000000003')$$,
  42501,
  null,
  'parent cannot open a thread with a teacher who does not teach their child'
);

-- ── messages: only participants can send/read ────────────────────────────
insert into public.message_thread_messages (id, thread_id, sender_id, body) values
  ('f3000000-0000-0000-0000-000000000007', 'f3000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000004', 'Hello, how is my child doing?');
select is((select count(*)::int from public.message_thread_messages where id = 'f3000000-0000-0000-0000-000000000007'), 1, 'parent can send a message in their own thread');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = 'f3000000-0000-0000-0000-000000000006'), 0, 'an unrelated parent cannot read this thread''s messages');
select throws_ok(
  $$insert into public.message_thread_messages (thread_id, sender_id, body) values ('f3000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000005', 'butting in')$$,
  42501,
  null,
  'an unrelated parent cannot send into this thread either'
);

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = 'f3000000-0000-0000-0000-000000000006'), 0, 'the enrolled student (not a thread participant) cannot read the parent-teacher thread');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = 'f3000000-0000-0000-0000-000000000006'), 1, 'the teacher participant CAN read the thread');

-- ── keyword flagging + safeguarding lead visibility ──────────────────────
insert into public.message_thread_messages (id, thread_id, sender_id, body) values
  ('f3000000-0000-0000-0000-000000000008', 'f3000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000002', 'She mentioned she is scared to go home today.');
select is((select flagged from public.message_thread_messages where id = 'f3000000-0000-0000-0000-000000000008'), true, 'a message matching a safeguarding keyword is auto-flagged');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000007"}';
select is((select count(*)::int from public.message_thread_messages where id = 'f3000000-0000-0000-0000-000000000008'), 1, 'the Safeguarding Lead can read the flagged message despite not being a thread participant');
select is((select count(*)::int from public.message_thread_messages where id = 'f3000000-0000-0000-0000-000000000007'), 0, 'the Safeguarding Lead does NOT get blanket access to the thread''s non-flagged messages');

-- ── staff<->staff messaging works, still excludes non-staff ──────────────
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000002"}';
insert into public.message_threads (id, kind, staff_a_id, staff_b_id) values
  ('f3000000-0000-0000-0000-000000000009', 'staff', 'e3000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.message_threads where id = 'f3000000-0000-0000-0000-000000000009'), 1, 'a teacher can open a staff-to-staff thread with another teacher');

select throws_ok(
  $$insert into public.message_threads (kind, staff_a_id, staff_b_id) values ('staff', 'e3000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000004')$$,
  42501,
  null,
  'a teacher cannot open a "staff" thread naming a parent as the other party'
);

-- ── announcements ─────────────────────────────────────────────────────────
insert into public.announcements (id, scope, class_id, title, body, author_id) values
  ('f300000a-0000-0000-0000-000000000001', 'class', 'f3000000-0000-0000-0000-000000000004', 'TEST Trip reminder', 'Bring wellies', 'e3000000-0000-0000-0000-000000000002');
set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.announcements where id = 'f300000a-0000-0000-0000-000000000001'), 1, 'parent of an enrolled child can read a class announcement');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.announcements where id = 'f300000a-0000-0000-0000-000000000001'), 0, 'an unrelated parent cannot read a class announcement for a class their child isn''t in');

set local "request.jwt.claims" to '{"sub": "e3000000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.announcements (scope, class_id, title, body, author_id) values ('class', 'f3000000-0000-0000-0000-000000000004', 'Hijack', 'nope', 'e3000000-0000-0000-0000-000000000003')$$,
  42501,
  null,
  'a teacher who does not teach the class cannot post an announcement to it'
);

select * from finish();
rollback;
