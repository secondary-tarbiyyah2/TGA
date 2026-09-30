-- The first Head Teacher/Admin account was bootstrapped with the school's
-- general mailbox (globalacademy@tarbiyyah.co.uk) as its staff_members row,
-- and that row's display_name/role_title were left as the raw email and
-- "Admin" -- both then rendered verbatim on the PUBLIC admissions booking
-- page ("You'll be speaking with globalacademy@tarbiyyah.co.uk, Admin") and
-- in the /learn admin "All staff" list. This replaces them with a proper
-- public-facing label for that shared mailbox, matching how the rest of the
-- site already refers to school contact points (e.g. "Admissions") rather
-- than exposing the underlying inbox address or an internal role title.
--
-- Guarded so it only touches rows still holding that exact placeholder
-- (display_name = the account's own email), never a real name a staff
-- member may have set since.
update public.staff_members sm
set display_name = 'Admissions Team',
    role_title = 'Admissions'
from public.profiles p
where sm.profile_id = p.id
  and p.email = 'globalacademy@tarbiyyah.co.uk'
  and sm.display_name = p.email;
