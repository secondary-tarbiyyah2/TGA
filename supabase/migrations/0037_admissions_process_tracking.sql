-- Admissions process tracking on top of 0032: assessment / interview dates and
-- the paperwork checklist staff tick off as each application moves through
-- the pipeline. Staff-only data: the existing "admissions_applications: staff
-- update" RLS policy is row-level, so it already covers these new columns.

alter table public.admissions_applications
  add column assessment_at timestamptz,
  add column interview_at timestamptz,
  add column report_received boolean not null default false,
  add column deposit_received boolean not null default false,
  add column id_documents_received boolean not null default false,
  add column decision_note text check (char_length(decision_note) <= 5000);

-- The public form may only create a clean row: keep families from pre-filling
-- staff-owned process fields (same spirit as notes/assigned_to in 0032).
alter policy "admissions_applications: public can apply"
  on public.admissions_applications
  with check (
    status = 'new'
    and consent_contact is true
    and consent_data is true
    and notes is null
    and assigned_to is null
    and assessment_at is null
    and interview_at is null
    and report_received is false
    and deposit_received is false
    and id_documents_received is false
    and decision_note is null
  );
