-- 0059: signed PDFs. When a document is signed (portal) or recorded by hand,
-- the `document-signed-pdf` Edge Function stamps the original PDF with a
-- signature page + per-page footer and stores it privately here.

alter table public.document_signatures
  add column if not exists signed_pdf_path text,
  add column if not exists signed_pdf_at timestamptz;

-- Written only by the Edge Function (service role bypasses RLS). There is
-- deliberately no client update policy on document_signatures, so clients
-- cannot set or change these columns.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-documents', 'signed-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];

-- Object path: <signer_id>/<signature_id>.pdf
drop policy if exists "signed-documents: signer reads own" on storage.objects;
create policy "signed-documents: signer reads own" on storage.objects
  for select to authenticated
  using (bucket_id = 'signed-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "signed-documents: headteacher/admin read" on storage.objects;
create policy "signed-documents: headteacher/admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'signed-documents' and public.current_has_role(array['head_teacher', 'admin']));

-- No insert/update/delete policies: only the service role (Edge Function) writes.
