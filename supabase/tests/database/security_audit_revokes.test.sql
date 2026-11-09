-- Run via `supabase test db`. Covers 0188 (Tafweed T20 security audit):
-- resync_lesson_teachers can no longer be called by visitors or signed-in
-- users, while the class_subject_teachers trigger that uses it still works.
begin;
select plan(4);

select ok(not has_function_privilege('anon', 'public.resync_lesson_teachers(uuid, uuid)', 'execute'),
  'anon cannot call resync_lesson_teachers');
select ok(not has_function_privilege('authenticated', 'public.resync_lesson_teachers(uuid, uuid)', 'execute'),
  'signed-in users cannot call resync_lesson_teachers');

set local role anon;
select throws_ok($$select public.resync_lesson_teachers(gen_random_uuid(), gen_random_uuid())$$, '42501', null,
  'a direct call as anon is refused');
reset role;

-- The trigger path (runs as the function owner) still works.
select ok(has_function_privilege('postgres', 'public.resync_lesson_teachers(uuid, uuid)', 'execute'),
  'the database owner (and so the trigger) can still run it');

select * from finish();
rollback;
