-- Open events, October 2026 decision:
--   * Thursday 12 November, 7:30pm open evening: unchanged.
--   * Saturday taster morning moves a week later: 14 -> 21 November.
--   * Sunday 4:00pm open evening moves a week later: 15 -> 22 November.
--
-- Families already booked onto a moved session are told automatically:
-- open_evening_bookings.notified_starts_at records the start time each family
-- was last told about. The hourly open-evening-reminders function emails a
-- "new date" notice (with a fresh cancel link and an updated calendar invite)
-- to every confirmed booking whose notified_starts_at no longer matches the
-- session, then stamps the new time, so each family is told exactly once per
-- change. This also covers any future change an admin makes to a session's
-- date in /learn/admin/open-evening.
--
-- Idempotent: the column/backfill only fill blanks, and the date moves only
-- touch the sessions while they still hold the old dates.

alter table public.open_evening_bookings add column if not exists notified_starts_at timestamptz;

-- Everyone booked so far was told the session's current (old) time. This
-- runs before the moves below, so only bookings on the moved sessions end up
-- out of date and get the notice.
update public.open_evening_bookings b
set notified_starts_at = s.starts_at
from public.open_evening_sessions s
where s.id = b.session_id and b.notified_starts_at is null;

-- Saturday taster morning: 14 -> 21 November (same 10:00-12:30 UK window).
update public.open_evening_sessions
set starts_at = '2026-11-21 10:00:00+00', ends_at = '2026-11-21 12:30:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000002'
  and starts_at = '2026-11-14 10:00:00+00';

-- Sunday afternoon open evening: 15 -> 22 November (same 4:00pm UK time).
update public.open_evening_sessions
set starts_at = '2026-11-22 16:00:00+00', ends_at = '2026-11-22 17:00:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000003'
  and starts_at = '2026-11-15 16:00:00+00';

-- A reminder already sent for the old date must not stop the reminder for
-- the new one.
update public.open_evening_bookings b
set reminder_sent_at = null
from public.open_evening_sessions s
where s.id = b.session_id
  and b.status = 'confirmed'
  and b.notified_starts_at is distinct from s.starts_at;

-- FAQ: "Can we see the school before we commit?" (0113 text).
update public.faq_entries set answer = 'Yes. We are holding two online open evenings — Thursday 12 November at 7:30pm and Sunday 22 November at 4:00pm (UK time) — where you meet the Headteacher and teachers and ask anything. There is also a taster morning on Saturday 21 November: Years 1 to 6 at 10:00 and Years 7 to 11 at 11:15, where your child joins a real live lesson. Register from the Open evenings page; the joining link and a calendar invite are emailed to you.'
where question = 'Can we see the school before we commit?'
  and answer like '%Sunday 15 November%';

-- Any other DB-held website copy that names the old weekend dates.
update public.faq_entries set
  answer = replace(replace(replace(replace(answer,
    'Saturday 14 November', 'Saturday 21 November'),
    'Sunday 15 November', 'Sunday 22 November'),
    '14 November', '21 November'),
    '15 November', '22 November')
where answer ~ '(14|15) November';
