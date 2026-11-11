-- Exam courses follow Tarbiyyah Secondary School (owner, 11 Nov 2026: "let it prioritise what's on ISS1").
-- The school's Curriculum Booklet 2026-27 on the ISS1 SharePoint names AQA GCSE English Language,
-- Pearson Edexcel GCSE English Literature, AQA GCSE Geography and three separate International GCSE
-- sciences; Computer Science is not offered. Brings the DB-held website copy in line with
-- src/content/curriculum.ts and src/content/seed.ts. Every statement only touches rows that still hold
-- the previous text, so an admin's later edits in /learn/admin/content are never overwritten. Idempotent.
-- Numbered after 0215 (Tarbiyyah Secondary is not an exam centre): the courses follow Tarbiyyah
-- Secondary, but pupils sit their exams as private candidates at a centre near them.

-- ── key_stage_pages: Key Stage 4 ─────────────────────────────────────────
update public.key_stage_pages set
  subjects = '["English Language (GCSE, AQA 8700)", "English Literature (GCSE, Pearson Edexcel 1ET0)", "Mathematics (International GCSE 4MA1, taught from the Pearson Edexcel GCSE course)", "Biology, Chemistry and Physics (three separate International GCSEs: 4BI1, 4CH1 and 4PH1)", "Islamic Studies (International GCSE 4IS1)", "Two options from Geography (GCSE, AQA 8035), Business (International GCSE 4BS1) and Arabic (taught from the Pearson Edexcel GCSE course)", "Qur''an and Tajweed", "PSHE"]'::jsonb,
  updated_at = now()
where slug = 'year-10-11' and subjects::text like '%4EB1%';

update public.key_stage_pages set title = 'Key Stage 4 (GCSE and International GCSE)', updated_at = now()
where slug = 'year-10-11' and title = 'Key Stage 4 (International GCSE)';

update public.key_stage_pages set intro = 'Live lessons in every subject, leading to the same GCSE and International GCSE courses as Tarbiyyah Secondary School, our partner school.', updated_at = now()
where slug = 'year-10-11' and intro like 'Live lessons in every subject, leading to Pearson Edexcel International GCSEs.%';

update public.key_stage_pages set note = 'Years 10 and 11 follow the full live timetable, because GCSE courses need it. Pupils take the same exam courses as Tarbiyyah Secondary School: AQA GCSE English Language and Geography, Pearson Edexcel GCSE English Literature, and Pearson Edexcel International GCSEs in the other subjects. History is not offered at GCSE.', updated_at = now()
where slug = 'year-10-11' and note like '%Every pupil sits Pearson Edexcel International GCSEs.%';

update public.key_stage_pages set weekly = replace(weekly::text, '"Two International GCSE options"', '"Two GCSE options"')::jsonb, updated_at = now()
where slug = 'year-10-11' and weekly::text like '%"Two International GCSE options"%';

-- ── key_stage_pages: Key Stage 3 (the booklet's subject is ICT) ───────────
update public.key_stage_pages set subjects = replace(subjects::text, '"Computing"', '"ICT and computing"')::jsonb, updated_at = now()
where slug = 'year-7-9' and subjects::text like '%"Computing"%';

update public.key_stage_pages set weekly = replace(weekly::text, '"History, geography and computing"', '"History, geography and ICT"')::jsonb, updated_at = now()
where slug = 'year-7-9' and weekly::text like '%"History, geography and computing"%';

-- ── FAQs ───────────────────────────────────────────────────────────────────
update public.faq_entries set answer = 'The same courses and exam boards as Tarbiyyah Secondary School, our partner school. Pupils sit them as private candidates: you register your child at an approved centre near you, in the UK or abroad, and pay the centre''s entry fees directly. We help for free with a list of centres that accept private candidates, the entry deadlines and timetable, and the entry code for each subject. Core: English Language (AQA GCSE), English Literature (Pearson Edexcel GCSE), Mathematics, Biology, Chemistry and Physics (three separate Pearson Edexcel International GCSEs) and Islamic Studies (Pearson Edexcel International GCSE). Two options from Arabic, Business and Geography (AQA GCSE). History is not offered at GCSE.'
where question = 'Which GCSEs do you offer, and with which exam boards?' and (answer like '%4EB1%' or answer like 'Pearson Edexcel International GCSEs.%');

update public.faq_entries set answer = replace(answer, 'International GCSE exam entry fees', 'GCSE and International GCSE exam entry fees')
where question = 'What is not included in the fees?' and answer like '%International GCSE exam entry fees%' and answer not like '%GCSE and International GCSE exam entry fees%';

update public.faq_entries set answer = 'Yes. Arabic is taught as a language from Year 1, with reading, writing, speaking and grammar, so pupils connect with the Qur''an and classical texts directly. In Years 10 and 11 it is a GCSE option, taught from the same Pearson Edexcel course as Tarbiyyah Secondary School.'
where question = 'Will my child learn Arabic properly?' and (answer like '%4AA1%' or answer like '%International GCSE option (Arabic as a first language)%');

-- ── fee bands and policy summary ──────────────────────────────────────────
update public.fee_bands set notes = 'GCSE and International GCSE exam entry fees are billed separately by the exam centre.'
where year_group_range = 'Year 10 – Year 11' and notes = 'International GCSE exam entry fees are billed separately by the exam centre.';

update public.policy_links set summary = 'How GCSE and International GCSE entries work for an online school.'
where summary = 'How International GCSE entries work for an online school.';
