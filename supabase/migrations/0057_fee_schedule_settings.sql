-- Fees: one source of truth.
-- Only fee_bands.annual_fee is edited. Termly / monthly amounts are DERIVED
-- in the app (src/lib/fees.ts) from the annual fee plus two site-wide
-- settings added here. The old termly_fee / monthly_fee columns are kept for
-- back-compat but are now optional and ignored by the site.

alter table public.site_settings
  add column if not exists fee_terms int not null default 3
    check (fee_terms between 1 and 6),
  add column if not exists fee_instalments int not null default 12
    check (fee_instalments between 1 and 12);

alter table public.fee_bands
  alter column termly_fee drop not null,
  alter column monthly_fee drop not null;

comment on column public.fee_bands.termly_fee is 'DEPRECATED - ignored. Derived from annual_fee / site_settings.fee_terms.';
comment on column public.fee_bands.monthly_fee is 'DEPRECATED - ignored. Derived from annual_fee / site_settings.fee_instalments.';
