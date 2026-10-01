-- 0048: website policy editor support.
--  * policy_links gets soft-delete (deleted_at/deleted_by). The public read
--    policy now hides removed rows, so getPolicyLinks() (the website) stops
--    listing them; staff can still read them (to restore).
--  * Headteacher/Admin (user_roles) may write policy_links. Until now only
--    profiles.role = 'admin' could, so a Headteacher's edits silently failed.
--  * Storage bucket `policy-documents` for uploading a PDF instead of
--    pasting a URL. Public read (these are public website policies); only
--    Headteacher/Admin can upload/replace/delete.
-- Idempotent.

alter table public.policy_links
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "policy_links: public read" on public.policy_links;
create policy "policy_links: public read" on public.policy_links
  for select using (deleted_at is null);

drop policy if exists "policy_links: staff read all" on public.policy_links;
create policy "policy_links: staff read all" on public.policy_links
  for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']) or public.current_role_is(array['admin']));

drop policy if exists "policy_links: headteacher/admin write" on public.policy_links;
create policy "policy_links: headteacher/admin write" on public.policy_links
  for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- ── storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('policy-documents', 'policy-documents', true, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists "policy-documents: public read" on storage.objects;
create policy "policy-documents: public read" on storage.objects
  for select using (bucket_id = 'policy-documents');

drop policy if exists "policy-documents: headteacher/admin insert" on storage.objects;
create policy "policy-documents: headteacher/admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'policy-documents' and public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "policy-documents: headteacher/admin update" on storage.objects;
create policy "policy-documents: headteacher/admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'policy-documents' and public.current_has_role(array['head_teacher', 'admin']))
  with check (bucket_id = 'policy-documents' and public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "policy-documents: headteacher/admin delete" on storage.objects;
create policy "policy-documents: headteacher/admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'policy-documents' and public.current_has_role(array['head_teacher', 'admin']));
