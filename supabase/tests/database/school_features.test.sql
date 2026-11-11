-- Run via `supabase test db`. Covers 0210 (School features, owner feedback 11 Nov 2026):
--  * everyone signed in reads the switches; only the Headteacher and Admin change them;
--  * defaults: revision packs off, everything else on;
--  * "Only subject teachers can edit lessons": on, a maths teacher cannot edit or save a
--    history lesson; off, they can (enforced in the database, not only the page);
--  * revision packs off: signing off a unit's last lesson makes no draft pack; on, it does.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('e2060000-0000-0000-0000-000000000001', 'head-206@example.com'),
  ('e2060000-0000-0000-0000-000000000002', 'maths-206@example.com'),
  ('e2060000-0000-0000-0000-000000000003', 'parent-206@example.com'),
  ('e2060000-0000-0000-0000-000000000004', 'admin-206@example.com');

insert into public.profiles (id, role, full_name, email) values
  ('e2060000-0000-0000-0000-000000000001', 'admin', 'Head 206', 'head-206@example.com'),
  ('e2060000-0000-0000-0000-000000000002', 'teacher', 'Maths 206', 'maths-206@example.com'),
  ('e2060000-0000-0000-0000-000000000003', 'parent', 'Parent 206', 'parent-206@example.com'),
  ('e2060000-0000-0000-0000-000000000004', 'admin', 'Admin 206', 'admin-206@example.com');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('e2060000-0000-0000-0000-000000000001', 'head_teacher', 'none', null),
  ('e2060000-0000-0000-0000-000000000002', 'teacher', 'none', null),
  ('e2060000-0000-0000-0000-000000000003', 'parent', 'none', null),
  ('e2060000-0000-0000-0000-000000000004', 'admin', 'none', null);

insert into public.staff_profiles (user_id, subjects_taught) values ('e2060000-0000-0000-0000-000000000002', '{Maths}');

insert into public.curriculum_lessons (id, subject_slug, subject, year, unit, lesson_no, title, objectives) values
  ('f2060000-0000-0000-0000-000000000001', 'mathematics-206', 'Mathematics', 'y7', 'Number', 1, 'Place value', '["o"]'),
  ('f2060000-0000-0000-0000-000000000002', 'history-206', 'History', 'y7', 'Normans', 1, 'Hastings', '["o"]');

-- The defaults as shipped (a test database starts from the migrations).
select is(
  (select string_agg(key || '=' || enabled::text, ',' order by key) from public.school_features),
  'ai_helpers=true,guide_journeys=true,house_points=true,lesson_feedback=true,revision_packs=false,subject_lesson_editing=true',
  'revision packs start off and every other switch starts on'
);

set local role authenticated;

-- ── who can read and change the switches ────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.school_features), 6, 'a parent can read the switches (the portal hides switched-off parts for them too)');
update public.school_features set enabled = true where key = 'revision_packs';
select is(public.school_feature_on('revision_packs'), false, 'a parent cannot switch anything on');

set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000002"}';
update public.school_features set enabled = false where key = 'subject_lesson_editing';
select is(public.school_feature_on('subject_lesson_editing'), true, 'a teacher cannot change a switch');
select throws_ok($$insert into public.school_features (key, enabled) values ('house_points', false)$$, '42501', null, 'nobody can add a switch');

-- ── subject editing on (the default) ─────────────────────────────────────
select is(public.curriculum_can_edit_lesson('f2060000-0000-0000-0000-000000000001'), true, 'switch on: a maths teacher can edit a maths lesson');
select is(public.curriculum_can_edit_lesson('f2060000-0000-0000-0000-000000000002'), false, 'switch on: a maths teacher cannot edit a history lesson');
select throws_ok(
  $$select public.curriculum_save_lesson_content('f2060000-0000-0000-0000-000000000002', '{"unit":"U","title":"T","objectives":["o"],"teach":[{},{},{}]}', null, false, null)$$,
  '42501', null, 'switch on: the database refuses a maths teacher saving a history lesson'
);

-- ── the Headteacher switches it off ──────────────────────────────────────
set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000001"}';
select lives_ok($$update public.school_features set enabled = false where key = 'subject_lesson_editing'$$, 'the Headteacher can switch subject-only editing off');
select is((select updated_by from public.school_features where key = 'subject_lesson_editing'), 'e2060000-0000-0000-0000-000000000001'::uuid, 'the change is stamped with who made it');

set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000002"}';
select is(public.curriculum_can_edit_lesson('f2060000-0000-0000-0000-000000000002'), true, 'switch off: any teacher can edit any lesson');
select lives_ok(
  $$select public.curriculum_request_lesson_build('f2060000-0000-0000-0000-000000000002')$$,
  'switch off: the database lets a maths teacher rebuild a history lesson'
);

set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000003"}';
select is(public.curriculum_can_edit_lesson('f2060000-0000-0000-0000-000000000002'), false, 'switch off: a parent still cannot edit lessons');

-- ── revision packs: no automatic draft packs while off ──────────────────
set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000001"}';
select lives_ok($$select public.curriculum_set_signoff('mathematics-206', 'lesson', 'y7/1', 'approved', null)$$, 'the Headteacher signs off the only lesson in a unit');
select is((select count(*)::int from public.revision_units where subject_slug = 'mathematics-206'), 0, 'revision packs off: no draft pack is made');

-- Admin is treated as the Headteacher here.
set local "request.jwt.claims" to '{"sub": "e2060000-0000-0000-0000-000000000004"}';
update public.school_features set enabled = true where key = 'revision_packs';
select lives_ok($$select public.curriculum_set_signoff('history-206', 'lesson', 'y7/1', 'approved', null)$$, 'an Admin switches revision packs on and signs off a unit');
select is((select source from public.revision_units where subject_slug = 'history-206'), 'auto', 'revision packs on: the draft pack is made as before');

select * from finish();
rollback;
