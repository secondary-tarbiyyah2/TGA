-- Years 1-2 follow the TGA Curriculum Plan 2027 (November 2026), which aligns
-- them with Tarbiyyah Primary (Cornerstones topic projects, White Rose maths,
-- Little Wandle phonics):
--   * Science, history, geography, art, design and technology and computing are
--     taught through a half-termly topic project: 2 lessons a week (was 1).
--   * Islamic Studies and PSHE share 1 lesson, on alternate weeks.
--   * Arabic letters are taught in Qur'an through the Qaidah (3 lessons);
--     Arabic as a language starts in Year 3, so "Arabic" leaves the KS1 list.
-- Still 15 lessons of 30 minutes. Matches src/content/curriculum.ts.
-- Only rows still holding the previous wording are changed, so edits made in
-- /learn/admin/content are left alone. Idempotent.

update public.key_stage_pages
set subjects = '["English, with systematic synthetic phonics and early reading", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "Design and technology", "PSHE", "Qur''an and Tajweed, with the Qaidah (reading Arabic letters)", "Islamic Studies, including du''a and Islamic manners"]'::jsonb,
    weekly = '[{"subject": "English and phonics", "lessons": 5}, {"subject": "Mathematics", "lessons": 4}, {"subject": "Topic: science, history, geography, art, design and technology, computing", "lessons": 2}, {"subject": "Qur''an and Tajweed, with the Qaidah", "lessons": 3}, {"subject": "Islamic Studies and PSHE (alternate weeks)", "lessons": 1}]'::jsonb,
    updated_at = now()
where slug in ('year-1-2', 'reception-year-2')
  and weekly::text like '%"Arabic and Islamic Studies"%';
