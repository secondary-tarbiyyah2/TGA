-- Documents & signatures managed inside the portal.
--
-- Until now signable_documents was filled only by the Sanity sync script,
-- so the school's website policies (policy_links, 0025) never showed up in
-- the admin portal and an admin couldn't ask anyone to sign anything
-- without Sanity. This lets Headteacher/Admin:
--   * flag any website policy as "needs a signature" (a row keyed
--     'policy:<policy_links.id>'), and
--   * create a document to sign directly (text and/or a file link), keyed
--     'portal:<uuid>'.
-- The Sanity sync keeps working for rows it owns (source = 'sanity').
--
-- Version identifier stays `current_asset_id`: for portal-managed rows a
-- trigger derives it from the file link / text, so editing the document
-- automatically makes everyone outstanding again for the new version,
-- exactly as a re-upload in Sanity does.

alter table public.signable_documents
  add column if not exists source text not null default 'sanity' check (source in ('sanity', 'policy', 'portal')),
  add column if not exists file_url text,
  add column if not exists body text,
  add column if not exists policy_link_id uuid references public.policy_links(id) on delete set null;

alter table public.signable_documents alter column current_asset_id drop not null;

create or replace function public.signable_documents_version()
returns trigger
language plpgsql
as $$
begin
  if new.source <> 'sanity' then
    new.current_asset_id := coalesce(nullif(new.file_url, ''), 'text-' || md5(coalesce(new.body, new.title)));
    if new.file_url is not null and new.body is not null then
      new.current_asset_id := new.current_asset_id || '-' || md5(new.body);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists signable_documents_version_trg on public.signable_documents;
create trigger signable_documents_version_trg
  before insert or update on public.signable_documents
  for each row execute function public.signable_documents_version();

create policy "signable_documents: headteacher/admin insert"
  on public.signable_documents for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']) and source in ('policy', 'portal'));

create policy "signable_documents: headteacher/admin update"
  on public.signable_documents for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) and source in ('policy', 'portal'))
  with check (public.current_has_role(array['head_teacher', 'admin']) and source in ('policy', 'portal'));

create policy "signable_documents: headteacher/admin delete portal docs"
  on public.signable_documents for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) and source = 'portal');

-- Headteachers can read the website policies in the portal too (the public
-- read policy already allows it; this just documents the intent).

-- Signing view now also carries what the signer needs to read the document.
create or replace view public.my_outstanding_signatures as
  select d.id as document_id, d.title, d.current_asset_id, d.file_url, d.body
  from public.signable_documents d
  join public.user_roles ur on ur.role = any(d.target_roles) and ur.user_id = auth.uid()
  where d.requires_signature = true
    and not exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.signer_id = auth.uid() and s.asset_id_signed = d.current_asset_id
    );

grant select on public.my_outstanding_signatures to authenticated;

-- Per-document progress for the admin page: how many people must sign the
-- current version, and how many have.
create or replace view public.document_signature_progress as
  select
    d.id as document_id,
    (select count(distinct ur.user_id) from public.user_roles ur where ur.role = any(d.target_roles)) as required_count,
    (select count(distinct s.signer_id) from public.document_signatures s where s.document_id = d.id and s.asset_id_signed = d.current_asset_id) as signed_count
  from public.signable_documents d
  where d.requires_signature = true
    and public.current_has_role(array['head_teacher', 'admin']);

grant select on public.document_signature_progress to authenticated;
