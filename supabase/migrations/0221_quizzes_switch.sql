-- School features: a "Quizzes" switch, OFF by default.
-- Owner, 11 November 2026, 22:44: "for now, lock up the quiz builder feature".
--
-- Off: no Quiz under Create in Classwork, the quiz builder shows "Quizzes are switched off by
-- the head teacher", no AI "Draft questions from a unit" (also refused in the ai-assist
-- function), and pupils and families see no quizzes. Quizzes already made (homework rows of
-- kind 'quiz', their questions and attempts, migration 0206) are left exactly as they are.
-- The Headteacher turns it on in Settings, School features.
--
-- 0219 and 0220 are taken by open pull requests (#217, #213), so this is 0221.
-- No RLS change: the existing school_features policies cover the new row.
-- Idempotent: safe to run again.

alter table public.school_features drop constraint if exists school_features_key_check;
alter table public.school_features
  add constraint school_features_key_check
  check (key in ('revision_packs', 'subject_lesson_editing', 'ai_helpers', 'house_points', 'guide_journeys', 'lesson_feedback', 'quizzes'));

insert into public.school_features (key, enabled) values ('quizzes', false)
on conflict (key) do nothing;

-- A missing row reads as its default: revision packs and quizzes are off, the rest on.
create or replace function public.school_feature_on(p_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select f.enabled from public.school_features f where f.key = p_key),
    p_key not in ('revision_packs', 'quizzes')
  );
$$;

revoke all on function public.school_feature_on(text) from public, anon;
grant execute on function public.school_feature_on(text) to authenticated, service_role;
