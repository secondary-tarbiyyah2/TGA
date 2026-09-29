-- Seeds year_groups and subjects from the school's own already-published
-- curriculum content (src/content/curriculum.ts's keyStages — the exact
-- same subject lists shown on the public /curriculum page), so the LMS's
-- reference data matches the one source of truth already stated publicly
-- rather than staying empty (ground rule 2: no fabricated facts — this is
-- NOT new information, it's transcribing what's already published).
--
-- Per-key-stage subject names varied slightly in the marketing copy
-- ("English (phonics & reading)" at KS1, "English Language & Literature"
-- at KS4) — subjects.name is unique school-wide, so this normalises to one
-- canonical name per real subject rather than fabricating separate ones.
-- is_core marks English/Mathematics/Science true, the standard National
-- Curriculum core subjects (not TGA-specific, a well-established fact),
-- feeding the solver's existing "core subjects earlier" soft constraint.
--
-- Both tables have exactly the real subjects/year-groups the school has
-- already told the public about — nothing invented, nothing test-only, so
-- is_test stays false (its default). This does NOT create any class,
-- teacher assignment, or timetable slot — those need real staffing data
-- this migration has no basis to invent (see SETUP.md).
insert into public.year_groups (name, sort_order) values
  ('Reception', 0),
  ('Year 1', 1),
  ('Year 2', 2),
  ('Year 3', 3),
  ('Year 4', 4),
  ('Year 5', 5),
  ('Year 6', 6),
  ('Year 7', 7),
  ('Year 8', 8),
  ('Year 9', 9),
  ('Year 10', 10),
  ('Year 11', 11)
on conflict (name) do nothing;

insert into public.subjects (name, is_core) values
  ('English', true),
  ('Mathematics', true),
  ('Science', true),
  ('Islamic Studies', false),
  ('Qur''an & Hifz', false),
  ('Arabic', false),
  ('Humanities', false),
  ('PE & Wellbeing', false),
  ('Computing', false),
  ('PSHE & Creative Time', false),
  ('Options subjects', false)
on conflict (name) do nothing;
