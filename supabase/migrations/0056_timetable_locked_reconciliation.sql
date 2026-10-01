-- Timetable reconciliation support.
--
-- 1. timetable_slots.locked: a lesson placed or moved by hand is flagged
--    locked. "Re-run keeping locked lessons" copies locked slots into a new
--    draft as FIXED inputs; the solver places everything else around them.
-- 2. timetable_conflicts.kind / details: machine-readable reconciliation
--    report rows (teacher overbooked, class cannot be filled, unplaced
--    lessons, self-check violations). `message` stays the plain-language
--    text the UI shows; `details` carries numbers for the report panel.
--
-- Additive only: existing rows and policies are untouched, and the solver
-- and UI both fall back gracefully if this has not been applied yet.

alter table public.timetable_slots
  add column if not exists locked boolean not null default false;

alter table public.timetable_conflicts
  add column if not exists kind text,
  add column if not exists details jsonb;

create index if not exists timetable_slots_run_locked_idx
  on public.timetable_slots (run_id) where locked;
