-- PSHE only, PE at home, and a weekly lesson count that fits the school day
-- (owner decision, 26 October 2026).
--   * Every year group has "PSHE" (no RSE, and "wellbeing" is no longer a
--     subject name). Puberty and bulugh are taught from Year 7 to boys and
--     girls separately.
--   * PE is a home-based activity programme ("PE at home"), sharing one live
--     lesson a week with art in Years 3-9 and set as guided activities in
--     Years 1-2. Years 10-11 have no timetabled PE.
--   * The school day (0150) has lessons 1-3 Monday to Friday and lessons 4-5
--     Monday to Thursday: 23 slots a week. Years 7-11 were advertised at 25
--     live lessons, which cannot fit; they are now 23.
-- Matches src/content/curriculum.ts. Rows are only changed while they still
-- hold the previous wording (RSE, wellbeing or 25 lessons), so later edits
-- made in /learn/admin/content are left alone. Idempotent.

update public.key_stage_pages
set subjects = '["English, with systematic synthetic phonics and early reading", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "PE at home", "PSHE", "Qur''an and Tajweed", "Arabic", "Islamic Studies, including du''a and Islamic manners"]'::jsonb,
    weekly = '[{"subject": "English and phonics", "lessons": 5}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Science, history, geography and computing", "lessons": 1}, {"subject": "Qur''an and Tajweed", "lessons": 3}, {"subject": "Arabic and Islamic Studies", "lessons": 1}, {"subject": "PSHE", "lessons": 1}]'::jsonb,
    total_lessons = '15 live lessons a week (Years 1–2)',
    updated_at = now()
where slug in ('year-1-2','reception-year-2')
  and (subjects::text like '%RSE%' or subjects::text like '%wellbeing%' or subjects::text like '%"PE"%' or subjects::text like '%PE (at home)%'
       or weekly::text like '%RSE%' or weekly::text like '%wellbeing%' or total_lessons like '25 %');

update public.key_stage_pages
set subjects = '["English", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "PE at home", "PSHE", "Qur''an and Tajweed", "Arabic", "Islamic Studies"]'::jsonb,
    weekly = '[{"subject": "English", "lessons": 5}, {"subject": "Mathematics", "lessons": 5}, {"subject": "Science", "lessons": 2}, {"subject": "History, geography and computing", "lessons": 2}, {"subject": "Qur''an and Tajweed", "lessons": 2}, {"subject": "Arabic and Islamic Studies", "lessons": 2}, {"subject": "PSHE", "lessons": 1}, {"subject": "Art and design, PE at home", "lessons": 1}]'::jsonb,
    total_lessons = '20 live lessons a week',
    updated_at = now()
where slug in ('year-3-6')
  and (subjects::text like '%RSE%' or subjects::text like '%wellbeing%' or subjects::text like '%"PE"%' or subjects::text like '%PE (at home)%'
       or weekly::text like '%RSE%' or weekly::text like '%wellbeing%' or total_lessons like '25 %');

update public.key_stage_pages
set subjects = '["English", "Mathematics", "Science (biology, chemistry and physics)", "History", "Geography", "Computing", "Arabic", "Art and design", "PE at home", "PSHE", "Qur''an and Tajweed", "Islamic Studies"]'::jsonb,
    weekly = '[{"subject": "English", "lessons": 4}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Science", "lessons": 3}, {"subject": "History, geography and computing", "lessons": 3}, {"subject": "Qur''an and Tajweed", "lessons": 3}, {"subject": "Arabic and Islamic Studies", "lessons": 4}, {"subject": "PSHE", "lessons": 1}, {"subject": "Art and design, PE at home", "lessons": 1}]'::jsonb,
    total_lessons = '23 live lessons a week',
    updated_at = now()
where slug in ('year-7-9')
  and (subjects::text like '%RSE%' or subjects::text like '%wellbeing%' or subjects::text like '%"PE"%' or subjects::text like '%PE (at home)%'
       or weekly::text like '%RSE%' or weekly::text like '%wellbeing%' or total_lessons like '25 %');

update public.key_stage_pages
set subjects = '["English Language (International GCSE 4EB1, taught from the AQA GCSE course)", "English Literature (International GCSE 4ET1)", "Mathematics (International GCSE 4MA1, taught from the Pearson Edexcel GCSE course)", "Combined (Double Award 4SD0) or separate sciences: Biology 4BI1, Chemistry 4CH1 and Physics 4PH1 (International GCSE)", "Islamic Studies (International GCSE 4IS1)", "Two options from Geography (International GCSE 4GE1, taught from the AQA GCSE course), Computer Science (International GCSE 4CP0, taught from the Pearson Edexcel GCSE course), Business (International GCSE 4BS1) and Arabic (International GCSE Arabic as a first language 4AA1, taught from the Pearson Edexcel GCSE course)", "Qur''an and Tajweed", "PSHE"]'::jsonb,
    weekly = '[{"subject": "English Language and Literature", "lessons": 5}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Sciences", "lessons": 5}, {"subject": "Two International GCSE options", "lessons": 4}, {"subject": "Islamic Studies (International GCSE)", "lessons": 2}, {"subject": "Qur''an and Tajweed", "lessons": 2}, {"subject": "PSHE", "lessons": 1}]'::jsonb,
    total_lessons = '23 live lessons a week',
    updated_at = now()
where slug in ('year-10-11')
  and (subjects::text like '%RSE%' or subjects::text like '%wellbeing%' or subjects::text like '%"PE"%' or subjects::text like '%PE (at home)%'
       or weekly::text like '%RSE%' or weekly::text like '%wellbeing%' or total_lessons like '25 %');

-- Lesson library: one subject name for PSHE in every year.
update public.curriculum_lessons set subject = 'PSHE'
where subject_slug = 'pshe' and subject in ('PSHE & RSE', 'PSHE and RSE (Islamic perspective)');

-- FAQ
update public.faq_entries set answer = 'No. Every year group has PSHE only: good manners, friendships and family, health and hygiene, and keeping safe online and offline, including age-appropriate body safety and what the law says to protect young people. There is no sex education. From Year 7, puberty and its fiqh (bulugh) are taught to boys and girls separately. Parents can see all PSHE materials on the Parent Portal.'
where question = 'Do you teach relationships and sex education (RSE)?' and answer = 'Not to young children. In Years 1 to 6 the subject is PSHE only: good manners, friendships and family, health and hygiene, and keeping safe, including age-appropriate body safety, with no sex education. From Year 7, RSE is taught from an Islamic perspective, to boys and girls separately: marriage and family in Islam, modesty, puberty and its fiqh, consent and the law, and staying safe online. Parents can see all RSE materials on the Parent Portal, and the details are in our Relationships, Sex and Health Education Policy.';

-- Policies page summary for policy 17
update public.policy_links
set summary = 'PSHE only in every year group, with no RSE; puberty and bulugh are taught to boys and girls separately from Year 7.'
where number = '17' and summary = 'PSHE only in Years 1 to 6; RSE from Year 7, taught from an Islamic perspective.';
