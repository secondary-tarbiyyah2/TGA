-- Run via `supabase test db`. Covers 0184 (Tafweed T2, T33): a draft pack is
-- made when every lesson in a unit is signed off, it stays hidden until a
-- teacher checks it, pending (AI-drafted) questions can never be active, and
-- pupils see a unit's to-do list only once a teacher has shown it.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('a1840000-0000-0000-0000-000000000001', 'teacher-184@example.com'),
  ('a1840000-0000-0000-0000-000000000002', 'parent-184@example.com'),
  ('a1840000-0000-0000-0000-000000000003', 'pupil.184@students.tarbiyyah.internal');
insert into public.profiles (id, role, full_name, email) values
  ('a1840000-0000-0000-0000-000000000001', 'teacher', 'Teacher 184', 'teacher-184@example.com'),
  ('a1840000-0000-0000-0000-000000000002', 'parent', 'Parent 184', 'parent-184@example.com'),
  ('a1840000-0000-0000-0000-000000000003', 'student', 'Pupil 184', 'pupil.184@students.tarbiyyah.internal');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1840000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a1840000-0000-0000-0000-000000000002', 'parent', 'none', null);
insert into public.year_groups (id, name) values ('b1840000-0000-0000-0000-000000000001', 'TEST Year 8 rp');
insert into public.children (id, parent_user_id, name, dob, year_group_id, is_test) values
  ('b1840000-0000-0000-0000-000000000002', 'a1840000-0000-0000-0000-000000000002', 'Pupil 184', '2013-01-01', 'b1840000-0000-0000-0000-000000000001', true);
insert into public.student_accounts (child_id, profile_id) values
  ('b1840000-0000-0000-0000-000000000002', 'a1840000-0000-0000-0000-000000000003');

-- Two lessons in one unit; the first has a hinge question in its content.
insert into public.curriculum_lessons (subject_slug, subject, year, unit, lesson_no, title, content) values
  ('test-rp', 'Test subject', 'y8', 'Unit A', 1, 'First lesson',
   '{"teach": [{"heading": "x", "check": {"q": "Which is right?", "options": ["One", "Two", "Three"], "answer": 1, "why": "Because."}}]}'::jsonb),
  ('test-rp', 'Test subject', 'y8', 'Unit A', 2, 'Second lesson', null);

-- Revision packs start switched off (0206, School features); these tests need them on.
update public.school_features set enabled = true where key = 'revision_packs';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1840000-0000-0000-0000-000000000001"}';

select lives_ok($$select public.curriculum_set_signoff('test-rp', 'lesson', 'y8/1', 'approved', null)$$, 'a teacher signs off the first lesson');
select is((select count(*)::int from public.revision_units where subject_slug = 'test-rp'), 0, 'no pack while a lesson is not signed off');
select lives_ok($$select public.curriculum_set_signoff('test-rp', 'lesson', 'y8/2', 'approved', null)$$, 'a teacher signs off the last lesson');
select is((select source || '/' || published::text from public.revision_units where subject_slug = 'test-rp' and unit = 'Unit A'), 'auto/false', 'a hidden auto draft pack is made once every lesson is signed off');
select is((select count(*)::int from public.revision_questions q join public.revision_units u on u.id = q.unit_id where u.subject_slug = 'test-rp' and q.active), 1, 'the lessons'' hinge question is in the draft');
select ok((select count(*) from public.revision_todos t join public.revision_units u on u.id = t.unit_id where u.subject_slug = 'test-rp') >= 5, 'the draft has a to-do list');

select throws_ok($$update public.revision_units set published = true where subject_slug = 'test-rp'$$, '23514', null, 'an auto pack cannot be shown to pupils before a teacher checks it');

-- A pending (AI-drafted) question stays inactive, even if someone tries to switch it on.
insert into public.revision_questions (unit_id, qkey, topic, question, options, answer, review, drafted_by_ai, source)
select id, 'ai-1', 'First lesson', 'Drafted question?', '["A", "B"]'::jsonb, 0, 'pending', true, 'staff' from public.revision_units where subject_slug = 'test-rp';
update public.revision_questions set active = true where qkey = 'ai-1';
select is((select active from public.revision_questions where qkey = 'ai-1'), false, 'a pending question can never be active');
update public.revision_questions set review = 'approved', active = true where qkey = 'ai-1';
select is((select active::text || '/' || (approved_by is not null)::text from public.revision_questions where qkey = 'ai-1'), 'true/true', 'approving a question makes it active and records who approved it');

select lives_ok($$update public.revision_units set published = true, checked_at = now(), checked_by = auth.uid() where subject_slug = 'test-rp'$$, 'a teacher approves the pack');

-- Pupil: no to-do list until a teacher shows it.
set local "request.jwt.claims" to '{"sub": "a1840000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.revision_todos), 0, 'a pupil cannot see a to-do list that has not been shown');
select is((select count(*)::int from public.revision_questions), 0, 'a pupil still cannot read the question table');

set local "request.jwt.claims" to '{"sub": "a1840000-0000-0000-0000-000000000001"}';
update public.revision_units set todos_checked_at = now() where subject_slug = 'test-rp';

set local "request.jwt.claims" to '{"sub": "a1840000-0000-0000-0000-000000000003"}';
select ok((select count(*) from public.revision_todos) >= 5, 'a pupil sees the to-do list once it is shown');
select lives_ok($$select public.revision_tick_todo((select id from public.revision_todos order by sort_order limit 1), true)$$, 'a pupil ticks an item');
select throws_ok($$insert into public.revision_todos (unit_id, body) select id, 'Sneaky item' from public.revision_units limit 1$$, '42501', null, 'a pupil cannot add to a to-do list');

set local "request.jwt.claims" to '{"sub": "a1840000-0000-0000-0000-000000000002"}';
select throws_ok($$select public.revision_create_draft_pack('test-rp', 'y8', 'Unit A')$$, '42501', null, 'a parent cannot make a pack');

select * from finish();
rollback;
