-- Run via `supabase test db`. Covers 0072: Qur'an scores and targets, GCSE
-- predicted vs actual grades, and parent-evening booking (RPC rules, no
-- double-booking, cancel/rebook, visibility).
begin;
select plan(38);

insert into auth.users (id, email) values
  ('e8000000-0000-0000-0000-000000000001', 'ht-pt@example.com'),
  ('e8000000-0000-0000-0000-000000000002', 'teacher-pt1@example.com'),
  ('e8000000-0000-0000-0000-000000000003', 'teacher-pt2@example.com'),
  ('e8000000-0000-0000-0000-000000000004', 'lead-pt@example.com'),
  ('e8000000-0000-0000-0000-000000000005', 'parent-pt1@example.com'),
  ('e8000000-0000-0000-0000-000000000006', 'parent-pt2@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e8000000-0000-0000-0000-000000000001', 'admin', 'HT PT', 'ht-pt@example.com'),
  ('e8000000-0000-0000-0000-000000000002', 'teacher', 'Teacher PT1', 'teacher-pt1@example.com'),
  ('e8000000-0000-0000-0000-000000000003', 'teacher', 'Teacher PT2', 'teacher-pt2@example.com'),
  ('e8000000-0000-0000-0000-000000000004', 'teacher', 'Lead PT', 'lead-pt@example.com'),
  ('e8000000-0000-0000-0000-000000000005', 'parent', 'Parent PT1', 'parent-pt1@example.com'),
  ('e8000000-0000-0000-0000-000000000006', 'parent', 'Parent PT2', 'parent-pt2@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8000000-0000-0000-0000-000000000001', 'head_teacher', 'none', null);
insert into public.user_permissions (user_id, permission) values
  ('e8000000-0000-0000-0000-000000000004', 'assessment_lead');

insert into public.year_groups (id, name) values ('f8000000-0000-0000-0000-000000000001', 'TEST Year 10 pt');
insert into public.subjects (id, name) values ('f8000000-0000-0000-0000-000000000002', 'TEST Maths pt');
insert into public.classes (id, name, year_group, year_group_id, subject_id) values
  ('f8000000-0000-0000-0000-000000000003', 'TEST Class A pt', 'TEST Year 10 pt', 'f8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000002'),
  ('f8000000-0000-0000-0000-000000000004', 'TEST Class B pt', 'TEST Year 10 pt', 'f8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000002');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e8000000-0000-0000-0000-000000000002', 'teacher', 'class', 'f8000000-0000-0000-0000-000000000003'),
  ('e8000000-0000-0000-0000-000000000003', 'teacher', 'class', 'f8000000-0000-0000-0000-000000000004');

-- child1 (parent1) and child2 (parent2) are in class A, child4 (parent1) is
-- in class B, child3 (parent2) is in no class.
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('f8000000-0000-0000-0000-000000000005', 'e8000000-0000-0000-0000-000000000005', 'TEST Child PT1', '2010-01-01', 'f8000000-0000-0000-0000-000000000001', true),
  ('f8000000-0000-0000-0000-000000000006', 'e8000000-0000-0000-0000-000000000006', 'TEST Child PT2', '2010-01-01', 'f8000000-0000-0000-0000-000000000001', true),
  ('f8000000-0000-0000-0000-000000000007', 'e8000000-0000-0000-0000-000000000006', 'TEST Child PT3', '2010-01-01', 'f8000000-0000-0000-0000-000000000001', true),
  ('f8000000-0000-0000-0000-000000000008', 'e8000000-0000-0000-0000-000000000005', 'TEST Child PT4', '2010-01-01', 'f8000000-0000-0000-0000-000000000001', true);
insert into public.enrolments (class_id, child_id) values
  ('f8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000005'),
  ('f8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000006'),
  ('f8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000008');

-- An open parent evening starting two days from now: 10-minute slots over two
-- hours, with both teachers taking part, plus a draft one parents must not see.
insert into public.parent_evenings (id, title, starts_at, ends_at, slot_minutes, status, created_by) values
  ('f8000000-0000-0000-0000-0000000000e1', 'TEST Parent evening open', date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 2 hours', 10, 'open', 'e8000000-0000-0000-0000-000000000001'),
  ('f8000000-0000-0000-0000-0000000000e2', 'TEST Parent evening draft', date_trunc('hour', now()) + interval '9 days', date_trunc('hour', now()) + interval '9 days 2 hours', 10, 'draft', 'e8000000-0000-0000-0000-000000000001');
insert into public.parent_evening_teachers (evening_id, teacher_id) values
  ('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002'),
  ('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000003');

set local role authenticated;

-- ═══ A. Qur'an score and targets ═════════════════════════════════════════
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000004"}';
select lives_ok(
  $$insert into public.quran_progress (child_id, class_id, milestone_type, surah_from, surah_to, standard, score, pages, recorded_by) values ('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000003', 'quran_memorisation', 78, 78, 'secure', 8, 2, 'e8000000-0000-0000-0000-000000000004')$$,
  'the assessment lead can record a session score out of 10'
);
select throws_ok(
  $$insert into public.quran_progress (child_id, class_id, milestone_type, surah_from, surah_to, standard, score, recorded_by) values ('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000003', 'quran_memorisation', 78, 78, 'secure', 11, 'e8000000-0000-0000-0000-000000000004')$$,
  '23514',
  null,
  'a score above 10 is rejected'
);
select lives_ok(
  $$insert into public.quran_targets (child_id, class_id, title, target_kind, target_amount, due_date, set_by) values ('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000003', 'Finish Juz Amma', 'juz', 1, current_date + 60, 'e8000000-0000-0000-0000-000000000004')$$,
  'the assessment lead can set a target'
);
select throws_ok(
  $$insert into public.quran_targets (child_id, title, target_kind, target_amount, start_date, due_date) values ('f8000000-0000-0000-0000-000000000005', 'Backwards', 'pages', 5, current_date, current_date - 1)$$,
  '23514',
  null,
  'a target due before it starts is rejected'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000002"}';
select throws_ok(
  $$insert into public.quran_targets (child_id, class_id, title, target_kind, target_amount, due_date) values ('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000003', 'Not allowed', 'pages', 5, current_date + 30)$$,
  '42501',
  null,
  'an ordinary class teacher cannot set a Qur''an target (same gate as quran_progress)'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000005"}';
select is((select score::int from public.quran_progress where child_id = 'f8000000-0000-0000-0000-000000000005'), 8, 'the parent sees the session score');
select is((select count(*)::int from public.quran_targets), 1, 'the parent sees their child''s target');

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.quran_targets), 0, 'another family cannot see the target');

-- ═══ B. GCSE grades ══════════════════════════════════════════════════════
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.gcse_grades (child_id, subject_id, class_id, target_grade, predicted_grade, actual_grade, entered_by) values ('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003', 7, 7, 6, 'e8000000-0000-0000-0000-000000000002')$$,
  'the class teacher can enter target, predicted and actual GCSE grades'
);
select throws_ok(
  $$insert into public.gcse_grades (child_id, subject_id, class_id, predicted_grade) values ('f8000000-0000-0000-0000-000000000006', 'f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003', 10)$$,
  '23514',
  null,
  'a grade above 9 is rejected'
);
select throws_ok(
  $$insert into public.gcse_grades (child_id, subject_id, class_id, predicted_grade) values ('f8000000-0000-0000-0000-000000000007', 'f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003', 5)$$,
  '42501',
  null,
  'a teacher cannot grade a child who is not enrolled in their class'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000003"}';
select throws_ok(
  $$insert into public.gcse_grades (child_id, subject_id, class_id, predicted_grade) values ('f8000000-0000-0000-0000-000000000006', 'f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003', 5)$$,
  '42501',
  null,
  'a teacher of another class cannot grade this class'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.gcse_grades), 1, 'the parent sees their child''s GCSE grades');
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000006"}';
select is((select count(*)::int from public.gcse_grades), 0, 'another family sees no GCSE grades');
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.gcse_grades), 1, 'the head sees all GCSE grades');

-- ═══ C. Parent evenings ══════════════════════════════════════════════════
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000005"}';
select is((select count(*)::int from public.parent_evenings), 1, 'a parent sees the open evening but not the draft');
select is((select count(*)::int from public.parent_evening_options()), 2, 'the parent can book the teachers of both their children');

select lives_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000005', (select starts_at from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'a parent can book a slot with their child''s teacher'
);
do $$
begin
  perform set_config('app.test_booking', (select id::text from public.parent_evening_bookings limit 1), true);
end;
$$;

select throws_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000005', (select starts_at + interval '20 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'P0001',
  'already_booked_with_teacher',
  'a child can only have one slot per teacher'
);
select throws_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000008', (select starts_at from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'P0001',
  'parent_clash',
  'a parent cannot be in two meetings at the same time'
);
select throws_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000005', (select starts_at + interval '30 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'P0001',
  'teacher_does_not_teach_child',
  'a parent cannot book a teacher who does not teach that child'
);
select throws_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000008', (select starts_at + interval '3 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'P0001',
  'invalid_slot',
  'a time that is not on the slot grid is rejected'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000006"}';
select throws_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000006', (select starts_at from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'P0001',
  'slot_taken',
  'a second parent cannot take an already-booked slot'
);
select throws_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000005', (select starts_at + interval '10 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  '42501',
  'forbidden',
  'a parent cannot book on behalf of someone else''s child'
);
select throws_ok(
  $$select public.cancel_parent_evening_booking(current_setting('app.test_booking')::uuid)$$,
  '42501',
  'forbidden',
  'another parent cannot cancel the booking'
);
select lives_ok(
  $$select public.book_parent_evening_slot('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000006', (select starts_at + interval '10 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'the second parent can take a free slot'
);

-- ── rebook: all or nothing ───────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000005"}';
select throws_ok(
  $$select public.rebook_parent_evening_slot(current_setting('app.test_booking')::uuid, (select starts_at + interval '10 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'P0001',
  'slot_taken',
  'rebooking onto a taken slot fails'
);
select is(
  (select status from public.parent_evening_bookings where id = current_setting('app.test_booking')::uuid),
  'booked',
  'a failed rebook leaves the original booking in place'
);
select lives_ok(
  $$select public.rebook_parent_evening_slot(current_setting('app.test_booking')::uuid, (select starts_at + interval '20 minutes' from public.parent_evenings where id = 'f8000000-0000-0000-0000-0000000000e1'))$$,
  'rebooking onto a free slot works'
);
select is(
  (select count(*)::int from public.parent_evening_bookings where status = 'booked'),
  1,
  'after a rebook the parent has exactly one live booking'
);
select is(
  (select count(*)::int from public.parent_evening_taken_slots('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002')),
  2,
  'taken slots show only times, and the freed slot is available again'
);
select throws_ok(
  $$insert into public.parent_evening_bookings (evening_id, teacher_id, child_id, parent_user_id, slot_start, slot_end) values ('f8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000005', 'e8000000-0000-0000-0000-000000000005', now() + interval '3 days', now() + interval '3 days 10 minutes')$$,
  '42501',
  null,
  'bookings cannot be inserted directly, only through the RPC'
);

-- ── teacher and admin views, join links, and the evening guard ───────────
set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.my_parent_evening_schedule('f8000000-0000-0000-0000-0000000000e1')),
  2,
  'the teacher sees both of their booked meetings'
);
select throws_ok(
  $$select public.set_parent_evening_join_url('f8000000-0000-0000-0000-0000000000e1', 'http://insecure.example/room')$$,
  'P0001',
  'invalid_url',
  'a meeting link must be https'
);
select lives_ok(
  $$select public.set_parent_evening_join_url('f8000000-0000-0000-0000-0000000000e1', 'https://meet.example/teacher1')$$,
  'a teacher can set their own meeting link'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000005"}';
select is(
  (select join_url from public.my_parent_evening_bookings() limit 1),
  'https://meet.example/teacher1',
  'the parent gets the teacher''s link with their booking'
);

set local "request.jwt.claims" to '{"sub": "e8000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.parent_evening_admin_bookings('f8000000-0000-0000-0000-0000000000e1')),
  2,
  'the head sees every booking for the evening'
);
select throws_ok(
  $$update public.parent_evenings set slot_minutes = 15 where id = 'f8000000-0000-0000-0000-0000000000e1'$$,
  'P0001',
  'evening_has_bookings',
  'the slot grid cannot change once parents have booked'
);

select * from finish();
rollback;
