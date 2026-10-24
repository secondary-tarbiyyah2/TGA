-- House spelling is "hifdh" (not "hifz") in everything families read. Updates
-- stored quiz versions, site copy tables and announcements; internal keys such
-- as hifz_role and hifz-in-progress are left alone. Idempotent.
update public.quiz_config_versions
set content = regexp_replace(regexp_replace(content::text, '(?<![-_A-Za-z])hifz(?![-_A-Za-z])', 'hifdh', 'g'), '(?<![-_A-Za-z])Hifz(?![-_A-Za-z])', 'Hifdh', 'g')::jsonb
where content::text ~ '(?<![-_A-Za-z])[Hh]ifz(?![-_A-Za-z])';
update public.faq_entries set question = replace(replace(question, 'hifz', 'hifdh'), 'Hifz', 'Hifdh'), answer = replace(replace(answer, 'hifz', 'hifdh'), 'Hifz', 'Hifdh') where question ~ '[Hh]ifz' or answer ~ '[Hh]ifz';
update public.differentiators set title = replace(replace(title, 'Hifz', 'Hifdh'), 'hifz', 'hifdh'), summary = replace(replace(summary, 'Hifz', 'Hifdh'), 'hifz', 'hifdh'), detail = case when detail is null then null else replace(replace(detail, 'Hifz', 'Hifdh'), 'hifz', 'hifdh') end where title ~ '[Hh]ifz' or summary ~ '[Hh]ifz' or coalesce(detail, '') ~ '[Hh]ifz';
