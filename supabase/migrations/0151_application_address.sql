-- 0151: the pupil's home address on the online application.
--
-- The prospectus (p.17, "What we need from you") asks for "Proof of identity
-- and address for the pupil", but the form only had an optional free-text
-- address. The form now asks for a structured, required home address, and lets
-- the family upload a proof of address with their other documents.
--
--  1. Structured address columns on admissions_applications and
--     admissions_families. The existing free-text `address` column stays and
--     the form keeps filling it with the whole address on one line, so older
--     rows, the CSV export and the subject access export keep working.
--  2. Upload gate: a new document kind, address_proof (uploaded once per
--     family, against the first child's application, like the parent's ID),
--     and room for its files.
--  3. The offer email asks for proof of address alongside ID documents (only
--     where staff have not edited that sentence).
--
-- Idempotent: safe to run more than once.

-- ── 1. address columns ───────────────────────────────────────────────────
alter table public.admissions_applications
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists address_town text,
  add column if not exists address_postcode text,
  add column if not exists address_country text;

alter table public.admissions_families
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists address_town text,
  add column if not exists address_postcode text,
  add column if not exists address_country text;

-- Length limits (the form's own maxLength values). Added by name so a re-run
-- does not stack duplicate constraints.
do $$
declare
  t text;
begin
  foreach t in array array['admissions_applications', 'admissions_families'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_address_parts_length' and conrelid = ('public.' || t)::regclass) then
      execute format(
        'alter table public.%I add constraint %I check ('
        || 'coalesce(char_length(address_line1), 0) <= 120 and coalesce(char_length(address_line2), 0) <= 120 '
        || 'and coalesce(char_length(address_town), 0) <= 80 and coalesce(char_length(address_postcode), 0) <= 20 '
        || 'and coalesce(char_length(address_country), 0) <= 80)',
        t, t || '_address_parts_length'
      );
    end if;
  end loop;
end;
$$;

comment on column public.admissions_applications.address_line1 is 'Pupil''s home address, line 1 (required on the form since 0151).';
comment on column public.admissions_applications.address_line2 is 'Pupil''s home address, line 2 (optional).';
comment on column public.admissions_applications.address_town is 'Pupil''s home town or city.';
comment on column public.admissions_applications.address_postcode is 'Pupil''s postcode or ZIP; blank only for countries without postcodes.';
comment on column public.admissions_applications.address_country is 'Country the pupil lives in.';
comment on column public.admissions_applications.address is 'The whole home address on one line (the form fills it from the address_* columns since 0151; older rows only have this).';

-- ── 2. upload gate: address_proof kind ───────────────────────────────────
create or replace function public.admissions_upload_allowed(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
  v_app uuid;
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  -- <application_id>/[<kind>-]<uuid>.<pdf|jpg|png>, kind = report | parent_id | child_id | guardian_id | address_proof
  if p_name !~ ('^' || v_uuid || '/((report|parent_id|child_id|guardian_id|address_proof)-)?' || v_uuid || '\.(pdf|jpg|png)$') then
    return false;
  end if;
  v_app := split_part(p_name, '/', 1)::uuid;
  if not exists (
    select 1 from public.admissions_applications a
    where a.id = v_app and a.status = 'new' and a.created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;
  -- up to 5 reports + 3 parent IDs + 3 child IDs + 3 guardian IDs + 3 proofs of address, with a little headroom
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'admissions-documents' and split_part(o.name, '/', 1) = v_app::text
  ) < 20;
end;
$$;
grant execute on function public.admissions_upload_allowed(text) to anon, authenticated;

-- ── 3. offer email: ask for proof of address too ─────────────────────────
update public.admissions_email_templates
   set body = replace(
         body,
         'Please also send us ID documents for {{child_first_name}} and a parent or guardian (for example a passport or birth certificate) if you have not already.',
         'Please also send us ID documents for {{child_first_name}} and a parent or guardian (for example a passport or birth certificate), and proof of {{child_first_name}}''s home address (for example a recent utility bill, council tax bill or bank statement), if you have not already.'
       )
 where key = 'offer'
   and body like '%Please also send us ID documents for {{child_first_name}} and a parent or guardian (for example a passport or birth certificate) if you have not already.%';
