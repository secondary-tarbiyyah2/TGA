-- The application fee is £150 per child (owner decision, 28 October 2026).
-- It is the only admissions fee (no registration fee since 0163).
update public.site_settings set application_fee = 150 where coalesce(application_fee, 0) <> 150;
alter table public.site_settings alter column application_fee set default 150;

-- Stored copy that states the old amount next to "application fee".
do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.data_type in ('text', 'character varying', 'jsonb')
      and c.is_generated = 'NEVER'
      and c.table_name in ('faq_entries', 'homepage_content', 'about_content', 'admissions_email_templates', 'site_settings',
                           'key_stage_pages', 'admissions_stage_details', 'site_term_dates', 'differentiators')
  loop
    execute format(
      'update public.%1$I set %2$I = (regexp_replace(%2$I::text, ''£50(\.00)?(\s+(per child\s+)?(non-refundable\s+)?application)'', ''£150\2'', ''gi''))::%3$s
         where %2$I::text ~* ''£50(\.00)?\s+(per child\s+)?(non-refundable\s+)?application''',
      r.table_name, r.column_name, case when r.data_type = 'jsonb' then 'jsonb' else 'text' end);
    execute format(
      'update public.%1$I set %2$I = (regexp_replace(%2$I::text, ''(application fee[^.£]{0,40})£50(\.00)?(?![0-9])'', ''\1£150'', ''gi''))::%3$s
         where %2$I::text ~* ''application fee[^.£]{0,40}£50''',
      r.table_name, r.column_name, case when r.data_type = 'jsonb' then 'jsonb' else 'text' end);
  end loop;
end $$;
