-- Portal guide (owner, Nov 2026: "the tour needs to be detailed and explain
-- everything A to Z"). Each person's progress through the guide: the pages
-- they have learned (opened with Guide me, or finished its Show me), the last
-- page they read, and how far each "Day in the life" journey has got. Stored
-- on the same own-row-only table as 0200 and 0202 (portal_prefs); its policy
-- already limits every read and write to the person's own row. Page addresses
-- and step numbers only: no personal data.

alter table public.portal_prefs
  add column if not exists guide_progress jsonb not null default '{}'::jsonb;

alter table public.portal_prefs
  drop constraint if exists portal_prefs_guide_small;
alter table public.portal_prefs
  add constraint portal_prefs_guide_small check (
    jsonb_typeof(guide_progress) = 'object' and pg_column_size(guide_progress) <= 32768
  );
