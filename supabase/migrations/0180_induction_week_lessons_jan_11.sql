-- Opening and first live lessons (owner decision, 9 November 2026), replacing 0178:
--   * Friday 1 January 2027 is New Year's Day, a UK bank holiday, so nothing happens on it.
--   * The first week is induction week, Monday 4 to Friday 8 January 2027 (accounts, devices,
--     meeting teachers, entry assessments). The Academy opens on Monday 4 January.
--   * First live lessons: Monday 11 January 2027. Spring term A runs 11 January to 12 February.
--   * First fee payment, the annual-payment discount deadline and the first monthly payment:
--     Friday 8 January 2027 (the end of induction week). 28 March and the 28th-of-the-month
--     instalments are unchanged.
--   * The winter break runs to Sunday 3 January 2027.
-- This puts back the dates 0155 set (26 October). Other 2027 bank holidays already fall in
-- holidays or are marked as no-lesson days: Good Friday 26 March and Easter Monday 29 March
-- (spring half term), Monday 3 May and Monday 31 May (no lessons).
-- Matches src/content/seed.ts, keyDates.ts, fitCheck.ts, fees.ts and the policy markdown.
-- Website copy held in the database gets the reverse of 0178's replacements, most specific
-- first: "4 January" (only ever the first live lessons after 0178) becomes 11 January, the
-- induction-day phrases become induction week, and what is left on 1 January is the first
-- fee payment, which becomes 8 January. Each pattern is matched from the start of a word
-- (\m), so "11 January" is never read as "1 January". The row updates only touch the 0178 values.

-- ── Term dates ──────────────────────────────────────────────────────────
update public.site_term_dates set end_date = '2027-01-03'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000005' and end_date = '2026-12-31';
update public.site_term_dates
set label = 'Induction week (the Academy opens)', date = '2027-01-04', end_date = '2027-01-08'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000003' and date = '2027-01-01';
update public.site_term_dates set date = '2027-01-08'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000002' and date = '2027-01-01';
update public.site_term_dates
set label = 'Spring term A (first live lessons Monday 11 January)', date = '2027-01-11'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000006' and date = '2027-01-04';

update public.site_settings set launch_date = '2027-01-11' where id = true and launch_date = '2027-01-04';

alter table public.site_settings alter column payment_schedule_text set default
  'The two payments are due on Friday 8 January 2027 and Sunday 28 March 2027. The first monthly payment is due on 8 January 2027, then payments are taken on the 28th of each month from 28 January to 28 June 2027. The first payment is due on acceptance and no later than 8 January 2027.';

-- ── Website copy held in the database ───────────────────────────────────
create or replace function pg_temp.tga_jan11b(t text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t, '\mfirst live lessons Monday 4 January', 'first live lessons Monday 11 January', 'g'), '\mMonday 4 January 2027', 'Monday 11 January 2027', 'g'), '\mMon 4 January 2027', 'Mon 11 January 2027', 'g'), '\mMonday 4 January', 'Monday 11 January', 'g'), '\m4 January 2027', '11 January 2027', 'g'), '\mfrom 4 January', 'from 11 January', 'g'), '\mthe Academy opens on Fri 1 Jan 2027 \(induction day\)', 'the Academy opens on Mon 4 Jan 2027 (induction week)', 'g'), '\mthe Academy opens on Friday 1 January 2027', 'the Academy opens on Monday 4 January 2027', 'g'), '\mThe Academy opens with induction day', 'The Academy opens with induction week', 'g'), '\mInduction day is Friday 1 January', 'Induction week runs 4 to 8 January', 'g'), '\minduction day is Friday 1 January', 'induction week runs 4 to 8 January', 'g'), '\minduction day \(Friday 1 January 2027\)', 'induction week (4 to 8 January 2027)', 'g'), '\mInduction on Friday 1 January', 'Induction 4 to 8 January', 'g'), '\minduction day, Friday 1 January 2027', 'induction week, 4 to 8 January 2027', 'g'), '\mInduction day \(the Academy opens\)', 'Induction week (the Academy opens)', 'g'), '\mFri 1 Jan 2027', 'Mon 4 Jan 2027', 'g'), '\mFri 1 January 2027', 'Mon 4 January 2027', 'g'), '\mInduction day', 'Induction week', 'g'), '\minduction day', 'induction week', 'g'), '\mFriday 1 January 2027', 'Friday 8 January 2027', 'g'), '\m1 January and 28 March', '8 January and 28 March', 'g'), '\m1 January 2027', '8 January 2027', 'g'), '\m1 Jan 2027', '8 Jan 2027', 'g'), '\mfrom 1 January', 'from 8 January', 'g')
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
      execute format('update public.%I set %I = pg_temp.tga_jan11b(%I::text)::jsonb where %I::text <> pg_temp.tga_jan11b(%I::text)',
                     r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    else
      execute format('update public.%I set %I = pg_temp.tga_jan11b(%I) where %I <> pg_temp.tga_jan11b(%I)',
                     r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    end if;
  end loop;
end $$;
