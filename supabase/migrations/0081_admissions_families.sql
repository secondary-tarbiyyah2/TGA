-- 0081: admissions families (several children, one application form), a
-- separate legal guardian per child when needed, the default assignee, and
-- the settings automatic account creation reads.
--
--  1. admissions_families: one shared parent contact record per submission.
--     Each child still gets their OWN admissions_applications row (so each
--     child moves through the pipeline separately), linked by family_id and
--     ordered by sibling_index (1 = the child the parent ID was uploaded for).
--     The parent's photo ID is asked ONCE and stored against the lead
--     application; the other children show "same as above".
--  2. admissions_applications: family_id, sibling_index and an optional
--     per-child legal guardian block (blended families / different legal
--     guardians). guardian_is_other = false means "same as the parent above".
--  3. New applications default to the "Admissions Team" staff member as the
--     assignee (a BEFORE INSERT trigger; clients cannot choose another).
--  4. Upload gate: a new document kind, guardian_id, and a slightly higher
--     per-application file cap.
--  5. admissions_stage_details: the class enrolments and student-login choice
--     that automatic account creation applies when an application is accepted.
--  6. The 'received' email template gains an optional {{family_fees}} block.
--
-- Anonymous visitors can INSERT a family and its applications but can read
-- nothing back (same design as 0032/0041): the browser generates the ids.
-- Safe to re-run.

-- ── 1. families ──────────────────────────────────────────────────────────
create table if not exists public.admissions_families (
  id uuid primary key default gen_random_uuid(),
  -- The first child's application (holds the parent ID upload). Deliberately
  -- NOT a foreign key: the family row is inserted before the applications.
  lead_application_id uuid,
  parent_name text not null check (char_length(parent_name) between 1 and 120),
  parent_email text not null check (char_length(parent_email) between 3 and 254 and position('@' in parent_email) > 1),
  parent_phone text not null check (char_length(parent_phone) between 5 and 40),
  relationship text check (char_length(relationship) <= 60),
  address text check (char_length(address) <= 500),
  children_count int not null default 1 check (children_count between 1 and 6),
  -- Numbers only, shown to the family on the form and used to fill the
  -- confirmation email. An ESTIMATE, never used for billing:
  --   { "plan": "annual", "perChild": [{ "gross": 1596, "siblingDiscount": 0, "net": 1596 }],
  --     "total": 1564.08, "totalDiscount": 31.92, "siblingPercent": 10 }
  fee_snapshot jsonb check (fee_snapshot is null or (jsonb_typeof(fee_snapshot) = 'object' and pg_column_size(fee_snapshot) < 4000)),
  created_at timestamptz not null default now()
);

alter table public.admissions_families enable row level security;

drop policy if exists "admissions_families: public can create" on public.admissions_families;
create policy "admissions_families: public can create"
  on public.admissions_families for insert
  to anon, authenticated
  with check (children_count between 1 and 6);

drop policy if exists "admissions_families: staff read" on public.admissions_families;
create policy "admissions_families: staff read"
  on public.admissions_families for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "admissions_families: staff update" on public.admissions_families;
create policy "admissions_families: staff update"
  on public.admissions_families for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "admissions_families: head/admin delete" on public.admissions_families;
create policy "admissions_families: head/admin delete"
  on public.admissions_families for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop trigger if exists audit_admissions_families on public.admissions_families;
create trigger audit_admissions_families
  after insert or update or delete on public.admissions_families
  for each row execute function public.audit_row_change();

-- ── 2. application columns ───────────────────────────────────────────────
alter table public.admissions_applications
  add column if not exists family_id uuid references public.admissions_families(id) on delete set null,
  add column if not exists sibling_index int check (sibling_index is null or sibling_index between 1 and 6),
  add column if not exists guardian_is_other boolean not null default false,
  add column if not exists guardian_name text check (char_length(guardian_name) between 1 and 120),
  add column if not exists guardian_relationship text check (char_length(guardian_relationship) <= 60),
  add column if not exists guardian_email text check (char_length(guardian_email) between 3 and 254 and position('@' in guardian_email) > 1),
  add column if not exists guardian_phone text check (char_length(guardian_phone) between 5 and 40),
  add column if not exists guardian_address text check (char_length(guardian_address) <= 500);

alter table public.admissions_applications drop constraint if exists admissions_applications_guardian_complete;
alter table public.admissions_applications
  add constraint admissions_applications_guardian_complete
  check (guardian_is_other is false or (guardian_name is not null and guardian_email is not null and guardian_phone is not null));

create index if not exists admissions_applications_family_idx on public.admissions_applications (family_id, sibling_index) where family_id is not null;

comment on column public.admissions_applications.family_id is 'Sibling group: applications submitted together by one parent share a family (admissions_families).';
comment on column public.admissions_applications.sibling_index is '1 = first child on the form (the parent ID upload is stored against this application).';
comment on column public.admissions_applications.guardian_is_other is 'True when this child''s legal parent or guardian is someone other than the family contact; the guardian_* columns then hold their details.';

-- ── 3. default assignee ──────────────────────────────────────────────────
create or replace function public.admissions_default_assignee()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sm.profile_id
  from public.staff_members sm
  where lower(sm.display_name) = 'admissions team'
  order by sm.created_at, sm.profile_id
  limit 1;
$$;

-- Same function as 0032, plus the default assignee. A client may leave
-- assigned_to empty (the default is then applied) or send the default itself;
-- the policy below refuses anything else.
create or replace function public.admissions_applications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  new.reference := 'TGA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admissions_reference_seq')::text, 4, '0');
  if new.assigned_to is null then
    new.assigned_to := public.admissions_default_assignee();
  end if;
  return new;
end;
$$;

alter policy "admissions_applications: public can apply"
  on public.admissions_applications
  with check (
    status = 'new'
    and consent_contact is true
    and consent_data is true
    and child_gender in ('Male', 'Female')
    and notes is null
    and (assigned_to is null or assigned_to = public.admissions_default_assignee())
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

-- Applications still open and nobody's: give them to the Admissions Team.
update public.admissions_applications
   set assigned_to = public.admissions_default_assignee()
 where assigned_to is null
   and status in ('new', 'reviewing', 'assessment', 'interview', 'offered')
   and public.admissions_default_assignee() is not null;

-- ── 4. upload gate: guardian_id kind, higher cap ─────────────────────────
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
  -- <application_id>/[<kind>-]<uuid>.<pdf|jpg|png>, kind = report | parent_id | child_id | guardian_id
  if p_name !~ ('^' || v_uuid || '/((report|parent_id|child_id|guardian_id)-)?' || v_uuid || '\.(pdf|jpg|png)$') then
    return false;
  end if;
  v_app := split_part(p_name, '/', 1)::uuid;
  if not exists (
    select 1 from public.admissions_applications a
    where a.id = v_app and a.status = 'new' and a.created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;
  -- up to 5 reports + 3 parent IDs + 3 child IDs + 3 guardian IDs, with a little headroom
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'admissions-documents' and split_part(o.name, '/', 1) = v_app::text
  ) < 16;
end;
$$;
grant execute on function public.admissions_upload_allowed(text) to anon, authenticated;

-- ── 5. automatic account creation settings (staff-only table) ────────────
alter table public.admissions_stage_details
  add column if not exists account_class_ids uuid[] not null default '{}',
  add column if not exists account_student_login boolean not null default true;

comment on column public.admissions_stage_details.account_class_ids is 'Classes the child is enrolled in automatically when the application is accepted (a child can be in several).';
comment on column public.admissions_stage_details.account_student_login is 'Create a username + password login for the child automatically on acceptance.';

-- ── 6. the received email: optional family fee block ─────────────────────
-- Inserted only where the template does not mention it yet, and only next to
-- the unchanged anchor sentence, so staff edits are never overwritten.
update public.admissions_email_templates
   set body = replace(
         body,
         'Our admissions team will review the application and contact you',
         E'{{#family_fees}}\n{{family_fees}}\n{{/family_fees}}\n\nOur admissions team will review the application and contact you'
       )
 where key = 'received'
   and body not like '%{{family_fees}}%'
   and body like '%Our admissions team will review the application and contact you%';
