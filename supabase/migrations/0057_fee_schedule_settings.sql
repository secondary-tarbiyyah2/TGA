-- Fees: one source of truth.
-- Only fee_bands.annual_fee is edited. Termly / monthly amounts are DERIVED
-- in the app (src/lib/fees.ts) from the annual fee plus site-wide settings
-- added here. The old termly_fee / monthly_fee columns are kept for
-- back-compat but are now optional and ignored by the site.
-- Defaults follow the Fees Policy 2026-27 (shortened Jan-Jul 2027 period):
-- 2 termly payments, 7 monthly payments, GBP 100 application fee,
-- GBP 150 registration fee, 2% annual-payment discount.

alter table public.site_settings
  add column if not exists fee_terms int not null default 2
    check (fee_terms between 1 and 6),
  add column if not exists fee_instalments int not null default 7
    check (fee_instalments between 1 and 12),
  add column if not exists annual_discount_percent numeric not null default 2
    check (annual_discount_percent >= 0 and annual_discount_percent <= 100),
  add column if not exists payment_schedule_text text not null default
    'Termly payments are due on 19 December 2026 and 28 March 2027. Monthly payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 19 December 2026.';

-- application_fee / registration_fee already exist (0025) as nullable numerics.
alter table public.site_settings
  alter column application_fee set default 100,
  alter column registration_fee set default 150;

-- Correct existing rows: the old seed wrongly set the application fee to 247.
update public.site_settings set application_fee = 100 where application_fee is null or application_fee = 247;
update public.site_settings set registration_fee = 150 where registration_fee is null;

alter table public.fee_bands
  alter column termly_fee drop not null,
  alter column monthly_fee drop not null;

comment on column public.fee_bands.termly_fee is 'DEPRECATED - ignored. Derived from annual_fee / site_settings.fee_terms.';
comment on column public.fee_bands.monthly_fee is 'DEPRECATED - ignored. Derived from annual_fee / site_settings.fee_instalments.';
