-- Live lessons move to Monday 4 January 2027, the first Monday of January
-- (owner decision, 26 October 2026). Everything tied to the start moves with it:
--   * Open events: open evenings Thursday 26 November (7:30pm) and Sunday
--     6 December (4:00pm); taster mornings Saturday 28 November and Saturday
--     12 December (Years 1-6 at 10:00, Years 7-11 at 11:15, UK time).
--     Families already booked are emailed the new date by the hourly
--     open-evening-reminders run (notified_starts_at, see 0146).
--   * Application deadline Friday 11 December; induction week 14-18 December;
--     registration fee and first payment due Friday 18 December 2026.
--   * No founding term in December and so no winter break: Spring term A
--     runs 4 January to 12 February 2027. The rest of the year is unchanged.
--   * Fees: December was charged as half a month; with no December lessons
--     the period is January to July (7 months), so each band is two thirds of
--     the full-year fee: £1,596 / £2,130 / £2,796 / £3,000. Seven monthly
--     payments (18 December, then the 28th of each month from January to
--     June); two payments on 18 December and 28 March.
-- Every statement only touches rows that still hold the December-start
-- values or wording, so later admin edits are left alone. Idempotent.

-- ── Open events ─────────────────────────────────────────────────────────
update public.open_evening_sessions set starts_at = '2026-11-26 19:30:00+00', ends_at = '2026-11-26 20:30:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000001' and starts_at = '2026-11-12 19:30:00+00';
update public.open_evening_sessions set starts_at = '2026-11-28 10:00:00+00', ends_at = '2026-11-28 12:30:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000002' and starts_at = '2026-11-14 10:00:00+00';
update public.open_evening_sessions set starts_at = '2026-12-06 16:00:00+00', ends_at = '2026-12-06 17:00:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000003' and starts_at = '2026-11-22 16:00:00+00';
update public.open_evening_sessions set starts_at = '2026-12-12 10:00:00+00', ends_at = '2026-12-12 12:30:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000004' and starts_at = '2026-11-28 10:00:00+00';

-- A reminder already sent for an old date must not stop the one for the new date.
update public.open_evening_bookings b set reminder_sent_at = null
from public.open_evening_sessions s
where s.id = b.session_id and b.status = 'confirmed' and b.notified_starts_at is distinct from s.starts_at;

-- ── Term dates and admissions calendar ──────────────────────────────────
update public.site_term_dates set date = '2026-12-11', notes = 'Applications received after 11 December are welcome and are considered while places remain.'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000001' and date = '2026-11-27';
update public.site_term_dates set date = '2026-12-18'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000002' and date = '2026-12-04';
update public.site_term_dates set date = '2026-12-14', end_date = '2026-12-18'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000003' and date = '2026-11-30';
delete from public.site_term_dates where id = '7e0d0001-0e0e-4e0e-8e0e-000000000004' and date = '2026-12-07';
delete from public.site_term_dates where id = '7e0d0001-0e0e-4e0e-8e0e-000000000005' and date = '2026-12-19';
update public.site_term_dates set label = 'Spring term A (first live lessons Monday 4 January)', date = '2027-01-04'
where id = '7e0d0001-0e0e-4e0e-8e0e-000000000006' and date = '2027-01-05';

-- ── Launch date, instalments, fees ──────────────────────────────────────
update public.site_settings set launch_date = '2027-01-04' where id = true and launch_date = '2026-12-07';
update public.site_settings set fee_instalments = 7 where id = true and fee_instalments = 8;
alter table public.site_settings alter column fee_instalments set default 7;
alter table public.site_settings alter column payment_schedule_text set default
  'The two payments are due on Friday 18 December 2026 and Sunday 28 March 2027. The first monthly payment is due on 18 December 2026, then payments are taken on the 28th of each month from 28 January to 28 June 2027. The registration fee is due on acceptance of a place.';

update public.fee_bands set annual_fee = case annual_fee when 1710 then 1596 when 2282 then 2130 when 2996 then 2796 when 3214 then 3000 end
where annual_fee in (1710, 2282, 2996, 3214);

-- ── Website copy held in the database ───────────────────────────────────
create or replace function pg_temp.tga_jan_start(t text) returns text language sql immutable as $f$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(t, 'Applications for a December start close', 'Applications for a January start close'), 'Monday 7 December 2026', 'Monday 4 January 2027'), '7 December 2026', '4 January 2027'), 'Monday 7 December', 'Monday 4 January'), 'shortened December 2026 to July 2027 period', 'shortened January to July 2027 period'), 'shortened December 2026–July 2027 period', 'shortened January–July 2027 period'), 'December 2026 to July 2027', 'January to July 2027'), 'December 2026–July 2027', 'January–July 2027'), 'December 2026 launch', 'January 2027 launch'), 'December 2026 founding cohort', 'January 2027 founding cohort'), 'launching December 2026', 'launching January 2027'), 'from December 2026', 'from January 2027'), 'for December 2026', 'for January 2027'), 'in December 2026', 'in January 2027'), '30 November to 4 December 2026', '14 to 18 December 2026'), '30 November to 4 December', '14 to 18 December'), '28 December 2026 to 28 June 2027', '28 January to 28 June 2027'), 'Friday 4 December 2026', 'Friday 18 December 2026'), '4 December 2026', '18 December 2026'), 'in two payments (4 December and 28 March', 'in two payments (18 December and 28 March'), 'or in eight monthly payments (4 December, then the 28th of each month from December to June)', 'or in seven monthly payments (18 December, then the 28th of each month from January to June)'), 'ends on Friday 9 July 2027, with a winter break, a Ramadan and Eid break,', 'ends on Friday 9 July 2027, with a Ramadan and Eid break,'), 'Friday 27 November 2026', 'Friday 11 December 2026'), '27 November 2026', '11 December 2026'), 'Friday 27 November', 'Friday 11 December'), 'after 27 November', 'after 11 December'), 'Saturday 14 and Saturday 28 November', 'Saturday 28 November and Saturday 12 December'), 'Saturday 14 or 28 November', 'Saturday 28 November or 12 December'), 'Thursday 12 November', 'Thursday 26 November'), 'Sunday 22 November', 'Sunday 6 December'), '£1,710', '£1,596'), '£2,282', '£2,130'), '£2,996', '£2,796'), '£3,214', '£3,000'), 'Monthly (8 instalments)', 'Monthly (7 instalments)'), '8 monthly payments', '7 monthly payments')
$f$;

do $$
declare r record; v_sql text;
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
      v_sql := format('update public.%I set %I = pg_temp.tga_jan_start(%I::text)::jsonb where %I::text <> pg_temp.tga_jan_start(%I::text)',
                      r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    else
      v_sql := format('update public.%I set %I = pg_temp.tga_jan_start(%I) where %I <> pg_temp.tga_jan_start(%I)',
                      r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
    end if;
    execute v_sql;
  end loop;
end $$;
