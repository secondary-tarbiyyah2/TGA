-- 0054: signatures recorded by hand (paper / in person / verbal) on behalf of
-- a person, by a Headteacher or Admin. Same table, same "current version"
-- logic, so outstanding views / progress / compliance count them as signed.

-- ── 1. Columns
alter table public.document_signatures
  add column if not exists method text not null default 'portal',
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists recorded_by_name text,
  add column if not exists recorded_at timestamptz not null default now(),
  add column if not exists evidence_path text,
  add column if not exists record_note text;

alter table public.document_signatures drop constraint if exists document_signatures_method_check;
alter table public.document_signatures
  add constraint document_signatures_method_check check (method in ('portal', 'paper', 'in_person', 'verbal'));

-- ── 2. Receipt / provenance trigger (replaces 0047's function). Portal
-- signatures keep the exact original hash input; hand-recorded ones also
-- cover the method so it cannot be changed unnoticed.
create or replace function public.document_signatures_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d public.signable_documents;
begin
  select * into d from public.signable_documents where id = new.document_id;
  new.document_title_signed := d.title;

  if new.method = 'portal' then
    new.recorded_by := null;
    new.recorded_by_name := null;
    new.evidence_path := null;
    new.record_note := null;
    new.recorded_at := now();
  else
    if not public.current_has_role(array['head_teacher', 'admin']) then
      raise exception 'Only a Headteacher or Admin can record a signature on behalf of someone';
    end if;
    if new.signed_at > now() + interval '5 minutes' then
      raise exception 'The signing date cannot be in the future';
    end if;
    new.recorded_by := auth.uid();
    new.recorded_at := now();
    select full_name into new.recorded_by_name from public.profiles where id = auth.uid();
    if new.evidence_path is not null and new.evidence_path not like d.id::text || '/' || new.signer_id::text || '/%' then
      raise exception 'Scan path does not belong to this document and person';
    end if;
  end if;

  new.content_hash := encode(sha256(convert_to(concat_ws('|',
    d.title,
    new.asset_id_signed,
    coalesce(d.file_url, ''),
    md5(coalesce(d.body, '')),
    new.signer_id::text,
    new.typed_full_name,
    to_char(new.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ) || case when new.method = 'portal' then '' else '|' || new.method end, 'UTF8')), 'hex');
  return new;
end;
$$;

-- ── 3. RLS: users sign only as themselves (portal); Headteacher/Admin may
-- insert hand-recorded rows for anyone. No update/delete policy exists.
drop policy if exists "document_signatures: sign as self, current version only" on public.document_signatures;
create policy "document_signatures: sign as self, current version only"
  on public.document_signatures for insert
  to authenticated
  with check (
    affirmed = true
    and exists (
      select 1 from public.signable_documents d
      where d.id = document_signatures.document_id
        and d.requires_signature = true
        and d.current_asset_id = document_signatures.asset_id_signed
    )
    and (
      (signer_id = auth.uid() and method = 'portal')
      or (method <> 'portal' and public.current_has_role(array['head_teacher', 'admin']))
    )
  );

-- audit trigger already exists from 0014 (audit_document_signatures, after insert)

-- ── 4. Private bucket for scans of signed paper copies (staff only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-paper-copies', 'signed-paper-copies', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "signed-paper-copies: headteacher/admin read" on storage.objects;
create policy "signed-paper-copies: headteacher/admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'signed-paper-copies' and public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "signed-paper-copies: headteacher/admin insert" on storage.objects;
create policy "signed-paper-copies: headteacher/admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signed-paper-copies' and public.current_has_role(array['head_teacher', 'admin']));
-- deliberately no update/delete policy: evidence is append-only.
