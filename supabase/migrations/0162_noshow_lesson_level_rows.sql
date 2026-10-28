-- ── noshow_alerts: a row per LESSON as well as per child ──────────────────
-- The no-show check now records a lesson where nobody at all joined (teacher
-- included) as one row with child_id null, instead of alerting every family,
-- and tells the office. A unique index on lesson_instance_id alone for those
-- rows keeps that to one email per lesson across repeated runs (the
-- (lesson, child) unique constraint treats nulls as distinct).
alter table public.noshow_alerts alter column child_id drop not null;

create unique index if not exists noshow_alerts_lesson_level_uq
  on public.noshow_alerts (lesson_instance_id)
  where child_id is null;

-- The 3-in-14-days safeguarding count and the parent-facing views must not
-- count these lesson-level rows: they already filter by child_id = <child>,
-- so a null child never matches. Nothing else to change.
