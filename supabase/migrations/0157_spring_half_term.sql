-- "Easter break" is called "Spring half term" everywhere (owner decision,
-- 27 October 2026). Only rows still holding the old wording change. Idempotent.
update public.site_term_dates set label = 'Spring half term'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000009' and label = 'Easter break';
update public.site_term_dates set label = 'Spring half term' where label = 'Easter break';
update public.faq_entries set answer = replace(answer, 'an Easter break', 'a spring half term') where answer like '%an Easter break%';
update public.faq_entries set answer = replace(answer, 'Easter break', 'spring half term') where answer like '%Easter break%';
