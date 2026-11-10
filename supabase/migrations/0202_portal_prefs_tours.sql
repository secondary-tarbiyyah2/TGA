-- Guided tour (T38): remember which tours and page tips each person has
-- finished or skipped, so the first-sign-in tour shows once and not again on
-- another device. Same own-row-only table as 0200 (portal_prefs); its policy
-- already limits every read and write to the person's own row.

alter table public.portal_prefs
  add column if not exists tours_seen text[] not null default '{}';

alter table public.portal_prefs
  drop constraint if exists portal_prefs_tours_small;
alter table public.portal_prefs
  add constraint portal_prefs_tours_small check (cardinality(tours_seen) <= 40);
