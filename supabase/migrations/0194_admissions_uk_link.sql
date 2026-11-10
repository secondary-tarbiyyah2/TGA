-- 0194: the pupil's link to a UK local council, captured on the application.
--
-- Abdul asked that the form find out whether a child lives in, or has lived
-- in, the UK, so the school knows which local council to contact if anything
-- happens, including for a family now living abroad. The form now:
--   * looks up the council for a UK home postcode (postcodes.io) and saves it;
--   * asks a family abroad whether the child has ever lived in the UK and, if
--     so, the last UK postcode (and optionally the address), with its council;
--   * asks, per child, whether the child is a British citizen.
--
-- Plain columns on the existing tables, covered by their existing RLS (the
-- public form can insert, only admissions staff can read). Idempotent.

do $$
declare
  t text;
begin
  foreach t in array array['admissions_applications', 'admissions_families'] loop
    execute format('alter table public.%I add column if not exists local_authority text', t);
    execute format('alter table public.%I add column if not exists lived_in_uk boolean', t);
    execute format('alter table public.%I add column if not exists last_uk_postcode text', t);
    execute format('alter table public.%I add column if not exists last_uk_address text', t);
    execute format('alter table public.%I add column if not exists last_uk_local_authority text', t);
    if not exists (select 1 from pg_constraint where conname = t || '_uk_link_length' and conrelid = ('public.' || t)::regclass) then
      execute format(
        'alter table public.%I add constraint %I check ('
        || 'coalesce(char_length(local_authority), 0) <= 120 and coalesce(char_length(last_uk_postcode), 0) <= 10 '
        || 'and coalesce(char_length(last_uk_address), 0) <= 200 and coalesce(char_length(last_uk_local_authority), 0) <= 120)',
        t, t || '_uk_link_length'
      );
    end if;
  end loop;
end;
$$;

alter table public.admissions_applications add column if not exists british_national boolean;

comment on column public.admissions_applications.local_authority is 'Local council for the pupil''s UK home postcode (looked up on the form). Null when the home is outside the UK or the lookup failed.';
comment on column public.admissions_applications.lived_in_uk is 'True if the pupil lives in, or has lived in, the UK; false if the family said never; null on older rows.';
comment on column public.admissions_applications.last_uk_postcode is 'For a family abroad: the postcode of the pupil''s last UK address.';
comment on column public.admissions_applications.last_uk_address is 'For a family abroad: the last UK address (optional).';
comment on column public.admissions_applications.last_uk_local_authority is 'For a family abroad: the local council for the last UK address.';
comment on column public.admissions_applications.british_national is 'The family''s answer to "Is your child a British citizen?" Null on older rows.';
