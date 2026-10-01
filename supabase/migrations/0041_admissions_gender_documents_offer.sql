-- 0041: admissions v2.
--  * gender: required (Male/Female) for NEW public applications; old rows
--    stay valid (column is nullable and has no table-level check, so staff can
--    still edit legacy rows that hold free text).
--  * offer-stage fee tracking (admin/registration fee + deposit) and the
--    "accepted -> accounts created" links.
--  * private storage bucket 'admissions-documents' for school reports.
--
-- Fees policy (also documented in the admin UI): the assessment is free; the
-- admin (registration) fee AND the deposit are requested at the OFFER stage as
-- a condition of acceptance. The place is held only once both are received,
-- by the offer deadline.

alter table public.admissions_applications
  add column offer_made_at date,
  add column offer_deadline date,
  add column admin_fee_amount numeric(10,2) check (admin_fee_amount is null or admin_fee_amount >= 0),
  add column admin_fee_received boolean not null default false,
  add column admin_fee_received_at date,
  add column deposit_amount numeric(10,2) check (deposit_amount is null or deposit_amount >= 0),
  add column deposit_received_at date,
  -- results of "Accept & create accounts" (idempotency anchors)
  add column parent_profile_id uuid references public.profiles(id) on delete set null,
  add column child_id uuid references public.children(id) on delete set null,
  add column student_profile_id uuid references public.profiles(id) on delete set null,
  add column accounts_created_at timestamptz;

-- Default deposit amount (the admin fee default is the existing
-- site_settings.registration_fee).
alter table public.site_settings add column admissions_deposit_amount numeric(10,2);

-- Public form: clean row only. Gender must be Male or Female for new
-- applications; staff-owned fields can't be pre-filled by families.
alter policy "admissions_applications: public can apply"
  on public.admissions_applications
  with check (
    status = 'new'
    and consent_contact is true
    and consent_data is true
    and child_gender in ('Male', 'Female')
    and notes is null
    and assigned_to is null
    and assessment_at is null
    and interview_at is null
    and report_received is false
    and deposit_received is false
    and id_documents_received is false
    and decision_note is null
    and offer_made_at is null
    and offer_deadline is null
    and admin_fee_amount is null
    and admin_fee_received is false
    and admin_fee_received_at is null
    and deposit_amount is null
    and deposit_received_at is null
    and parent_profile_id is null
    and child_id is null
    and student_profile_id is null
    and accounts_created_at is null
  );

-- ── correspondence log ───────────────────────────────────────────────────
-- Rows are written ONLY by the admissions-correspond Edge Function (service
-- role), so there is deliberately no insert policy for clients.
create table public.admissions_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admissions_applications(id) on delete cascade,
  template text not null check (char_length(template) <= 40),
  subject text not null check (char_length(subject) <= 300),
  body text not null check (char_length(body) <= 20000),
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  email_sent boolean not null default false,
  email_error text
);

create index admissions_messages_app_idx on public.admissions_messages (application_id, sent_at desc);

alter table public.admissions_messages enable row level security;

create policy "admissions_messages: staff read"
  on public.admissions_messages for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create trigger audit_admissions_messages
  after insert or update or delete on public.admissions_messages
  for each row execute function public.audit_row_change();

-- ── documents (school reports) ───────────────────────────────────────────
-- Design: the public form already generates the application id client-side
-- (anon cannot read rows back). After the application row is inserted, the
-- browser uploads each PDF to '<application_id>/<random uuid>.pdf'.
--   * anon may only INSERT (no select/list/update/delete, so nothing can be
--     read, overwritten or enumerated; uploads use upsert:false);
--   * path must match <uuid>/<uuid>.pdf exactly;
--   * the application must exist, be < 1 hour old and have < 5 files, checked
--     by a SECURITY DEFINER function (anon can't read the table itself) —
--     so spam is bounded to people who actually submitted an application;
--   * bucket-level limits: private, 10 MB, application/pdf only.
-- Staff (Headteacher/Admin/Admissions) can read via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admissions-documents', 'admissions-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

create or replace function public.admissions_upload_allowed(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
  v_app uuid;
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$' then
    return false;
  end if;
  v_app := split_part(p_name, '/', 1)::uuid;
  if not exists (
    select 1 from public.admissions_applications a
    where a.id = v_app and a.status = 'new' and a.created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'admissions-documents' and split_part(o.name, '/', 1) = v_app::text
  ) < 5;
end;
$$;
grant execute on function public.admissions_upload_allowed(text) to anon, authenticated;

create policy "admissions-documents: public can upload for a fresh application"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'admissions-documents' and public.admissions_upload_allowed(name));

create policy "admissions-documents: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'admissions-documents' and public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create policy "admissions-documents: head/admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'admissions-documents' and public.current_has_role(array['head_teacher', 'admin']));

-- Audit trail for viewing a document (signed URLs are minted client-side, so
-- the viewer calls this first; it only records for staff).
create or replace function public.admissions_log_document_access(p_application_id uuid, p_path text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'admissions']) then
    raise exception 'not allowed';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (auth.uid(), v_email, 'DOCUMENT_' || upper(left(coalesce(p_action, 'view'), 20)), 'admissions_documents',
          p_application_id::text, jsonb_build_object('path', p_path));
end;
$$;
grant execute on function public.admissions_log_document_access(uuid, text, text) to authenticated;
