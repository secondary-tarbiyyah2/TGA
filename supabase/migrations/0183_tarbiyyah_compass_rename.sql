-- 0183: the character framework previously called "RECIPE" is renamed
-- "the Tarbiyyah Compass" (owner's decision, 9 November 2026). The six values
-- (Resilience, Eeman, Contentment, Integrity, Progress, Excellence) are
-- unchanged, so this is wording only.
--
-- Updates the live copies of text the repo change can't reach on its own:
--   * policy_links: title, body_md and meta of every policy that mentions it.
--     The body-changed trigger is switched off for this update so families
--     and staff are NOT asked to re-sign policies for a change of name;
--     body_updated_at is still set so the PDFs are rebuilt.
--   * faq_entries: answers.
--   * about_content: the section intro, if it was edited to mention it.
-- Policy 23's address changes to /policies/23-tarbiyyah-compass-character-framework/
-- through scripts/sync-policies.mjs (oldStem keeps the same row).
--
-- Idempotent: running it again changes nothing.

create or replace function pg_temp.compass(t text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    t,
    'RECIPE Character Framework', 'Tarbiyyah Compass Character Framework'),
    'RECIPE character framework', 'Tarbiyyah Compass character framework'),
    'The RECIPE Values', 'The Tarbiyyah Compass Values'),
    'RECIPE framework', 'Tarbiyyah Compass'),
    'RECIPE values', 'Tarbiyyah Compass values'),
    'RECIPE value', 'Tarbiyyah Compass value'),
    'RECIPE Star', 'Compass Star'),
    'RECIPE expectations', 'Tarbiyyah Compass expectations'),
    '23-recipe-character-framework', '23-tarbiyyah-compass-character-framework'),
    'RECIPE', 'Tarbiyyah Compass')
$$;

alter table public.policy_links disable trigger policy_links_body_changed;

update public.policy_links
set title = pg_temp.compass(title),
    body_md = pg_temp.compass(body_md),
    meta = pg_temp.compass(meta::text)::jsonb,
    body_updated_at = now()
where title like '%RECIPE%' or body_md like '%RECIPE%' or meta::text like '%RECIPE%';

alter table public.policy_links enable trigger policy_links_body_changed;

update public.faq_entries
set answer = pg_temp.compass(answer)
where answer like '%RECIPE%';

update public.about_content
set recipe_intro = pg_temp.compass(recipe_intro)
where recipe_intro like '%RECIPE%';
