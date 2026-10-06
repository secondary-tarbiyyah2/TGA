-- 0086: live website policies and uploaded documents to sign.
--
-- 1. LIVE POLICIES. The marketing site is a static export, so until now an
--    edit to a policy only reached visitors after a rebuild. policy_links is
--    already publicly readable (RLS hides soft-deleted rows), so the site now
--    re-reads it in the visitor's browser with the anon key and shows the
--    build-time copy only as the first paint / fallback. What was missing:
--      * a stable slug per policy, so every policy has a permanent address
--        on the main site: /policies/<slug>.pdf (or .docx). The address is
--        served by deploy/policy.php, which streams the file from storage
--        via the policy-file Edge Function, so no supabase.co link is shown.
--      * columns describing an uploaded file (file_path in the existing
--        public policy-documents bucket, original name, kind, and the text
--        extracted from a Word file so it can still be signed/previewed).
--    The bucket now also accepts .docx.
--
-- 2. DOCUMENTS TO SIGN can be uploaded: a PDF (the signing target) or a
--    Word file (.docx). The original always goes in a PRIVATE bucket
--    (signable-documents). A PDF is stamped and signed as before; a .docx
--    is kept as the original and its text is extracted into `body`, which
--    the existing signed-copy builder turns into a clean PDF. Signers may
--    read the file only while it is a document they must sign
--    (signable_file_readable); Headteacher/Admin read and manage all.
--    The version identifier (current_asset_id) now includes the storage
--    path, so replacing the file makes everyone outstanding again.
--
-- Idempotent: safe to re-run.

-- ═══ 1. policy_links ═══════════════════════════════════════════════════════

alter table public.policy_links
  add column if not exists slug text,
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_kind text,
  add column if not exists file_updated_at timestamptz,
  add column if not exists extracted_text text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'policy_links_file_kind_check') then
    alter table public.policy_links add constraint policy_links_file_kind_check
      check (file_kind is null or file_kind in ('pdf', 'docx'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'policy_links_slug_format') then
    alter table public.policy_links add constraint policy_links_slug_format
      check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{0,118}$');
  end if;
end $$;

-- Existing rows keep the address they already have: /policies/<stem>.pdf
-- becomes the slug <stem>; anything else is derived from number + title.
update public.policy_links
set slug = coalesce(
  substring(file_url from '^/policies/([a-z0-9][a-z0-9-]*)\.(?:pdf|docx)$'),
  nullif(trim(both '-' from regexp_replace(lower(coalesce(number, '') || '-' || coalesce(title, '')), '[^a-z0-9]+', '-', 'g')), ''),
  'policy'
)
where slug is null;

-- Two rows can end up with the same slug (e.g. two policies pointing at the
-- same file): the later one gets a short suffix so the unique index holds.
update public.policy_links p
set slug = p.slug || '-' || substr(p.id::text, 1, 6)
where p.slug is not null
  and exists (select 1 from public.policy_links q where q.slug = p.slug and q.id < p.id);

create unique index if not exists policy_links_slug_key on public.policy_links (slug) where slug is not null;

create or replace function public.policy_links_set_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base := coalesce(
      nullif(trim(both '-' from regexp_replace(lower(coalesce(new.number, '') || '-' || coalesce(new.title, '')), '[^a-z0-9]+', '-', 'g')), ''),
      'policy'
    );
    base := left(base, 100);
    candidate := base;
    while exists (select 1 from public.policy_links where slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    new.slug := candidate;
  else
    new.slug := lower(btrim(new.slug));
  end if;
  return new;
end;
$$;

drop trigger if exists policy_links_set_slug_trg on public.policy_links;
create trigger policy_links_set_slug_trg
  before insert on public.policy_links
  for each row execute function public.policy_links_set_slug();

-- The public bucket now also takes Word files. Read stays public (these are
-- public website policies); writes stay Headteacher/Admin only (0048).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'policy-documents', 'policy-documents', true, 20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 20971520,
      allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

-- ═══ 2. signable_documents uploads ═════════════════════════════════════════

alter table public.signable_documents
  add column if not exists file_path text,       -- PDF in the private signable-documents bucket (the signing target)
  add column if not exists file_name text,       -- the name it was uploaded as
  add column if not exists original_path text,   -- the original .docx kept alongside (its text is in `body`)
  add column if not exists original_name text;

-- Same rule as 0028 plus the uploaded file: an uploaded PDF is versioned by
-- its (unique, timestamped) storage path, so replacing it makes everyone
-- outstanding again; the original Word file's path is mixed into the text
-- hash. A website policy's file now has a STABLE address
-- (/policies/<slug>.pdf), so for those rows the time the file was last
-- replaced (policy_links.file_updated_at) is part of the version instead.
create or replace function public.signable_documents_version()
returns trigger
language plpgsql
as $$
declare
  v_file_updated timestamptz;
begin
  if new.source <> 'sanity' then
    new.current_asset_id := coalesce(
      nullif(new.file_url, ''),
      case when new.file_path is not null then 'file:' || new.file_path end,
      'text-' || md5(coalesce(new.body, new.title) || coalesce(new.original_path, ''))
    );
    if new.source = 'policy' and new.policy_link_id is not null and nullif(new.file_url, '') is not null then
      select pl.file_updated_at into v_file_updated from public.policy_links pl where pl.id = new.policy_link_id;
      if v_file_updated is not null then
        new.current_asset_id := new.current_asset_id || '?v=' || floor(extract(epoch from v_file_updated) * 1000)::bigint;
      end if;
    end if;
    if (nullif(new.file_url, '') is not null or new.file_path is not null) and new.body is not null then
      new.current_asset_id := new.current_asset_id || '-' || md5(new.body);
    end if;
  end if;
  return new;
end;
$$;

-- Keeps the signature record of a website policy in step with the policy
-- itself (title, file address, extracted Word text), whoever edits it. The
-- update re-runs the version trigger above, so replacing the file asks
-- everyone who must sign it to sign the new version.
create or replace function public.policy_links_sync_signable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.signable_documents d
  set title = new.number || '. ' || new.title,
      file_url = new.file_url,
      body = case when new.file_kind = 'docx' then new.extracted_text else null end
  where d.source = 'policy'
    and (d.policy_link_id = new.id or d.sanity_document_id = 'policy:' || new.id::text);
  return new;
end;
$$;

drop trigger if exists policy_links_sync_signable_trg on public.policy_links;
create trigger policy_links_sync_signable_trg
  after update of number, title, file_url, file_path, file_kind, file_updated_at, extracted_text on public.policy_links
  for each row execute function public.policy_links_sync_signable();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signable-documents', 'signable-documents', false, 20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 20971520,
      allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

-- True for Headteacher/Admin, and for anyone whose role is one of the
-- target roles of a document that currently needs a signature and points at
-- this object. SECURITY DEFINER so it can read signable_documents/user_roles
-- regardless of the caller's own RLS (the storage policy only gets a boolean).
create or replace function public.signable_file_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin'])
    or exists (
      select 1
      from public.signable_documents d
      join public.user_roles ur on ur.user_id = auth.uid() and ur.role = any(d.target_roles)
      where d.requires_signature
        and (d.file_path = p_path or d.original_path = p_path)
    );
$$;

grant execute on function public.signable_file_readable(text) to authenticated;

drop policy if exists "signable-documents: read" on storage.objects;
create policy "signable-documents: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'signable-documents' and public.signable_file_readable(name));

drop policy if exists "signable-documents: headteacher/admin insert" on storage.objects;
create policy "signable-documents: headteacher/admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signable-documents' and public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "signable-documents: headteacher/admin update" on storage.objects;
create policy "signable-documents: headteacher/admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'signable-documents' and public.current_has_role(array['head_teacher', 'admin']))
  with check (bucket_id = 'signable-documents' and public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "signable-documents: headteacher/admin delete" on storage.objects;
create policy "signable-documents: headteacher/admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signable-documents' and public.current_has_role(array['head_teacher', 'admin']));
