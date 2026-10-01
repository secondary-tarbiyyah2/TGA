-- 0064: handwritten (drawn) signatures. The signer draws their signature with
-- finger / mouse / stylus; the transparent PNG is stored privately and embedded
-- in the signed PDF and shown on the receipt. The typed full name stays
-- required.
--
-- Hash decision: the existing content_hash input (0047/0054) is left UNCHANGED
-- so every earlier receipt still verifies. The image is bound to the record
-- by its own SHA-256 in `signature_image_sha256` instead.

-- ── 1. Columns on document_signatures
alter table public.document_signatures
  add column if not exists signature_image_path text,
  add column if not exists signature_image_sha256 text;

-- The image must live at <signer_id>/<signature_id>.png so it can only ever
-- belong to the person and row it was captured for.
create or replace function public.document_signatures_image_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.signature_image_path is null then
    new.signature_image_sha256 := null;
  else
    if new.signature_image_path <> new.signer_id::text || '/' || new.id::text || '.png' then
      raise exception 'Signature image path does not belong to this signature';
    end if;
    if new.signature_image_sha256 is not null and new.signature_image_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid signature image hash';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists document_signatures_image_check on public.document_signatures;
create trigger document_signatures_image_check
  before insert on public.document_signatures
  for each row execute function public.document_signatures_image_check();

-- ── 2. Saved default signature ("Save my signature for next time")
create table if not exists public.user_signatures (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  image_path text not null,
  image_sha256 text,
  updated_at timestamptz not null default now(),
  check (image_path = user_id::text || '/default.png')
);

alter table public.user_signatures enable row level security;

drop policy if exists "user_signatures: read own" on public.user_signatures;
create policy "user_signatures: read own" on public.user_signatures
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "user_signatures: insert own" on public.user_signatures;
create policy "user_signatures: insert own" on public.user_signatures
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "user_signatures: update own" on public.user_signatures;
create policy "user_signatures: update own" on public.user_signatures
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_signatures: delete own" on public.user_signatures;
create policy "user_signatures: delete own" on public.user_signatures
  for delete to authenticated using (user_id = auth.uid());

-- ── 3. Private bucket. Paths: <user_id>/<signature_id>.png and <user_id>/default.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-images', 'signature-images', false, 1048576, array['image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/png'];

drop policy if exists "signature-images: signer inserts own" on storage.objects;
create policy "signature-images: signer inserts own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signature-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "signature-images: signer reads own" on storage.objects;
create policy "signature-images: signer reads own" on storage.objects
  for select to authenticated
  using (bucket_id = 'signature-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Only the saved default may be replaced; per-signature images are append-only.
drop policy if exists "signature-images: signer updates own default" on storage.objects;
create policy "signature-images: signer updates own default" on storage.objects
  for update to authenticated
  using (bucket_id = 'signature-images' and name = auth.uid()::text || '/default.png')
  with check (bucket_id = 'signature-images' and name = auth.uid()::text || '/default.png');

drop policy if exists "signature-images: signer deletes own default" on storage.objects;
create policy "signature-images: signer deletes own default" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signature-images' and name = auth.uid()::text || '/default.png');

drop policy if exists "signature-images: headteacher/admin read" on storage.objects;
create policy "signature-images: headteacher/admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'signature-images' and public.current_has_role(array['head_teacher', 'admin']));

-- Staff capturing a signature in person on a school tablet store it under the
-- signer's folder. Only the per-signature <uuid>.png form, never default.png.
drop policy if exists "signature-images: headteacher/admin insert for in-person" on storage.objects;
create policy "signature-images: headteacher/admin insert for in-person" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signature-images'
    and public.current_has_role(array['head_teacher', 'admin'])
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'
  );
