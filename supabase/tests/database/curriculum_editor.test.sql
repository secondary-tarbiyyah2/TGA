-- Run via `supabase test db`. Covers 0179: staff read the curriculum planner; teachers edit
-- units (stamped with their name, history kept); cover assistants and parents cannot edit;
-- the lesson editor's save RPC refuses stale saves and non-teachers; an uploaded deck is
-- marked as the teacher's own.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('a1790000-0000-0000-0000-000000000001', 'teacher-179@example.com'),
  ('a1790000-0000-0000-0000-000000000002', 'cover-179@example.com'),
  ('a1790000-0000-0000-0000-000000000003', 'parent-179@example.com');
insert into public.profiles (id, role, full_name, email) values
  ('a1790000-0000-0000-0000-000000000001', 'teacher', 'Teacher 179', 'teacher-179@example.com'),
  ('a1790000-0000-0000-0000-000000000002', 'teacher', 'Cover 179', 'cover-179@example.com'),
  ('a1790000-0000-0000-0000-000000000003', 'parent', 'Parent 179', 'parent-179@example.com');
insert into public.user_roles (user_id, role, scope_type, scope_id) values
  ('a1790000-0000-0000-0000-000000000001', 'teacher', 'none', null),
  ('a1790000-0000-0000-0000-000000000002', 'teaching_assistant_cover', 'none', null),
  ('a1790000-0000-0000-0000-000000000003', 'parent', 'none', null);

insert into public.curriculum_units (id, subject_slug, subject, kind, year, half_term, position, title, focus, updated_by_name)
values ('b1790000-0000-0000-0000-000000000001', 'english', 'English', 'syllabus', 'y1', 'autumn1', 0, 'Autumn 1: Woods', '{Phonics}', 'the repository (content/)');
insert into public.curriculum_lessons (id, subject_slug, subject, year, lesson_no, title, content, content_updated_at)
values ('c1790000-0000-0000-0000-000000000001', 'english', 'English', 'y1', 1, 'Old title',
        '{"unit":"Unit 1","n":1,"title":"Old title","objectives":["o"],"teach":[{"heading":"a","bullets":["b"]},{"heading":"c","bullets":["d"]},{"heading":"e","bullets":["f"]}]}',
        '2026-11-01T00:00:00Z');

set local role authenticated;

-- A teacher
set local "request.jwt.claims" to '{"sub": "a1790000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.curriculum_units where subject_slug = 'english'), 1, 'a teacher can read the planner');
select lives_ok($$update public.curriculum_units set title = 'Autumn 1: The Woods', weeks = '[{"week":1,"lessons":["Read"],"vocabulary":[],"home":""}]' where id = 'b1790000-0000-0000-0000-000000000001'$$, 'a teacher can edit a unit');
select is((select updated_by_name from public.curriculum_units where id = 'b1790000-0000-0000-0000-000000000001'), 'Teacher 179', 'the edit is stamped with the teacher''s name');
select is((select count(*)::int from public.curriculum_unit_versions where unit_id = 'b1790000-0000-0000-0000-000000000001' and snapshot ->> 'title' = 'Autumn 1: Woods'), 1, 'the previous version is kept');
select lives_ok($$insert into public.curriculum_units (subject_slug, subject, kind, year, title, focus) values ('english', 'English', 'syllabus', 'y1', 'New unit', '{x}')$$, 'a teacher can add a unit');
select lives_ok($$select public.curriculum_save_lesson_content('c1790000-0000-0000-0000-000000000001', '{"unit":"Unit 1","n":7,"title":"New title","objectives":["o"],"teach":[{"heading":"a","bullets":["b"]},{"heading":"c","bullets":["d"]},{"heading":"e","bullets":["f"]}]}', 'Retitled', false, '2026-11-01T00:00:00Z')$$, 'a teacher can save a lesson');
select is((select title || '|' || (content ->> 'n') || '|' || rebuild_requested::text from public.curriculum_lessons where id = 'c1790000-0000-0000-0000-000000000001'), 'New title|1|true', 'the save updates the title, keeps the lesson number and asks for new slides');
select throws_ok($$select public.curriculum_save_lesson_content('c1790000-0000-0000-0000-000000000001', '{"unit":"Unit 1","title":"Again","objectives":["o"],"teach":[{},{},{}]}', null, false, '2026-11-01T00:00:00Z')$$, '40001', null, 'a save over someone else''s newer save is refused');
select throws_ok($$select public.curriculum_save_lesson_content('c1790000-0000-0000-0000-000000000001', '{"unit":"Unit 1","title":"Short","objectives":["o"],"teach":[{}]}', null, false, null)$$, '22023', null, 'a lesson with too few slides is refused');
select lives_ok($$select public.curriculum_replace_deck('c1790000-0000-0000-0000-000000000001', 'english/y1/1/own.pptx', null, 'mine')$$, 'a teacher can upload their own deck');
select is((select custom_deck from public.curriculum_lessons where id = 'c1790000-0000-0000-0000-000000000001'), true, 'an uploaded deck is kept as the teacher''s own');

-- A cover teaching assistant reads but cannot change anything
set local "request.jwt.claims" to '{"sub": "a1790000-0000-0000-0000-000000000002"}';
update public.curriculum_units set title = 'Changed by cover' where id = 'b1790000-0000-0000-0000-000000000001';
select is((select title from public.curriculum_units where id = 'b1790000-0000-0000-0000-000000000001'), 'Autumn 1: The Woods', 'a cover assistant cannot edit a unit');

-- A parent sees nothing and can save nothing
set local "request.jwt.claims" to '{"sub": "a1790000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.curriculum_units), 0, 'a parent cannot read the planner');
select throws_ok($$select public.curriculum_save_lesson_content('c1790000-0000-0000-0000-000000000001', '{"unit":"U","title":"T","objectives":["o"],"teach":[{},{},{}]}', null, false, null)$$, '42501', null, 'a parent cannot edit a lesson');

select * from finish();
rollback;
