-- 0219: Stripe is the only way to pay (owner, 11 Nov 2026, T71). The old
-- payment instructions (bank account details) are no longer pasted into any
-- email (admissions-correspond/templating.ts), and site_settings is publicly
-- readable, so the bank details are removed from it.
alter table public.site_settings alter column payment_instructions set default 'Online payment details to follow.';
update public.site_settings set payment_instructions = 'Online payment details to follow.'
 where payment_instructions is distinct from 'Online payment details to follow.';
comment on column public.site_settings.payment_instructions is
  'No longer used (T71): fees are paid through Stripe only. Kept so older code reading it does not fail.';
