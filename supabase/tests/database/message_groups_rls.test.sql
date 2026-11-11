-- Run via `supabase test db`. Covers 0210_message_groups.sql: group
-- conversations, replies, attachments, receipts and search.
--
-- The guarantees proven here:
--   * only staff create groups, and only for classes they teach;
--   * nobody reads a group (or its messages, members or files) they are not in;
--   * in a group, parents and pupils see staff messages and their own, never
--     each other's (no parent-to-parent or pupil-to-pupil channel);
--   * the Headteacher (oversight) reads every group and message.
begin;
select plan(33);

insert into auth.users (id, email) values
  ('e4100000-0000-0000-0000-000000000001', 'ht-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000002', 'teacher-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000003', 'teacher2-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000004', 'parent-a-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000005', 'parent-b-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000006', 'parent-c-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000007', 'pupil-a-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000008', 'pupil-b-grp@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e4100000-0000-0000-0000-000000000001', 'admin', 'HT Group', 'ht-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000002', 'teacher', 'Teacher Group', 'teacher-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000003', 'teacher', 'Teacher Two Group', 'teacher2-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000004', 'parent', 'Parent A Group', 'parent-a-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000005', 'parent', 'Parent B Group', 'parent-b-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000006', 'parent', 'Parent C Group', 'parent-c-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000007', 'student', 'Pupil A Group', 'pupil-a-grp@example.com'),
  ('e4100000-0000-0000-0000-000000000008', 'student', 'Pupil B Group', 'pupil-b-grp@example.com');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f4100000-0000-0000-0000-000000000001', 'TEST 2099/00 grp', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values
  ('f4100000-0000-0000-0000-000000000002', 'TEST Year 5 grp');
insert into public.subjects (id, name, is_core) values
  ('f4100000-0000-0000-0000-000000000003', 'TEST Maths grp', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f4100000-0000-0000-0000-000000000004', 'TEST Class GRP', 'TEST Year 5 grp', 'f4100000-0000-0000-0000-000000000001', 'f4100000-0000-0000-0000-000000000002', 'f4100000-0000-0000-0000-000000000003'),
  ('f4100000-0000-0000-0000-000000000005', 'TEST Other Class GRP', 'TEST Year 5 grp', 'f4100000-0000-0000-0000-000000000001', 'f4100000-0000-0000-0000-000000000002', 'f4100000-0000-0000-0000-000000000003');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e4100000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e4100000-0000-0000-0000-000000000002', 'teacher', 'class', 'f4100000-0000-0000-0000-000000000004'),
  ('e4100000-0000-0000-0000-000000000003', 'teacher', 'class', 'f4100000-0000-0000-0000-000000000005'),
  ('e4100000-0000-0000-0000-000000000004', 'parent', 'none', null),
  ('e4100000-0000-0000-0000-000000000005', 'parent', 'none', null),
  ('e4100000-0000-0000-0000-000000000006', 'parent', 'none', null),
  ('e4100000-0000-0000-0000-000000000007', 'student', 'none', null),
  ('e4100000-0000-0000-0000-000000000008', 'student', 'none', null);

insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f4100000-0000-0000-0000-000000000011', 'e4100000-0000-0000-0000-000000000004', 'TEST Child A grp', '2015-01-01', 'f4100000-0000-0000-0000-000000000002', true),
  ('f4100000-0000-0000-0000-000000000012', 'e4100000-0000-0000-0000-000000000005', 'TEST Child B grp', '2015-01-01', 'f4100000-0000-0000-0000-000000000002', true),
  ('f4100000-0000-0000-0000-000000000013', 'e4100000-0000-0000-0000-000000000006', 'TEST Child C grp', '2015-01-01', 'f4100000-0000-0000-0000-000000000002', true);
insert into public.student_accounts (child_id, profile_id) values
  ('f4100000-0000-0000-0000-000000000011', 'e4100000-0000-0000-0000-000000000007'),
  ('f4100000-0000-0000-0000-000000000012', 'e4100000-0000-0000-0000-000000000008');
insert into public.enrolments (class_id, child_id) values
  ('f4100000-0000-0000-0000-000000000004', 'f4100000-0000-0000-0000-000000000011'),
  ('f4100000-0000-0000-0000-000000000004', 'f4100000-0000-0000-0000-000000000012'),
  ('f4100000-0000-0000-0000-000000000005', 'f4100000-0000-0000-0000-000000000013');

set local role authenticated;

-- ── only staff create groups, and only for their own classes ─────────────
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000007"}';
select throws_ok(
  $$select public.create_message_group('Pupils only', 'ad_hoc', null, null, false, false, false, array['e4100000-0000-0000-0000-000000000008']::uuid[], true)$$,
  '42501', null, 'a pupil cannot create a group'
);

set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000004"}';
select throws_ok(
  $$select public.create_message_group('Parents only', 'ad_hoc', null, null, false, false, false, array['e4100000-0000-0000-0000-000000000005']::uuid[], true)$$,
  '42501', null, 'a parent cannot create a group'
);

set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$select public.create_message_group('Not my class', 'class', 'f4100000-0000-0000-0000-000000000004', null, true, true, true, '{}'::uuid[], true)$$,
  '42501', null, 'a teacher cannot make a group for a class they do not teach'
);

set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.message_threads (kind, title, group_type, created_by) values ('group', 'Sneaky', 'ad_hoc', 'e4100000-0000-0000-0000-000000000002')$$,
  '42501', null, 'a group cannot be inserted directly, only through create_message_group()'
);
select throws_ok(
  $$select public.create_message_group('With an outsider', 'ad_hoc', null, null, false, false, false, array['e4100000-0000-0000-0000-000000000006']::uuid[], true)$$,
  '42501', null, 'a teacher cannot add a parent whose child they do not teach'
);
select throws_ok(
  $$select public.create_message_group('Staff plus parent', 'staff', null, null, false, false, false, array['e4100000-0000-0000-0000-000000000004']::uuid[], true)$$,
  'P0001', null, 'a staff group cannot include a parent'
);

-- The teacher makes a class group with the class's parents and pupils.
select isnt(
  set_config('test.grp', public.create_message_group('TEST Class GRP families', 'class', 'f4100000-0000-0000-0000-000000000004', null, true, true, true, '{}'::uuid[], true)::text, true),
  null, 'a teacher can make a group for their own class');
select is((select count(*)::int from public.message_thread_members where thread_id = current_setting('test.grp')::uuid), 5, 'the class group holds the teacher, two parents and two pupils');

select throws_ok(
  $$insert into public.message_thread_members (thread_id, user_id, member_role) values (current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000006', 'parent')$$,
  '42501', null, 'members cannot be added by writing to the table directly'
);

insert into public.message_thread_messages (id, thread_id, sender_id, body) values ('f4100000-0000-0000-0000-000000000021', current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000002', 'TEST Trip on Friday, please reply');

-- Parent A replies to the teacher's message.
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.message_threads where id = current_setting('test.grp')::uuid), 1, 'a parent in the group can see the group');
insert into public.message_thread_messages (id, thread_id, sender_id, body, reply_to_id) values ('f4100000-0000-0000-0000-000000000022', current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000004', 'TEST zebra private reply from parent A', 'f4100000-0000-0000-0000-000000000021');
select is((select reply_to_id from public.message_thread_messages where id = 'f4100000-0000-0000-0000-000000000022'), 'f4100000-0000-0000-0000-000000000021'::uuid, 'a parent can reply to the teacher''s message');
insert into public.message_attachments (message_id, thread_id, uploader_id, storage_path, file_name, mime_type, size_bytes) values ('f4100000-0000-0000-0000-000000000022', current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000004',
         current_setting('test.grp') || '/e4100000-0000-0000-0000-000000000004/x-form.pdf', 'form.pdf', 'application/pdf', 1000);
select is((select count(*)::int from public.message_attachments where message_id = 'f4100000-0000-0000-0000-000000000022'), 1, 'the sender can attach a file to their own message');
select is(public.can_post_in_thread(current_setting('test.grp')::uuid), true, 'a parent in a group with replies on can post');

-- Parent B: sees the teacher's message, not parent A's reply, file or name.
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = current_setting('test.grp')::uuid), 1, 'another parent sees only the staff message, not parent A''s reply');
select is((select count(*)::int from public.message_attachments where thread_id = current_setting('test.grp')::uuid), 0, 'another parent cannot see parent A''s attachment');
select is((select count(*)::int from public.message_thread_members where thread_id = current_setting('test.grp')::uuid), 2, 'a parent sees only the staff and themselves in the member table');
select is((select count(*)::int from public.thread_members(current_setting('test.grp')::uuid)), 2, 'thread_members() also shows a parent only the staff and themselves');
select is((select count(*)::int from public.search_messages('zebra')), 0, 'search never finds another parent''s message');
select throws_ok(
  $$insert into public.message_thread_messages (thread_id, sender_id, body, reply_to_id) values (current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000005', 'quoting', 'f4100000-0000-0000-0000-000000000022')$$,
  'P0001', null, 'a parent cannot reply to (and so quote) a message they cannot see'
);

-- Pupil A: staff message only.
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000007"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = current_setting('test.grp')::uuid), 1, 'a pupil in the group sees only the staff message');
select lives_ok($$select public.mark_thread_read(current_setting('test.grp')::uuid)$$, 'a pupil can mark a group read');

-- Outsiders see nothing.
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.message_threads where id = current_setting('test.grp')::uuid), 0, 'a parent outside the group cannot see the group');
select is((select count(*)::int from public.message_thread_messages where thread_id = current_setting('test.grp')::uuid), 0, 'a parent outside the group cannot read its messages');
select is((select count(*)::int from public.my_message_threads() where thread_id = current_setting('test.grp')::uuid), 0, 'the group is not in an outsider''s inbox');

set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = current_setting('test.grp')::uuid), 0, 'a teacher outside the group cannot read its messages');
select is((select count(*)::int from public.message_attachments where thread_id = current_setting('test.grp')::uuid), 0, 'a teacher outside the group cannot see its files');

-- The teacher sees everything and gets "Seen by 1 of 4".
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = current_setting('test.grp')::uuid), 2, 'staff in the group see every message, replies included');
select is(
  (select audience || ':' || count(reader_id) from public.message_receipts(current_setting('test.grp')::uuid) group by audience),
  '4:1', 'the teacher''s message shows seen by 1 of 4');

-- Replies off: pupils and parents can no longer post.
select lives_ok($$select public.message_group_update(current_setting('test.grp')::uuid, 'TEST Class GRP families', false)$$, 'the group''s creator can switch replies off');
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000007"}';
select throws_ok(
  $$insert into public.message_thread_messages (thread_id, sender_id, body) values (current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000007', 'hello')$$,
  '42501', null, 'with replies off, a pupil cannot post'
);
select throws_ok(
  $$select public.message_group_remove_member(current_setting('test.grp')::uuid, 'e4100000-0000-0000-0000-000000000008')$$,
  '42501', null, 'a pupil cannot remove another member'
);

-- Oversight: the Headteacher reads the whole group.
set local "request.jwt.claims" to '{"sub": "e4100000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.message_thread_messages where thread_id = current_setting('test.grp')::uuid), 2, 'the Headteacher (oversight) reads every message in the group');
select is((select category from public.oversight_list_threads() where thread_id = current_setting('test.grp')::uuid), 'group', 'the group is listed in message oversight');

select * from finish();
rollback;
