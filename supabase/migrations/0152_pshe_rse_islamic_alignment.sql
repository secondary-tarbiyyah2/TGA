-- PSHE and RSE in line with the Academy's Islamic ethos (owner decision, October 2026).
--   * Years 1-6 (KS1 and KS2): no RSE or sex education. The subject is "PSHE"
--     (adab, friendships and family, health and hygiene, keeping safe, including
--     body safety at a non-sexual level).
--   * Years 7-11 (KS3 and KS4): "PSHE and RSE (Islamic perspective)", taught to
--     boys and girls separately; parents can see all RSE materials.
-- Matches src/content/curriculum.ts, src/content/seed.ts, scripts/policies.json
-- and the lesson library (content/lessons/pshe). Every statement only touches
-- rows that still hold the old text, so an admin's later edits in
-- /learn/admin/content are never overwritten. Idempotent.

-- ── key_stage_pages: subject lists ────────────────────────────────────────
-- (The Year 1-2 page may still have its old slug if 0135 has not run.)
update public.key_stage_pages
set subjects = replace(subjects::text, '"PSHE and RSE"', '"PSHE"')::jsonb, updated_at = now()
where slug in ('year-1-2', 'reception-year-2', 'year-3-6') and subjects::text like '%"PSHE and RSE"%';

update public.key_stage_pages
set subjects = replace(subjects::text, '"PSHE and RSE"', '"PSHE and RSE (Islamic perspective)"')::jsonb, updated_at = now()
where slug in ('year-7-9', 'year-10-11') and subjects::text like '%"PSHE and RSE"%';

-- ── key_stage_pages: live lessons a week ──────────────────────────────────
update public.key_stage_pages
set weekly = replace(weekly::text, '"PSHE, RSE, PE, art and wellbeing"', '"PSHE, PE, art and wellbeing"')::jsonb, updated_at = now()
where slug in ('year-1-2', 'reception-year-2', 'year-3-6') and weekly::text like '%"PSHE, RSE, PE, art and wellbeing"%';

update public.key_stage_pages
set weekly = replace(weekly::text, '"PSHE, RSE, PE, art and wellbeing"', '"PSHE and RSE (Islamic perspective), PE, art and wellbeing"')::jsonb, updated_at = now()
where slug = 'year-7-9' and weekly::text like '%"PSHE, RSE, PE, art and wellbeing"%';

update public.key_stage_pages
set weekly = replace(weekly::text, '"PSHE, RSE, PE and wellbeing"', '"PSHE and RSE (Islamic perspective), PE and wellbeing"')::jsonb, updated_at = now()
where slug = 'year-10-11' and weekly::text like '%"PSHE, RSE, PE and wellbeing"%';

-- ── Lesson library: subject name on uploaded PSHE lessons ─────────────────
-- (upload-decks keeps wording current for unedited rows; this covers rows a
-- teacher has edited, which upload-decks never touches.)
update public.curriculum_lessons set subject = 'PSHE'
where subject_slug = 'pshe' and subject = 'PSHE & RSE' and year in ('y1', 'y2', 'y3', 'y4', 'y5', 'y6');

update public.curriculum_lessons set subject = 'PSHE and RSE (Islamic perspective)'
where subject_slug = 'pshe' and subject = 'PSHE & RSE' and year in ('y7', 'y8', 'y9', 'y10', 'y11');

-- ── FAQ: what is taught, and when ─────────────────────────────────────────
insert into public.faq_entries (category, order_index, question, answer)
select 'Islamic Studies', 5, 'Do you teach relationships and sex education (RSE)?',
       'Not to young children. In Years 1 to 6 the subject is PSHE only: good manners, friendships and family, health and hygiene, and keeping safe, including age-appropriate body safety, with no sex education. From Year 7, RSE is taught from an Islamic perspective, to boys and girls separately: marriage and family in Islam, modesty, puberty and its fiqh, consent and the law, and staying safe online. Parents can see all RSE materials on the Parent Portal, and the details are in our Relationships, Sex and Health Education Policy.'
where not exists (select 1 from public.faq_entries where question = 'Do you teach relationships and sex education (RSE)?');

-- ── Policies page: one-line summary for the RSHE Policy ───────────────────
update public.policy_links
set summary = 'PSHE only in Years 1 to 6; RSE from Year 7, taught from an Islamic perspective.'
where number = '17' and title like 'Relationships, Sex and Health Education%' and coalesce(summary, '') = '';
