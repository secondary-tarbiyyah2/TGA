-- Exam entry (October 2026): "GCSEs can be taught but pupils take the International GCSE version",
-- and History is not offered at KS4. The portal (content/syllabus/ks4/*.json, examEntry) is the
-- source: every pupil sits Pearson Edexcel International GCSEs; English Language, Mathematics,
-- Computer Science, Geography and Arabic are taught from the UK GCSE specification and sat as
-- 4EB1, 4MA1, 4CP0, 4GE1 and 4AA1. Brings the DB-held website copy in line with
-- src/content/curriculum.ts and src/content/seed.ts.
-- Every statement only touches rows that still hold the old text (0105/0113/0135 seeds), so an
-- admin's later edits in /learn/admin/content are never overwritten. Idempotent.

-- ── key_stage_pages: Key Stage 4 ─────────────────────────────────────────
update public.key_stage_pages set
  subjects = '["English Language (International GCSE 4EB1, taught from the AQA GCSE course)", "English Literature (International GCSE 4ET1)", "Mathematics (International GCSE 4MA1, taught from the Pearson Edexcel GCSE course)", "Combined (Double Award 4SD0) or separate sciences: Biology 4BI1, Chemistry 4CH1 and Physics 4PH1 (International GCSE)", "Islamic Studies (International GCSE 4IS1)", "Two options from Geography (International GCSE 4GE1, taught from the AQA GCSE course), Computer Science (International GCSE 4CP0, taught from the Pearson Edexcel GCSE course), Business (International GCSE 4BS1) and Arabic (International GCSE Arabic as a first language 4AA1, taught from the Pearson Edexcel GCSE course)", "Qur''an and Tajweed", "PE and wellbeing", "PSHE and RSE"]'::jsonb,
  updated_at = now()
where slug = 'year-10-11' and subjects @> '["English Language (GCSE, AQA)", "Mathematics (GCSE, Pearson Edexcel)"]'::jsonb;

update public.key_stage_pages set title = 'Key Stage 4 (International GCSE)', updated_at = now()
where slug = 'year-10-11' and title = 'Key Stage 4 (GCSE)';

update public.key_stage_pages set intro = 'Live lessons in every subject, leading to Pearson Edexcel International GCSEs. Subjects are chosen so they suit online learners sitting exams as private candidates, for example without coursework that a centre must supervise.', updated_at = now()
where slug = 'year-10-11' and intro like 'Live GCSE and International GCSE lessons in every subject.%';

update public.key_stage_pages set note = 'Years 10 and 11 follow the full live timetable, because International GCSE courses need it. Every pupil sits Pearson Edexcel International GCSEs. History is not offered at GCSE.', updated_at = now()
where slug = 'year-10-11' and note in (
  'Years 10 and 11 follow the full live timetable, because GCSE courses need it. History is not offered at GCSE.',
  'Years 10 and 11 follow the full live timetable, because GCSE courses need it.'
);

update public.key_stage_pages set weekly = replace(weekly::text, '"Two GCSE options"', '"Two International GCSE options"')::jsonb, updated_at = now()
where slug = 'year-10-11' and weekly::text like '%"Two GCSE options"%';

-- ── FAQs ───────────────────────────────────────────────────────────────────
update public.faq_entries set answer = 'Every pupil sits Pearson Edexcel International GCSEs. Core: English Language (4EB1); English Literature (4ET1); Mathematics (4MA1); Science, as Double Award (4SD0) or separate Biology, Chemistry and Physics (4BI1, 4CH1, 4PH1); and Islamic Studies (4IS1). Pupils also choose two options from Arabic (Arabic as a first language, 4AA1), Business (4BS1), Computer Science (4CP0) and Geography (4GE1). In English Language, Mathematics, Computer Science, Geography and Arabic we teach the UK GCSE course (AQA or Pearson Edexcel) and add what the International GCSE exam needs. History is not offered at GCSE. Pupils sit their exams as private candidates at an approved centre near home, and we guide you through registering.'
where question = 'Which GCSEs do you offer, and with which exam boards?' and answer like '%Mathematics (Pearson Edexcel GCSE)%';

update public.faq_entries set answer = 'International GCSE exam entry fees, which are paid directly to the exam centre; any printed textbooks or stationery you choose to buy; and your own device and internet connection.'
where question = 'What is not included in the fees?' and answer like 'GCSE and International GCSE exam entry fees%';

update public.faq_entries set answer = 'Yes. Arabic is taught as a language from Year 1, with reading, writing, speaking and grammar, so pupils connect with the Qur''an and classical texts directly. In Years 10 and 11 it can be taken as an option, taught from the Pearson Edexcel GCSE course and sat as the Pearson Edexcel International GCSE in Arabic as a first language (4AA1).'
where question = 'Will my child learn Arabic properly?' and answer like '%it can be taken as a GCSE option (Pearson Edexcel).';

-- ── fee bands ─────────────────────────────────────────────────────────────
update public.fee_bands set notes = 'International GCSE exam entry fees are billed separately by the exam centre.'
where year_group_range = 'Year 10 – Year 11' and notes = 'GCSE exam entry fees are billed separately by the exam centre.';

-- Examinations policy summary: pupils sit International GCSEs.
update public.policy_links
   set summary = 'How International GCSE entries work for an online school.'
 where summary = 'How GCSE and International GCSE entries work for an online school.';
