-- PE is not offered (owner decision, 26 October 2026): removed from the key
-- stage pages' subject lists and lessons-a-week tables (see 0153, which added
-- "PE at home"). Only rows still holding that wording are changed. Idempotent.
update public.key_stage_pages
set subjects = replace(replace(subjects::text, ', "PE at home"', ''), '"PE at home", ', '')::jsonb,
    weekly = replace(weekly::text, '"Art and design, PE at home"', '"Art and design"')::jsonb,
    intro = replace(intro, ', including art and PE at home.', ', including art.'),
    updated_at = now()
where subjects::text like '%PE at home%' or weekly::text like '%PE at home%' or intro like '%PE at home%';
