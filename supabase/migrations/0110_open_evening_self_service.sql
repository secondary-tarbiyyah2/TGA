-- Parents can cancel their open-evening place themselves from the link in
-- the confirmation email (no login), instead of emailing the office.
-- Only a hash of the token is stored; the token itself goes in the email.
alter table public.open_evening_bookings add column if not exists manage_token_hash text;
create unique index if not exists open_evening_bookings_manage_token_idx on public.open_evening_bookings (manage_token_hash) where manage_token_hash is not null;
