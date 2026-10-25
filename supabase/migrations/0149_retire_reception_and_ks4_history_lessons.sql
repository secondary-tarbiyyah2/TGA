-- Owner's decision (25 October 2026): the Academy runs Year 1 to Year 11
-- only, and History is not taught in Years 10-11 (no GCSE History).
-- The lesson files (content/lessons/*/reception.json, history/y10.json and
-- y11.json) are deleted from the repo; this removes what was already loaded
-- into the portal from them, and stops either coming back.
--
-- Lesson library (0091): the lesson rows and their saved versions (cascade).
-- The deck/PDF files in storage are left in place but are no longer listed.
delete from public.curriculum_lessons
where year = 'reception'
   or (subject_slug = 'history' and year in ('y10', 'y11'));

-- Unit revision (0094): revision units for the same years/subject (their
-- questions and results cascade; there are no pupils yet).
delete from public.revision_units
where year = 'reception'
   or (subject_slug = 'history' and year in ('y10', 'y11'));

-- Guard rails: neither can be loaded again by the deck/revision builders.
alter table public.curriculum_lessons drop constraint if exists curriculum_lessons_taught_years;
alter table public.curriculum_lessons add constraint curriculum_lessons_taught_years
  check (year <> 'reception' and not (subject_slug = 'history' and year in ('y10', 'y11')));

alter table public.revision_units drop constraint if exists revision_units_taught_years;
alter table public.revision_units add constraint revision_units_taught_years
  check (year <> 'reception' and not (subject_slug = 'history' and year in ('y10', 'y11')));
