-- Follow-up to 0146 (owner's decision, 25 October 2026):
--   * The Saturday taster morning stays on Saturday 14 November (0146 had
--     moved it to the 21st; this puts it back).
--   * A second taster morning is added on Saturday 28 November, after both
--     open evenings (Thursday 12 and Sunday 22 November), so it can be
--     advertised at them. Same format: Years 1-6 at 10:00, Years 7-11 at
--     11:15 UK time.
--   * The Sunday open evening stays moved to 22 November (0146).
--
-- Families booked on the taster keep their place. If a "new date: 21
-- November" notice already reached them, the hourly open-evening-reminders
-- run sees the session moved again and sends a correcting notice for 14
-- November; if it had not gone yet, nothing is sent (their notified time
-- already matches). Idempotent.

update public.open_evening_sessions
set starts_at = '2026-11-14 10:00:00+00', ends_at = '2026-11-14 12:30:00+00'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000002'
  and starts_at = '2026-11-21 10:00:00+00';

insert into public.open_evening_sessions (id, title, description, starts_at, ends_at, capacity, published)
select '6e0b0001-0e0e-4e0e-8e0e-000000000004', s.title, s.description,
       '2026-11-28 10:00:00+00', '2026-11-28 12:30:00+00', s.capacity, true
from public.open_evening_sessions s
where s.id = '6e0b0001-0e0e-4e0e-8e0e-000000000002'
on conflict (id) do nothing;

-- Reminders: a reminder already sent for 14 November stays valid; one only
-- cleared by 0146 for the 21st needs nothing more (reminder_sent_at is null).

-- FAQ wording.
update public.faq_entries set answer = 'Yes. We are holding two online open evenings — Thursday 12 November at 7:30pm and Sunday 22 November at 4:00pm (UK time) — where you meet the Headteacher and teachers and ask anything. There are also two taster mornings, on Saturday 14 and Saturday 28 November: Years 1 to 6 at 10:00 and Years 7 to 11 at 11:15, where your child joins a real live lesson. Register from the Open evenings page; the joining link and a calendar invite are emailed to you.'
where question = 'Can we see the school before we commit?'
  and (answer like '%Saturday 21 November%' or answer like '%Saturday 14 November:%');

update public.faq_entries set answer = replace(answer, 'Saturday 21 November', 'Saturday 14 November')
where answer like '%Saturday 21 November%';
