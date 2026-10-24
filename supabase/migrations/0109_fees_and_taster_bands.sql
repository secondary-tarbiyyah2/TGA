-- Fees shown on the site: the registration fee was still £550 / application
-- fee £100 in the live settings row (the prospectus and seed say £250 / £50).
-- Taster morning: run as two age-banded sessions inside the same morning so
-- it suits every year group without stretching staff.
update public.site_settings set registration_fee = 250 where id = true and registration_fee in (550, 150);
update public.site_settings set application_fee = 50 where id = true and application_fee in (100, 247);

update public.open_evening_sessions set
  title = 'Taster morning (Years 1–6 at 10:00, Years 7–11 at 11:15)',
  description = 'Two short tasters in one morning so every age gets a lesson pitched for them. 10:00–11:00 UK: Years 1–6 join a live Qur''an and Islamic Studies lesson. 11:15–12:30 UK: Years 7–11 join a live Arabic lesson and a Science lesson. Book once and tell us your child''s year group; we send the right joining time. Parents are welcome to watch.'
where id = '6e0b0001-0e0e-4e0e-8e0e-000000000002';
