-- 0164: remember the family's time zone on an admissions-call booking, so the
-- confirmation, reminder, reschedule and cancellation emails can state the
-- time in the family's own zone with UK time alongside. Set by the public
-- booking page (book-admissions-call). Null for older bookings, which keep
-- showing UK time only. Idempotent.
alter table public.bookings add column if not exists contact_timezone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_contact_timezone_len' and conrelid = 'public.bookings'::regclass) then
    alter table public.bookings add constraint bookings_contact_timezone_len
      check (contact_timezone is null or char_length(contact_timezone) between 1 and 64);
  end if;
end $$;

comment on column public.bookings.contact_timezone is
  'IANA time zone the family chose on the booking page (e.g. Asia/Dubai); emails show the time in this zone and in UK time.';
