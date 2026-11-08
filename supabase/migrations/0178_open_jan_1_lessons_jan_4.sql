-- The Academy opens on Friday 1 January 2027 (owner decision, 8 November 2026),
-- a week earlier than 0155 set:
--   * Friday 1 January 2027: induction day (the Academy opens). It is New
--     Year's Day, so it is set-up and welcome only, with no timetabled lessons.
--   * Monday 4 January 2027: first live lessons (was Monday 11 January).
--     Spring term A therefore runs 4 January to 12 February.
--   * Friday 1 January 2027: first fee payment, the annual-payment discount
--     deadline and the first monthly payment (was Friday 8 January). The
--     28 March second payment and the 28th-of-the-month instalments are unchanged.
--   * The winter break ends on Thursday 31 December 2026.
-- Matches src/content/seed.ts, keyDates.ts, fitCheck.ts, fees.ts and the policy
-- markdown. Website copy held in the database is updated with the same ordered
-- replacements, so text edited in /learn/admin/content keeps its other changes.
-- Idempotent: every replacement and row update only touches the old wording.

-- ── Term dates ──────────────────────────────────────────────────────────
update public.site_term_dates set end_date = '2026-12-31'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000005' and end_date = '2027-01-03';
update public.site_term_dates
set label = 'Induction day (the Academy opens)', date = '2027-01-01', end_date = null
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000003' and date = '2027-01-04';
update public.site_term_dates set date = '2027-01-01'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000002' and date = '2027-01-08';
update public.site_term_dates
set label = 'Spring term A (first live lessons Monday 4 January)', date = '2027-01-04'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000006' and date = '2027-01-11';

update public.site_settings set launch_date = '2027-01-04' where id = true and launch_date = '2027-01-11';

alter table public.site_settings alter column payment_schedule_text set default
  'The two payments are due on Friday 1 January 2027 and Sunday 28 March 2027. The first monthly payment is due on 1 January 2027, then payments are taken on the 28th of each month from 28 January to 28 June 2027. The first payment is due on acceptance and no later than 1 January 2027.';

-- ── Website copy held in the database ───────────────────────────────────
create or replace function pg_temp.tga_jan1(t text) returns text language sql immutable as $f$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(t, 'the Academy opens on Mon 4 Jan 2027 (induction week)', 'the Academy opens on Fri 1 Jan 2027 (induction day)'), 'the Academy opens on Monday 4 January 2027', 'the Academy opens on Friday 1 January 2027'), 'The Academy opens with induction week', 'The Academy opens with induction day'), 'Mon 4 Jan 2027', 'Fri 1 Jan 2027'), 'Mon 4 January 2027', 'Fri 1 January 2027'), 'Induction week runs 4 to 8 January', 'Induction day is Friday 1 January'), 'induction week runs 4 to 8 January', 'induction day is Friday 1 January'), 'induction week (4 to 8 January 2027)', 'induction day (Friday 1 January 2027)'), 'Induction 4 to 8 January', 'Induction on Friday 1 January'), 'induction week, 4 to 8 January 2027', 'induction day, Friday 1 January 2027'), '4 to 8 January 2027', 'Friday 1 January 2027'), 'Monday 11 January 2027', 'Monday 4 January 2027'), 'Mon 11 January 2027', 'Mon 4 January 2027'), 'Monday 11 January', 'Monday 4 January'), '11 January 2027', '4 January 2027'), 'from 11 January', 'from 4 January'), 'Friday 8 January 2027', 'Friday 1 January 2027'), '8 January 2027', '1 January 2027'), '8 Jan 2027', '1 Jan 2027'), '8 January and 28 March', '1 January and 28 March'), 'from 8 January', 'from 1 January'), 'Induction week (the Academy opens)', 'Induction day (the Academy opens)'), 'Induction week', 'Induction day'), 'induction week', 'induction day')
$f$;

do $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('faq_entries','homepage_content','about_content','admissions_email_templates','site_settings',
                           'key_stage_pages','policy_links','open_evening_sessions','curriculum_content','differentiators',
                           'admissions_stage_details','site_term_dates','fee_bands','team_profiles','testimonials')
      and c.data_type in ('text','character varying','jsonb')
  loop
    if r.data_type = 'jsonb' then
      execute format('update public.%I set %I = pg_temp.tga_jan1(%I::text)::jsonb where %I::text <> pg_temp.tga_jan1(%I::text)',
                     r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    else
      execute format('update public.%I set %I = pg_temp.tga_jan1(%I) where %I <> pg_temp.tga_jan1(%I)',
                     r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    end if;
  end loop;
end $$;
