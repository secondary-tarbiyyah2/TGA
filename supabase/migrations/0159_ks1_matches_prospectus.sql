-- Years 1-2: the weekly table names art and design (it is on the subject list
-- and in the prospectus), and live time is about 1.5 hours a day (15 lessons
-- of 30 minutes, three a day). Matches src/content/curriculum.ts.
update public.key_stage_pages
set weekly = replace(weekly::text, '"Science, history, geography and computing"', '"Science, history, geography, computing, art and design"')::jsonb,
    note = replace(note, 'about 2 hours a day', 'about 1.5 hours a day'),
    updated_at = now()
where slug in ('year-1-2', 'reception-year-2');
