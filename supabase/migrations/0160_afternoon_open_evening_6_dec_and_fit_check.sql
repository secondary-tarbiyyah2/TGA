-- Owner review, 28 October 2026.
--
-- 1. The "afternoon, for other time zones" open evening was showing on the
--    site as Saturday 21 November 16:00. The agreed dates (prospectus p.17,
--    0155) are Thursday 26 November 7:30pm and Sunday 6 December 4:00pm UK,
--    then one taster morning on Saturday 12 December. 0154 only moved the
--    afternoon session when it still held its earlier 22 November value, so a
--    row edited by hand in the admin portal was left on 21 November. Move any
--    afternoon session still sitting in November to 6 December, and clear
--    reminders so booked families are emailed the new date by the hourly
--    open-evening-reminders run (0146).
-- 2. The public "Your Child's Week" quiz is replaced by a short fit check
--    (src/lib/quiz/defaultConfig.ts): no Arabic/Qur'an level estimates, no
--    hifdh "starting points", no sample timetable. Any quiz version an admin
--    published from the old default would keep the old questions live, so it
--    is archived here; with no published row the site uses the new default,
--    and the quiz builder starts its next draft from it.
-- Idempotent.

update public.open_evening_sessions
set starts_at = '2026-12-06 16:00:00+00', ends_at = '2026-12-06 17:00:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000003'
  and starts_at >= '2026-11-01 00:00:00+00' and starts_at < '2026-12-01 00:00:00+00';

update public.open_evening_sessions
set starts_at = '2026-12-06 16:00:00+00', ends_at = '2026-12-06 17:00:00+00'
where title ilike '%afternoon%'
  and starts_at >= '2026-11-01 00:00:00+00' and starts_at < '2026-12-01 00:00:00+00';

update public.open_evening_bookings b set reminder_sent_at = null
from public.open_evening_sessions s
where s.id = b.session_id and b.status = 'confirmed' and b.notified_starts_at is distinct from s.starts_at;

update public.quiz_config_versions
set status = 'archived',
    label = case when label like '%(superseded by fit check)%' then label else label || ' (superseded by fit check)' end
where status = 'published'
  and content::text like '%"arabic_level"%';
