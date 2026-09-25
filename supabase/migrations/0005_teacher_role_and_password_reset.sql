-- Resend can't send email yet (sending-domain DNS isn't verified, and the
-- host's DNS zone editor won't accept the records it needs) — magic-link
-- sign-in is unusable until that's fixed, since it too depends on email
-- delivery. This adds password-based sign-in as a working alternative in
-- the meantime, seeded with a one-time temporary password instead of an
-- invite email, and a distinct 'teacher' role so teacher accounts land on
-- a teacher view, not the admissions/admin one.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('parent', 'student', 'staff', 'teacher', 'admin'));

alter table public.profiles add column must_change_password boolean not null default false;
