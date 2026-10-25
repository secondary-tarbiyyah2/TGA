-- Prospectus / website / portal alignment (October 2026, second pass after 0135).
-- Winners: dates and fees follow the Prospectus 2026-27 (p.17-19); subjects
-- follow the portal (content/lessons, content/syllabus).
--
-- Every statement only touches rows that still hold the old text/values, so an
-- admin's later edits in /learn/admin/content are never overwritten. Idempotent.
-- Open events (dates, FAQ "Can we see the school before we commit?") are NOT
-- touched here: see 0146 and 0148.

-- ── Payment dates copy (Fees page) ─────────────────────────────────────────
-- The prospectus calls the plan "2 payments" (4 Dec 2026 and 28 Mar 2027), not
-- "termly"; the date text otherwise already matched (0135).
update public.site_settings
set payment_schedule_text = 'The two payments are due on Friday 4 December 2026 and Sunday 28 March 2027. The first monthly payment is due on 4 December 2026, then payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 4 December 2026.'
where id = true
  and payment_schedule_text = 'Termly payments are due on 4 December 2026 and 28 March 2027. The first monthly payment is due on 4 December 2026, then payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 4 December 2026.';
alter table public.site_settings
  alter column payment_schedule_text set default 'The two payments are due on Friday 4 December 2026 and Sunday 28 March 2027. The first monthly payment is due on 4 December 2026, then payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 4 December 2026.';

-- ── Homepage fee teaser ────────────────────────────────────────────────────
update public.homepage_content
set fee_teaser_body = replace(fee_teaser_body, 'Annual, termly and monthly plans', 'Annual, two-payment and monthly plans')
where fee_teaser_body like '%Annual, termly and monthly plans%';

-- ── FAQs ───────────────────────────────────────────────────────────────────
-- "How can we pay?": two payments, not termly (prospectus p.18).
update public.faq_entries
set answer = replace(answer, 'in two termly payments (4 December and 28 March)', 'in two payments (4 December and 28 March)')
where question = 'How can we pay?' and answer like '%in two termly payments (4 December and 28 March)%';

-- Term dates live on the Term Dates page (not the Admissions page) and the year
-- ends on Friday 9 July 2027 (prospectus p.19).
update public.faq_entries
set answer = 'Yes. Term dates are published on the Term Dates page and in the portal calendar: induction week runs 30 November to 4 December 2026, live lessons start on Monday 7 December 2026 and the year ends on Friday 9 July 2027, with a winter break, a Ramadan and Eid break, an Easter break and an Eid al-Adha half term marked.'
where question = 'Are there term dates and holidays?'
  and answer = 'Yes. Term dates are published on the Admissions page and in the portal calendar: lessons start on Monday 7 December 2026 and the year runs to July 2027 with half-term breaks and Eid holidays marked.';

-- Lesson lengths stated (prospectus p.9: 30 / 45 / 50 minutes, ten-minute movement breaks).
update public.faq_entries
set answer = 'Lessons are live and taught by a qualified teacher to a class of no more than 15. Lessons are 30 minutes in Years 1–2, 45 minutes in Years 3–6 and 50 minutes in Years 7–11, with a ten-minute movement break between lessons. Each key stage''s curriculum page shows a sample week.'
where question = 'How long are lessons, and how big are the classes?'
  and answer = 'Lessons are live and taught by a qualified teacher to a class of no more than 15. Younger pupils have shorter sessions with movement breaks; older pupils have longer lessons. Each key stage''s curriculum page shows a sample week.';

-- Application steps with the prospectus deadlines (p.17).
update public.faq_entries
set answer = '1) Register for an open evening or book a call if you want to talk to us first. 2) Complete the online application (about ten minutes) and pay the {{applicationFee}} application fee, by Friday 27 November 2026 for the founding cohort. 3) Your child sits a short online entry assessment and we have a conversation with you. 4) We offer a place in writing. 5) You accept by paying the {{registrationFee}} registration fee and the first fee payment (by Friday 4 December 2026) and signing the parent agreement on the portal. 6) Induction week (30 November to 4 December), then live lessons begin on Monday 7 December 2026.'
where question = 'How do I apply, step by step?'
  and answer = '1) Register for an open evening or book a call if you want to talk to us first. 2) Complete the online application (about 15 minutes) and pay the {{applicationFee}} application fee. 3) Your child sits a short online entry assessment and we have a conversation with you. 4) We offer a place in writing. 5) You accept by paying the {{registrationFee}} registration fee and signing the parent agreement on the portal. 6) Induction week, then lessons begin.';

-- The portal is the "Student Portal" (prospectus p.8, /learn login).
update public.faq_entries
set answer = replace(answer, 'logs into the Pupil Portal', 'logs into the Student Portal')
where question = 'Where do lessons happen, and how does my child join?' and answer like '%logs into the Pupil Portal%';

-- ── Portal subject name ────────────────────────────────────────────────────
-- 0018 seeded "Qur'an & Hifz": house spelling is hifdh, and the portal's
-- lesson library and the website call the subject "Qur'an & Tajweed". Only
-- renamed while it still has the seeded name and the new name is free.
update public.subjects set name = 'Qur''an & Tajweed'
where name = 'Qur''an & Hifz'
  and not exists (select 1 from public.subjects s2 where s2.name = 'Qur''an & Tajweed');
update public.subjects set name = 'Qur''an & Hifdh'
where name = 'Qur''an & Hifz';
