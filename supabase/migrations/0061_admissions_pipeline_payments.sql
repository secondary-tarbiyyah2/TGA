-- 0061: admissions pipeline v3 - remote supervised assessment, interview,
-- offer-by-email and proof-of-payment.
--
--  1. 'reviewing' stage added to admissions_applications.status.
--  2. admissions_stage_details: one staff-only row per application holding the
--     assessment checklist, interview details, offer/start date, fee-plan
--     choices and the HASHED public payment-upload token. Kept OFF the main
--     table on purpose: the anonymous "public can apply" insert policy can then
--     never be used to pre-fill staff-owned or token fields.
--  3. site_settings: payment_instructions (bank details, owner-editable),
--     default assessment / interview join links, assessment duration text.
--  4. admissions_payment_proofs + private bucket 'admissions-payments'.
--     Rows and files are written ONLY by the admissions-payment-proof Edge
--     Function (service role); staff read + verify/reject. No anon access.
--  Audit triggers on every new table. Fee flags are synced by 0062.

-- ── 1. status ────────────────────────────────────────────────────────────
alter table public.admissions_applications
  drop constraint if exists admissions_applications_status_check;
alter table public.admissions_applications
  add constraint admissions_applications_status_check
  check (status in ('new', 'reviewing', 'assessment', 'interview', 'offered', 'accepted', 'waitlisted', 'declined', 'withdrawn'));

-- ── 3. site settings ─────────────────────────────────────────────────────
alter table public.site_settings
  add column if not exists payment_instructions text not null default
'Bank transfer to:
Account name: An Noor Islamic School
Account number: 30775732
Sort code: 23-05-80
Payment reference: the child''s full name (as on the application)',
  add column if not exists assessment_join_url text,
  add column if not exists interview_join_url text,
  add column if not exists assessment_duration_text text not null default 'about 60 to 90 minutes';

comment on column public.site_settings.payment_instructions is 'Bank/payment instructions inserted into offer emails. Source: Fees Policy PDF. NOTE site_settings is publicly readable.';

-- ── 2. stage details ─────────────────────────────────────────────────────
create table public.admissions_stage_details (
  application_id uuid primary key references public.admissions_applications(id) on delete cascade,

  -- remote supervised assessment
  assessment_platform text check (char_length(assessment_platform) <= 200),     -- e.g. GL Assessment / Testwise, ISEB Common Pre-Test, CEM Select, internal
  assessment_link text check (char_length(assessment_link) <= 500),             -- Teams/Zoom/other; falls back to site_settings.assessment_join_url
  assessment_duration_text text check (char_length(assessment_duration_text) <= 100),
  assessment_invigilator uuid references public.profiles(id) on delete set null,
  assessment_started_at timestamptz,
  assessment_finished_at timestamptz,
  assessment_id_verified boolean not null default false,
  assessment_camera_on boolean not null default false,
  assessment_irregularities text check (char_length(assessment_irregularities) <= 5000),
  assessment_raw_score text check (char_length(assessment_raw_score) <= 60),
  assessment_standard_score text check (char_length(assessment_standard_score) <= 60),
  assessment_recommendation text check (char_length(assessment_recommendation) <= 2000),
  assessment_results_path text,                                                 -- path in admissions-documents bucket
  assessment_emailed_at timestamptz,

  -- interview
  interview_interviewer text check (char_length(interview_interviewer) <= 200),
  interview_link text check (char_length(interview_link) <= 500),
  interview_notes text check (char_length(interview_notes) <= 10000),
  interview_outcome text check (interview_outcome is null or interview_outcome in ('pending', 'positive', 'further_consideration', 'not_progressing')),
  interview_emailed_at timestamptz,

  -- offer
  offer_start_date date,
  offer_emailed_at timestamptz,

  -- fees (per-application overrides; NULL = use site_settings / fee band)
  chosen_plan text check (chosen_plan is null or chosen_plan in ('annual', 'termly', 'monthly')),
  application_fee_amount numeric(10,2) check (application_fee_amount is null or application_fee_amount >= 0),
  application_fee_received boolean not null default false,
  application_fee_received_at date,
  annual_fee_override numeric(10,2) check (annual_fee_override is null or annual_fee_override >= 0),
  first_payment_override numeric(10,2) check (first_payment_override is null or first_payment_override >= 0),

  -- public payment-upload link: only the SHA-256 hash of the random token is stored
  payment_token_hash text,
  payment_token_created_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admissions_stage_details enable row level security;

create policy "admissions_stage_details: staff read"
  on public.admissions_stage_details for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));
create policy "admissions_stage_details: staff insert"
  on public.admissions_stage_details for insert to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));
create policy "admissions_stage_details: staff update"
  on public.admissions_stage_details for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));
create policy "admissions_stage_details: head/admin delete"
  on public.admissions_stage_details for delete to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.admissions_stage_details_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger admissions_stage_details_touch before update on public.admissions_stage_details
  for each row execute function public.admissions_stage_details_touch();

-- audit_row_change() reads NEW.id; this table's key is application_id, so use a
-- dedicated audit function that records the row WITHOUT the token hash.
create or replace function public.audit_admissions_stage_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_old jsonb;
  v_new jsonb;
begin
  select email into v_email from public.profiles where id = v_actor;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old) - 'payment_token_hash'; end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new) - 'payment_token_hash'; end if;
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (v_actor, v_email, tg_op, tg_table_name,
          (case when tg_op = 'DELETE' then old.application_id else new.application_id end)::text,
          case tg_op
            when 'DELETE' then jsonb_build_object('old', v_old)
            when 'INSERT' then jsonb_build_object('new', v_new)
            else jsonb_build_object('old', v_old, 'new', v_new)
          end);
  return coalesce(new, old);
end;
$$;
create trigger audit_admissions_stage_details
  after insert or update or delete on public.admissions_stage_details
  for each row execute function public.audit_admissions_stage_details();

-- ── 4. payment proofs ────────────────────────────────────────────────────
create table public.admissions_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admissions_applications(id) on delete cascade,
  submission_id uuid not null,                       -- groups files uploaded together
  kind text not null check (kind in ('application_fee', 'registration_fee', 'first_payment', 'combined', 'other')),
  covers text[] not null default '{}'
    check (covers <@ array['application_fee', 'registration_fee', 'first_payment']::text[]),
  plan text check (plan is null or plan in ('annual', 'termly', 'monthly')),
  amount_claimed numeric(10,2) check (amount_claimed is null or amount_claimed >= 0),   -- stated by the family; set on the first file of a submission
  family_note text check (char_length(family_note) <= 1000),
  file_path text not null,                           -- in bucket admissions-payments
  file_name text check (char_length(file_name) <= 200),
  content_type text not null,
  size_bytes int not null check (size_bytes > 0),
  uploaded_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  amount_verified numeric(10,2) check (amount_verified is null or amount_verified >= 0),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  note text check (char_length(note) <= 2000)        -- staff note / rejection reason
);

create index admissions_payment_proofs_app_idx on public.admissions_payment_proofs (application_id, uploaded_at desc);
create index admissions_payment_proofs_pending_idx on public.admissions_payment_proofs (status) where status = 'pending';

alter table public.admissions_payment_proofs enable row level security;

-- No insert policy: only the Edge Function (service role) inserts.
create policy "admissions_payment_proofs: staff read"
  on public.admissions_payment_proofs for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));
create policy "admissions_payment_proofs: staff update"
  on public.admissions_payment_proofs for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));
create policy "admissions_payment_proofs: head/admin delete"
  on public.admissions_payment_proofs for delete to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_admissions_payment_proofs
  after insert or update or delete on public.admissions_payment_proofs
  for each row execute function public.audit_row_change();

-- Private bucket; the Edge Function (service role) writes, staff read via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admissions-payments', 'admissions-payments', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

create policy "admissions-payments: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'admissions-payments' and public.current_has_role(array['head_teacher', 'admin', 'admissions']));
create policy "admissions-payments: head/admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'admissions-payments' and public.current_has_role(array['head_teacher', 'admin']));

-- Staff may also upload the assessment results PDF into the existing
-- admissions-documents bucket (the documents panel lists everything there).
-- Path: <application_id>/results-<uuid>.pdf
create policy "admissions-documents: staff upload results"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'admissions-documents' and public.current_has_role(array['head_teacher', 'admin', 'admissions']));
