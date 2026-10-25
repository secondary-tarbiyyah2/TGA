-- Cross-source audit (October 2026): portal vs Prospectus v5 vs website.
-- Brings the DB-held website content in line with the winners:
--   * subjects and exam boards: the portal (content/lessons + content/syllabus/ks4);
--   * dates and fees: Prospectus 2026-27 v5 (and the Fees Policy, which matches it).
-- Every statement only touches rows that still hold the old text/values, so an
-- admin's later edits in /learn/admin/content are never overwritten. Idempotent.

-- ── key_stage_pages ───────────────────────────────────────────────────────
-- The Year 1-2 page kept its old slug 'reception-year-2' in the database,
-- while public/.htaccess redirects /curriculum/reception-year-2/ to
-- /curriculum/year-1-2/ (the slug in src/content/curriculum.ts, nav and
-- homepage): with the DB row the build only emitted the old address, so the
-- redirect pointed at a page that did not exist.
update public.key_stage_pages set slug = 'year-1-2', updated_at = now()
where slug = 'reception-year-2'
  and not exists (select 1 from public.key_stage_pages where slug = 'year-1-2');
update public.curriculum_documents set key_stage = 'year-1-2' where key_stage = 'reception-year-2';

-- Key Stage 1: the portal teaches the full set of subjects in Years 1-2
-- (English with phonics, Mathematics, Science, History, Geography, Computing,
-- Art, PE, PSHE, Qur'an, Arabic, Islamic Studies), not "understanding the world".
update public.key_stage_pages set
  subjects = '["English, with systematic synthetic phonics and early reading", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "PE", "PSHE and RSE", "Qur''an and Tajweed", "Arabic", "Islamic Studies, including du''a and Islamic manners"]'::jsonb,
  weekly = '[{"subject": "English and phonics", "lessons": 5}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Science, history, geography and computing", "lessons": 1}, {"subject": "Qur''an and Tajweed", "lessons": 3}, {"subject": "Arabic and Islamic Studies", "lessons": 1}, {"subject": "PSHE, RSE, PE, art and wellbeing", "lessons": 1}]'::jsonb,
  intro = 'Short, engaging 30-minute live lessons across the full curriculum, with a strong focus on phonics, early reading and number, alongside Qur''an, du''a and Islamic manners. Much of the learning is practical and done away from the screen with a parent, following guidance sent home each week.',
  updated_at = now()
where slug = 'year-1-2' and subjects @> '["Understanding the world and science"]'::jsonb;

-- Key Stage 3: Qur'an is taught as Qur'an and Tajweed (as at KS2 and KS4).
update public.key_stage_pages set subjects = '["English", "Mathematics", "Science (biology, chemistry and physics)", "History", "Geography", "Computing", "Arabic", "Art and design", "PE and wellbeing", "PSHE and RSE", "Qur''an and Tajweed", "Islamic Studies"]'::jsonb, updated_at = now()
where slug = 'year-7-9' and subjects @> '["Qur''an"]'::jsonb;

-- Key Stage 4: the portal's GCSE set. History is not offered at KS4; options
-- are Geography, Computer Science, Business and Arabic; boards as in
-- content/syllabus/ks4. PE and PSHE are taught in Years 10-11 too.
update public.key_stage_pages set subjects = '["English Language (GCSE, AQA)", "English Literature (International GCSE, Pearson Edexcel)", "Mathematics (GCSE, Pearson Edexcel)", "Combined (Double Award) or separate sciences: Biology, Chemistry and Physics (International GCSE, Pearson Edexcel)", "Islamic Studies (International GCSE, Pearson Edexcel)", "Two options from Geography (GCSE, AQA), Computer Science (GCSE, Pearson Edexcel), Business (International GCSE, Pearson Edexcel) and Arabic (GCSE, Pearson Edexcel)", "Qur''an and Tajweed", "PE and wellbeing", "PSHE and RSE"]'::jsonb, note = 'Years 10 and 11 follow the full live timetable, because GCSE courses need it. History is not offered at GCSE.', updated_at = now()
where slug = 'year-10-11' and subjects @> '["Two options, for example history, geography, computer science, business or Arabic"]'::jsonb;

-- ── fees (Prospectus v5 p.18 / Fees Policy 25) ────────────────────────────
-- The stored bands still held the old January-July figures and the Reception
-- label; the site has shown the v5 figures only from the build-time seed.
update public.fee_bands set year_group_range = 'Year 1 – Year 2', annual_fee = 1710, termly_fee = null, monthly_fee = null
  where year_group_range in ('Reception – Year 2', 'Year 1 – Year 2') and annual_fee = 1596;
update public.fee_bands set annual_fee = 2282, termly_fee = null, monthly_fee = null where year_group_range = 'Year 3 – Year 6' and annual_fee = 2130;
update public.fee_bands set annual_fee = 2996, termly_fee = null, monthly_fee = null where year_group_range = 'Year 7 – Year 9' and annual_fee = 2796;
update public.fee_bands set annual_fee = 3214, termly_fee = null, monthly_fee = null where year_group_range = 'Year 10 – Year 11' and annual_fee = 3000;
update public.fee_bands set year_group_range = 'Year 1 – Year 2' where year_group_range = 'Reception – Year 2';

-- Eight monthly payments (4 December, then the 28th of each month from
-- 28 December to 28 June), not seven; payment dates from 4 December, not 19.
update public.site_settings set fee_instalments = 8 where id = true and fee_instalments = 7;
update public.site_settings set payment_schedule_text = 'Termly payments are due on 4 December 2026 and 28 March 2027. The first monthly payment is due on 4 December 2026, then payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 4 December 2026.'
  where id = true and payment_schedule_text like '%19 December 2026%';
alter table public.site_settings
  alter column fee_instalments set default 8,
  alter column payment_schedule_text set default 'Termly payments are due on 4 December 2026 and 28 March 2027. The first monthly payment is due on 4 December 2026, then payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 4 December 2026.',
  alter column application_fee set default 50,
  alter column registration_fee set default 250;
update public.site_settings set contact_phone = '020 3719 8697' where id = true and coalesce(contact_phone, '') = '';

-- ── FAQs ───────────────────────────────────────────────────────────────────
-- Late applications: v5 p.17 and the term dates say they are considered while places remain (not deferred to January).
update public.faq_entries set answer = 'Live lessons start on Monday 7 December 2026. Applications for a December start close on Friday 27 November 2026, and every new pupil joins an online induction week from 30 November to 4 December, so they know their teachers, their timetable and the portal before the first lesson. Applications received after the deadline are welcome and are considered while places remain.'
where question = 'When do live lessons start, and what is the deadline to apply?' and answer like '%considered for a January start%';

-- Year 11 pupils are 15 on 31 August 2026 (born Sep 2010 - Aug 2011), not 16.
update public.faq_entries set answer = 'Year 1 to Year 11 (children aged 5 to 15 on 31 August 2026). We do not run Reception. Year group is set by age in the normal English way; if you are not sure which year your child falls into, the application works it out from their date of birth.'
where question = 'Which year groups can apply?' and answer like '%ages 5 to 16 on 31 August 2026%';

-- The registration fee is refundable within the 14-day cancellation period (v5 p.18, Fees Policy s.17).
update public.faq_entries set answer = 'The application fee is {{applicationFee}}, is not refundable, and pays for the entry assessment and the time we spend with each family. The registration fee is {{registrationFee}} for the first child and half that for each additional sibling, paid once when you accept a place; it secures the place and covers your child''s accounts, platform licences and onboarding. The registration fee is refunded only if you cancel within the 14-day cancellation period after accepting.'
where question = 'What are the application and registration fees, and why?' and answer like '%Neither is refundable%';

-- Sibling discount applies to the younger sibling's tuition and combines with the annual discount (v5 p.18).
update public.faq_entries set answer = 'Yes: 5% off tuition for a second child and 10% off for a third or further child, applied to the younger sibling''s tuition, and it can be combined with the annual-payment discount. The registration fee for each additional sibling is also halved.'
where question = 'Is there a sibling discount?' and answer like '%applied automatically to the lower fees%';

-- Boards and options from the portal (content/syllabus/ks4): Maths is Edexcel GCSE 1MA1, English Literature is Edexcel International GCSE 4ET1; Geography (AQA) and Computer Science (Edexcel) are options too.
update public.faq_entries set answer = 'Core: English Language (AQA GCSE); English Literature (Pearson Edexcel International GCSE); Mathematics (Pearson Edexcel GCSE); Science, as Double Award or separate Biology, Chemistry and Physics (Pearson Edexcel International GCSE); and Islamic Studies (Pearson Edexcel International GCSE). Pupils also choose two options from Arabic (Pearson Edexcel GCSE), Business (Pearson Edexcel International GCSE), Computer Science (Pearson Edexcel GCSE) and Geography (AQA GCSE). History is not offered at GCSE. Pupils sit their exams as private candidates at an approved centre near home, and we guide you through registering.'
where question = 'Which GCSEs do you offer, and with which exam boards?' and answer like '%board confirmed at course start%';

-- Arabic is a GCSE option, not compulsory at GCSE.
update public.faq_entries set answer = 'Yes. Arabic is taught as a language from Year 1, with reading, writing, speaking and grammar, so pupils connect with the Qur''an and classical texts directly. In Years 10 and 11 it can be taken as a GCSE option (Pearson Edexcel).'
where question = 'Will my child learn Arabic properly?' and answer like '%it leads to GCSE Arabic in Years 10 and 11%';

-- ── term dates ─────────────────────────────────────────────────────────────
-- Unconfirmed placeholder from the original one-off seed (January 2027 launch).
delete from public.site_term_dates
where label = 'Spring Term begins (launch)' and date = '2027-01-06' and confirmed = false;

-- ── eligibility quiz copy ─────────────────────────────────────────────────
-- Lead with the specialist, faith-rooted offer rather than "British".
update public.quiz_config_versions
set content = replace(content::text, 'full British curriculum', 'full national curriculum')::jsonb
where content::text like '%full British curriculum%';
