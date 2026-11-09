-- Security audit, November 2026 (Tafweed T20, docs/security-audit-2026-11.md).
--
-- resync_lesson_teachers(class, subject) is SECURITY DEFINER and rewrites
-- teacher_user_id on future lesson_instances. It is only meant to run from
-- the class_subject_teachers trigger (class_subject_teachers_resync, itself
-- SECURITY DEFINER, so it keeps working), but Postgres gives EXECUTE to
-- PUBLIC by default, so anyone on the web (anon) could call it through the
-- API. It only re-applies the current mapping, so nothing could be changed
-- to a wrong value, but nobody outside the database needs to call it.
-- Idempotent: safe to re-run.

revoke all on function public.resync_lesson_teachers(uuid, uuid) from public, anon, authenticated;
