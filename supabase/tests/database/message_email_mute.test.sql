-- Run via `supabase test db`. Covers 0205: email settings, mute, delivered
-- and staff-only attachments.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('e4200000-0000-0000-0000-000000000001', 'teacher-mute@example.com'),
  ('e4200000-0000-0000-0000-000000000002', 'parent-mute@example.com'),
  ('e4200000-0000-0000-0000-000000000003', 'parent2-mute@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('e4200000-0000-0000-0000-000000000001', 'teacher', 'Teacher Mute', 'teacher-mute@example.com'),
  ('e4200000-0000-0000-0000-000000000002', 'parent', 'Parent Mute', 'parent-mute@example.com'),
  ('e4200000-0000-0000-0000-000000000003', 'parent', 'Parent Two Mute', 'parent2-mute@example.com');

insert into public.academic_years (id, label, starts_on, ends_on, is_test) values
  ('f4200000-0000-0000-0000-000000000001', 'TEST 2099/00 mute', '2099-09-01', '2100-07-01', true);
insert into public.year_groups (id, name) values ('f4200000-0000-0000-0000-000000000002', 'TEST Year 6 mute');
insert into public.subjects (id, name, is_core) values ('f4200000-0000-0000-0000-000000000003', 'TEST English mute', true);
insert into public.classes (id, name, year_group, academic_year_id, year_group_id, subject_id) values
  ('f4200000-0000-0000-0000-000000000004', 'TEST Class MUTE', 'TEST Year 6 mute', 'f4200000-0000-0000-0000-000000000001', 'f4200000-0000-0000-0000-000000000002', 'f4200000-0000-0000-0000-000000000003');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e4200000-0000-0000-0000-000000000001', 'teacher', 'class', 'f4200000-0000-0000-0000-000000000004'),
  ('e4200000-0000-0000-0000-000000000002', 'parent', 'none', null),
  ('e4200000-0000-0000-0000-000000000003', 'parent', 'none', null);
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f4200000-0000-0000-0000-000000000011', 'e4200000-0000-0000-0000-000000000002', 'TEST Child mute', '2014-01-01', 'f4200000-0000-0000-0000-000000000002', true);
insert into public.enrolments (class_id, child_id) values
  ('f4200000-0000-0000-0000-000000000004', 'f4200000-0000-0000-0000-000000000011');

-- A direct conversation between the teacher and the parent, with one message each.
insert into public.message_threads (id, kind, staff_a_id, staff_b_id) values
  ('f4200000-0000-0000-0000-000000000020', 'direct', 'e4200000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000002');
insert into public.message_thread_messages (id, thread_id, sender_id, body) values
  ('f4200000-0000-0000-0000-000000000021', 'f4200000-0000-0000-0000-000000000020', 'e4200000-0000-0000-0000-000000000001', 'TEST from teacher'),
  ('f4200000-0000-0000-0000-000000000022', 'f4200000-0000-0000-0000-000000000020', 'e4200000-0000-0000-0000-000000000002', 'TEST from parent');

set local role authenticated;

-- ── email settings ──────────────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e4200000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.message_prefs (user_id, email_mode) values ('e4200000-0000-0000-0000-000000000002', 'daily')$$,
  'a person chooses a daily email'
);
select throws_ok(
  $$update public.message_prefs set email_mode = 'hourly' where user_id = 'e4200000-0000-0000-0000-000000000002'$$,
  '23514', null, 'only immediate, daily or off'
);
select throws_ok($$select count(*) from public.message_email_log$$, '42501', null, 'nobody signed in reads the email log');

-- ── mute ────────────────────────────────────────────────────────────────
select lives_ok(
  $$insert into public.message_thread_mutes (thread_id) values ('f4200000-0000-0000-0000-000000000020')$$,
  'a person mutes their own conversation'
);
select throws_ok(
  $$insert into public.message_thread_mutes (user_id, thread_id) values ('e4200000-0000-0000-0000-000000000001', 'f4200000-0000-0000-0000-000000000020')$$,
  '42501', null, 'nobody mutes a conversation for someone else'
);

-- ── delivered ───────────────────────────────────────────────────────────
select lives_ok($$select public.mark_messages_delivered()$$, 'the parent''s portal marks conversations delivered');

set local "request.jwt.claims" to '{"sub": "e4200000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.message_thread_mutes (thread_id) values ('f4200000-0000-0000-0000-000000000020')$$,
  '42501', null, 'someone outside a conversation cannot mute it'
);
select is((select count(*)::int from public.thread_delivery('f4200000-0000-0000-0000-000000000020')), 0, 'outsiders see no delivery times');

set local "request.jwt.claims" to '{"sub": "e4200000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.message_thread_mutes), 0, 'a person never sees someone else''s mutes');
select is(
  (select count(*)::int from public.thread_delivery('f4200000-0000-0000-0000-000000000020') where user_id = 'e4200000-0000-0000-0000-000000000002'),
  1, 'the sender sees when the message reached the other person'
);

-- ── attachments: staff only ─────────────────────────────────────────────
select lives_ok(
  $$insert into public.message_attachments (message_id, thread_id, uploader_id, storage_path, file_name, mime_type, size_bytes)
    values ('f4200000-0000-0000-0000-000000000021', 'f4200000-0000-0000-0000-000000000020', 'e4200000-0000-0000-0000-000000000001',
            'f4200000-0000-0000-0000-000000000020/e4200000-0000-0000-0000-000000000001/a-letter.pdf', 'letter.pdf', 'application/pdf', 1000)$$,
  'a teacher attaches a file to their own message'
);

set local "request.jwt.claims" to '{"sub": "e4200000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.message_attachments (message_id, thread_id, uploader_id, storage_path, file_name, mime_type, size_bytes)
    values ('f4200000-0000-0000-0000-000000000022', 'f4200000-0000-0000-0000-000000000020', 'e4200000-0000-0000-0000-000000000002',
            'f4200000-0000-0000-0000-000000000020/e4200000-0000-0000-0000-000000000002/b-photo.pdf', 'photo.pdf', 'application/pdf', 1000)$$,
  '42501', null, 'a parent cannot attach files (staff only, like the other upload buckets)'
);

select * from finish();
rollback;
