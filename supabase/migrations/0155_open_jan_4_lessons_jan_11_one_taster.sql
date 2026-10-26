-- Follow-up to 0154 (owner decision, 26 October 2026, evening):
--   * The Academy opens on Monday 4 January 2027 with induction week
--     (4-8 January); first live lessons are on Monday 11 January 2027.
--   * Two open evenings, one in November and one in December (Thursday
--     26 November 7:30pm, Sunday 6 December 4:00pm), then ONE taster morning
--     after both, on Saturday 12 December. The 28 November taster is
--     withdrawn: families booked on it are moved to 12 December and emailed
--     the new date by the hourly open-evening-reminders run (0146).
--   * Application deadline Friday 18 December 2026; registration fee and first
--     payment due Friday 8 January 2027 (two payments: 8 January and 28 March;
--     monthly: 8 January, then the 28th of each month to June). Fees unchanged.
-- Only rows still holding the 0154 values are changed. Idempotent.

-- ── Taster morning: one, after both open evenings ───────────────────────
update public.open_evening_bookings b set session_id = '6e0b0001-0e0e-4e0e-8e0e-000000000004', reminder_sent_at = null
where b.session_id = '6e0b0001-0e0e-4e0e-8e0e-000000000002'
  -- a family already booked on 12 December keeps that one booking
  and not exists (select 1 from public.open_evening_bookings d
                  where d.session_id = '6e0b0001-0e0e-4e0e-8e0e-000000000004' and lower(d.email) = lower(b.email) and d.status = 'confirmed')
  and exists (select 1 from public.open_evening_sessions s where s.id = '6e0b0001-0e0e-4e0e-8e0e-000000000004' and s.starts_at = '2026-12-12 10:00:00+00');
update public.open_evening_sessions set published = false
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000002' and starts_at = '2026-11-28 10:00:00+00';

-- ── Term dates ──────────────────────────────────────────────────────────
update public.site_term_dates set date = '2026-12-18', notes = 'Applications received after 18 December are welcome and are considered while places remain.'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000001' and date = '2026-12-11';
update public.site_term_dates set date = '2027-01-08'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000002' and date = '2026-12-18';
update public.site_term_dates set label = 'Induction week (the Academy opens)', date = '2027-01-04', end_date = '2027-01-08'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000003' and date = '2026-12-14';
insert into public.site_term_dates (id, label, kind, date, end_date, notes, confirmed)
values ('7e0d0001-0e0e-4e0e-8e0e-000000000005', 'Winter break', 'Holiday', '2026-12-19', '2027-01-03', null, true)
on conflict (id) do nothing;
update public.site_term_dates set label = 'Spring term A (first live lessons Monday 11 January)', date = '2027-01-11'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000006' and date = '2027-01-04';

update public.site_settings set launch_date = '2027-01-11' where id = true and launch_date = '2027-01-04';
alter table public.site_settings alter column payment_schedule_text set default
  'The two payments are due on Friday 8 January 2027 and Sunday 28 March 2027. The first monthly payment is due on 8 January 2027, then payments are taken on the 28th of each month from 28 January to 28 June 2027. The registration fee is due on acceptance of a place.';

-- ── Website copy held in the database ───────────────────────────────────
create or replace function pg_temp.tga_jan11(t text) returns text language sql immutable as $f$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(t, 'first live lessons Monday 4 January', 'first live lessons Monday 11 January'), 'Monday 4 January 2027', 'Monday 11 January 2027'), 'Monday 4 January', 'Monday 11 January'), 'on 4 January 2027', 'on 11 January 2027'), '14 to 18 December 2026', '4 to 8 January 2027'), '14 to 18 December', '4 to 8 January'), 'Friday 18 December 2026', 'Friday 8 January 2027'), '18 December 2026', '8 January 2027'), '(18 Dec 2026)', '(8 Jan 2027)'), 'in two payments (18 December and 28 March', 'in two payments (8 January and 28 March'), 'seven monthly payments (18 December, then', 'seven monthly payments (8 January, then'), 'Friday 11 December 2026', 'Friday 18 December 2026'), '11 December 2026', '18 December 2026'), 'Friday 11 December', 'Friday 18 December'), 'after 11 December', 'after 18 December'), 'the 11 December application deadline', 'the 18 December application deadline'), 'There are also two taster mornings, on Saturday 28 November and Saturday 12 December:', 'After both open evenings there is a taster morning on Saturday 12 December:'), 'two taster mornings, on Saturday 28 November and Saturday 12 December', 'a taster morning on Saturday 12 December, after both open evenings'), 'At a taster morning (Saturday 28 November or 12 December)', 'At the taster morning (Saturday 12 December, after both open evenings)'), 'a taster morning (28 November or 12 December)', 'a taster morning (12 December)'), 'Saturday 28 November or 12 December', 'Saturday 12 December'), 'open evenings and taster mornings.', 'open evenings and a taster morning.')
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
      execute format('update public.%I set %I = pg_temp.tga_jan11(%I::text)::jsonb where %I::text <> pg_temp.tga_jan11(%I::text)',
                     r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    else
      execute format('update public.%I set %I = pg_temp.tga_jan11(%I) where %I <> pg_temp.tga_jan11(%I)',
                     r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    end if;
  end loop;
end $$;
