-- UK style: no em dashes in public-facing content.
-- " — " becomes ", " and any remaining "—" (empty placeholders, ranges) becomes "–".
do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.data_type in ('text', 'character varying', 'jsonb')
      and c.is_generated = 'NEVER'
      and c.table_name in (
        'faq_entries', 'homepage_content', 'about_content', 'admissions_email_templates',
        'site_settings', 'key_stage_pages', 'policy_links', 'open_evening_sessions',
        'curriculum_content', 'differentiators', 'admissions_stage_details', 'site_term_dates'
      )
  loop
    if r.data_type = 'jsonb' then
      execute format(
        'update public.%1$I set %2$I = replace(replace(%2$I::text, '' — '', '', ''), ''—'', ''–'')::jsonb
           where %2$I::text like ''%%—%%'' and %2$I::text not like ''%%Draft / concept%%''',
        r.table_name, r.column_name);
    else
      execute format(
        'update public.%1$I set %2$I = replace(replace(%2$I, '' — '', '', ''), ''—'', ''–'')
           where %2$I like ''%%—%%'' and %2$I not like ''%%Draft / concept%%''',
        r.table_name, r.column_name);
    end if;
  end loop;
end $$;

-- "Tarbiyah Note" is spelled with one y.
update public.faq_entries set answer = replace(answer, 'weekly tarbiyyah note', 'weekly Tarbiyah Note')
  where answer like '%weekly tarbiyyah note%';

-- Say clearly what we are: an online school for homeschooling families.
update public.homepage_content
  set hero_kicker = 'An online school for homeschooling families',
      hero_body = case when hero_body ilike '%homeschool%' then hero_body else null end;

-- RECIPE cards now show the Arabic term on its own line, so drop it from the descriptions.
update public.about_content set recipe_items = '[
  {"letter":"R","word":"Resilience","body":"Persevering through difficulty with patience."},
  {"letter":"E","word":"Eeman","body":"Faith that shapes action."},
  {"letter":"C","word":"Contentment","body":"Gratitude and inner peace."},
  {"letter":"I","word":"Integrity","body":"Honesty and trustworthiness."},
  {"letter":"P","word":"Progress","body":"Always seeking to improve."},
  {"letter":"E","word":"Excellence","body":"Doing everything as well as possible."}
]'::jsonb
where recipe_items is not null;

-- Taster morning: don't name subjects or topics in advance.
update public.open_evening_sessions
  set title = 'Taster morning',
      description = 'Your child joins real live lessons, taught the way we teach every day, in two age bands: Years 1 to 6 at 10:00 and Years 7 to 11 at 11:15 UK time. Online, and parents are welcome to watch.'
where title ilike 'Taster morning%';
