-- Admissions: ID uploads, payment-plan intent, siblings, and the correct fees.
--
-- 1. Fees Policy 2026-27 is authoritative: application fee 100, registration
--    fee 150. Earlier data held a stale registration fee (36), and the public
--    pages used to say the assessment was free. The pages now read these two
--    site_settings values (editable in /learn/admin/content -> Fees).
-- 2. The public application form now collects parent/guardian photo ID and the
--    child's ID (passport or birth certificate) up front, using the same
--    anonymous-upload design as the school report (migration 0041): the
--    browser uploads after the application row exists, anon can insert only.
--    Allowed types widen from PDF to PDF/JPG/PNG (10 MB each); the kind of
--    document is tagged in the file name:
--        <application_id>/<kind>-<uuid>.<pdf|jpg|png>
--    where kind is report | parent_id | child_id. Legacy '<application_id>/<uuid>.pdf'
--    names (no kind prefix) are still accepted and mean "report".
-- 3. The form also records the payment plan the family intends to use, how many
--    children are applying, and the other children's names/year groups, which
--    feed the sibling discount and the fee estimate.

-- ── 1. fees ──────────────────────────────────────────────────────────────
update public.site_settings
   set application_fee = 100,
       registration_fee = 150
 where id = true;

alter table public.site_settings
  alter column application_fee set default 100,
  alter column registration_fee set default 150;

-- ── 2. application columns (public form fills these; all optional/defaulted) ─
alter table public.admissions_applications
  add column if not exists payment_plan_intent text
    check (payment_plan_intent is null or payment_plan_intent in ('annual', 'termly', 'monthly')),
  add column if not exists children_applying int not null default 1
    check (children_applying between 1 and 6),
  -- other children applying with this one: [{ "name": "...", "year_group": "..." }]
  add column if not exists sibling_applicants jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sibling_applicants) = 'array' and jsonb_array_length(sibling_applicants) <= 5);

comment on column public.admissions_applications.payment_plan_intent is 'Plan the family intends to use: annual | termly | monthly (intent only; confirmed on acceptance).';
comment on column public.admissions_applications.children_applying is 'Total number of children applying together (1-6), including this one.';
comment on column public.admissions_applications.sibling_applicants is 'Other children applying together: [{name, year_group}].';

-- ── 3. storage: bucket + upload gate ─────────────────────────────────────
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'],
       file_size_limit = 10485760,
       public = false
 where id = 'admissions-documents';

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
  -- <application_id>/[<kind>-]<uuid>.<pdf|jpg|png>, kind = report | parent_id | child_id
  if p_name !~ ('^' || v_uuid || '/((report|parent_id|child_id)-)?' || v_uuid || '\.(pdf|jpg|png)$') then
    return false;
  end if;
  v_app := split_part(p_name, '/', 1)::uuid;
  if not exists (
    select 1 from public.admissions_applications a
    where a.id = v_app and a.status = 'new' and a.created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;
  -- up to 5 reports + 3 parent IDs + 3 child IDs, with a little headroom
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'admissions-documents' and split_part(o.name, '/', 1) = v_app::text
  ) < 12;
end;
$$;
grant execute on function public.admissions_upload_allowed(text) to anon, authenticated;
