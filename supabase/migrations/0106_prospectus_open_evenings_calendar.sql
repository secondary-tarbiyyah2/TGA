-- Open evenings, the founding-year calendar and sibling discounts, taken
-- from the Prospectus 2026-27 (v5, 20 October 2026) so the website matches
-- the printed document.
--
--  * open_evening_sessions: the three sessions parents can register for on
--    /open-evening (the booking form, confirmation email and reminders
--    already exist - migration 0087 - but no sessions had been created).
--    Join links are added by the school in /learn/admin/open-evening; until
--    then the confirmation email says the link will follow.
--  * site_term_dates: the founding-year term dates and key dates, confirmed,
--    so the Term Dates page and .ics feed stop saying "to be confirmed".
--  * site_settings: sibling discount (5% second child, 10% third and later),
--    the prospectus link, and a launch date.
--
-- Idempotent: fixed ids, insert ... on conflict do nothing / update of
-- settings only where still empty.

insert into public.open_evening_sessions (id, title, description, starts_at, ends_at, capacity, published)
values
  ('6e0b0001-0e0e-4e0e-8e0e-000000000001', 'Virtual open evening',
   'Meet the Headteacher, see a sample live lesson and a tour of the Parent and Student Portals, and ask your questions. Online, 7:30pm UK time.',
   '2026-11-12 19:30:00+00', '2026-11-12 20:30:00+00', 150, true),
  ('6e0b0001-0e0e-4e0e-8e0e-000000000002', 'Taster morning: Arabic, Islamic Studies and Science',
   'Your child joins a live Arabic or Islamic Studies lesson and a Science lesson, taught the way our lessons are taught every day. Online, 10:00am-12:30pm UK time. Parents are welcome to watch.',
   '2026-11-14 10:00:00+00', '2026-11-14 12:30:00+00', 60, true),
  ('6e0b0001-0e0e-4e0e-8e0e-000000000003', 'Virtual open evening (afternoon, for other time zones)',
   'The same open evening at a friendlier hour for families in the Gulf, Africa and Asia: meet the Headteacher, see a sample lesson and the portals. Online, 4:00pm UK time.',
   '2026-11-15 16:00:00+00', '2026-11-15 17:00:00+00', 150, true)
on conflict (id) do nothing;

insert into public.site_term_dates (id, label, kind, date, end_date, notes, confirmed) values
  ('7e0d0001-0e0e-4e0e-8e0e-000000000001', 'Application deadline for the founding cohort', 'Admissions deadline', '2026-11-27', null, 'Applications received after 27 November are welcome and are considered while places remain.', true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000002', 'Registration fee and first fee payment due', 'Admissions deadline', '2026-12-04', null, null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000003', 'Induction week', 'Event', '2026-11-30', '2026-12-04', 'Set up accounts, test devices and meet teachers.', true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000004', 'Founding term (first live lessons Monday 7 December)', 'Term date', '2026-12-07', '2026-12-18', null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000005', 'Winter break', 'Holiday', '2026-12-19', '2027-01-04', null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000006', 'Spring term A', 'Term date', '2027-01-05', '2027-02-12', null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000007', 'Ramadan and Eid break', 'Holiday', '2027-02-15', '2027-03-12', 'Islamic dates depend on the moon sighting and may move by a day or two.', true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000008', 'Spring term B', 'Term date', '2027-03-15', '2027-03-25', null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000009', 'Easter break', 'Holiday', '2027-03-26', '2027-03-30', null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000010', 'Summer term A', 'Term date', '2027-03-31', '2027-05-07', 'No lessons on Friday 9 April (INSET) or Monday 3 May.', true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000011', 'Eid al-Adha half term', 'Holiday', '2027-05-10', '2027-05-21', null, true),
  ('7e0d0001-0e0e-4e0e-8e0e-000000000012', 'Summer term B', 'Term date', '2027-05-24', '2027-07-09', 'No lessons on Monday 31 May. Awards ceremony (online) in early July.', true)
on conflict (id) do nothing;

-- Sibling discounts (Prospectus p.18). Only filled where still empty so an
-- admin's own figures are never overwritten.
update public.site_settings set
  sibling_discount_percent = coalesce(sibling_discount_percent, 5),
  sibling_discount_note = coalesce(sibling_discount_note, '5% off tuition for a second child and 10% for the third and later children, applied to the younger sibling''s tuition; the registration fee is £125 for each additional sibling. Can be combined with the annual-payment discount.'),
  launch_date = coalesce(launch_date, '2026-12-07')
where id = true;
