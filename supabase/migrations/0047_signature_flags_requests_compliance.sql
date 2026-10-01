-- 0047: which website policies need a signature (and from whom), signature
-- requests/reminders by email, signed-copy receipts, de-duplicated
-- outstanding views, and the alert workflow behind Compliance & safeguarding.
--
-- Everything is idempotent (create ... if not exists / on conflict) so it is
-- safe to re-run. Audience model (unchanged since 0014): a document is
-- signed by everyone holding any role in signable_documents.target_roles.
-- The UI groups roles as Staff (head_teacher, admin, admissions, teacher,
-- teaching_assistant_cover), Parents (parent) and Students (student).

-- ── 1. Make sure the website policies exist as rows before flagging them.
-- policy_links is only filled by scripts/seed-website-content.mjs; on a
-- database where that never ran, the website falls back to the bundled
-- seed.ts list (getPolicyLinks) while the admin editor, which reads the
-- table, shows "Nothing here yet". Seed the same 14 policies here with the
-- SAME deterministic ids the seed script uses (sha256 of the seed key), so
-- running that script later updates these rows instead of duplicating them.
create or replace function pg_temp.seed_id(k text) returns uuid language sql immutable as $$
  select (substr(h,1,8) || '-' || substr(h,9,4) || '-4' || substr(h,14,3) || '-8' || substr(h,18,3) || '-' || substr(h,21,12))::uuid
  from (select encode(sha256(convert_to(k, 'UTF8')), 'hex') as h) s
$$;

insert into public.policy_links (id, number, title, category, parent_question_category, file_url, summary, last_reviewed, next_review, order_index)
select pg_temp.seed_id(v.k), v.number, v.title, v.category, v.pqc, v.file_url, v.summary, date '2026-09-01', date '2027-08-31', v.ord
from (values
  ('p01', '01', 'Child Protection and Safeguarding Policy', 'required', 'safety', '/policies/01-child-protection-and-safeguarding.pdf', null, 1),
  ('p06', '06', 'Anti-Bullying and Cyberbullying Policy', 'required', 'safety', '/policies/06-anti-bullying-and-cyberbullying.pdf', null, 2),
  ('p07', '07', 'Behaviour and Online Conduct Policy', 'required', 'safety', '/policies/07-behaviour-and-online-conduct.pdf', 'Includes suspensions and exclusions.', 3),
  ('p12', '12', 'Curriculum Policy', 'required', 'curriculum', '/policies/12-curriculum.pdf', null, 4),
  ('p16', '16', 'SEND and Inclusion Policy', 'required', 'curriculum', '/policies/16-send-and-inclusion.pdf', null, 5),
  ('p17', '17', 'Relationships, Sex and Health Education (RSHE) Policy', 'required', 'curriculum', '/policies/17-rshe.pdf', null, 6),
  ('p19', '19', 'Careers Education and Guidance Policy', 'required', 'curriculum', '/policies/19-careers.pdf', null, 7),
  ('p25', '25', 'Admissions Policy', 'required', 'admissions-fees', '/policies/25-admissions.pdf', null, 8),
  ('p26', '26', 'Fees Policy', 'required', 'admissions-fees', '/policies/26-fees.pdf', 'Terms should be read before enrolling.', 9),
  ('p27', '27', 'Concerns and Complaints Policy', 'required', 'complaints', '/policies/27-concerns-and-complaints.pdf', null, 10),
  ('p29', '29', 'Data Protection Policy', 'required', 'data', '/policies/29-data-protection.pdf', 'See also our short Privacy Notice.', 11),
  ('p30', '30', 'Equality, Diversity and Accessibility Policy', 'required', 'curriculum', '/policies/30-equality-diversity-and-accessibility.pdf', 'Includes our accessibility plan.', 12),
  ('p10', '10', 'Health, Safety and Wellbeing Policy', 'published', 'safety', '/policies/10-health-safety-and-wellbeing.pdf', null, 13),
  ('p09', '09', 'Supporting Pupils with Medical Conditions Policy', 'published', 'safety', '/policies/09-supporting-pupils-with-medical-conditions.pdf', null, 14)
) as v(k, number, title, category, pqc, file_url, summary, ord)
on conflict (id) do nothing;

-- ── 2. Pre-select the policies that need a signature, by title match.
-- First matching rule wins per policy (lowest prio). Existing rows an admin
-- has already switched on are left alone; rows currently OFF are switched on
-- once (migrations run once, so later admin toggles are never overridden).
-- Staff = head_teacher, admin, admissions, teacher, teaching_assistant_cover.
with rules(prio, pattern, roles) as (values
  (1, '%acceptable use%',            array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent','student']),
  (1, '%online conduct%',            array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent','student']),
  (1, '%online safety%',             array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent','student']),
  (2, '%whistleblow%',               array['head_teacher','admin','admissions','teacher','teaching_assistant_cover']),
  (3, '%staff%code of conduct%',     array['head_teacher','admin','admissions','teacher','teaching_assistant_cover']),
  (4, '%code of conduct%',           array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent']),
  (4, '%behaviour%',                 array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent']),
  (5, '%child protection%',          array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent']),
  (5, '%safeguarding%',              array['head_teacher','admin','admissions','teacher','teaching_assistant_cover','parent']),
  (6, '%data protection%',           array['parent']),
  (6, '%privacy%',                   array['parent']),
  (7, '%terms and conditions%',      array['parent']),
  (7, '%terms & conditions%',        array['parent']),
  (7, '%parent agreement%',          array['parent']),
  (7, '%fees policy%',               array['parent']),
  (8, '%health, safety%',            array['head_teacher','admin','admissions','teacher','teaching_assistant_cover']),
  (8, '%health and safety%',         array['head_teacher','admin','admissions','teacher','teaching_assistant_cover'])
), picked as (
  select distinct on (p.id) p.id, p.number, p.title, p.file_url, r.roles
  from public.policy_links p
  join rules r on p.title ilike r.pattern
  order by p.id, r.prio
)
insert into public.signable_documents (sanity_document_id, source, policy_link_id, title, file_url, target_roles, requires_signature, current_asset_id)
select 'policy:' || id, 'policy', id, number || '. ' || title, file_url, roles::public.learn_role[], true, 'pending'
from picked
on conflict (sanity_document_id) do update
  set requires_signature = true,
      target_roles = excluded.target_roles
  where public.signable_documents.source = 'policy'
    and public.signable_documents.requires_signature = false;

-- ── 3. Signature requests / reminders (written by the document-sign-request
-- Edge Function with the service role; Headteacher/Admin can read).
create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.signable_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'request' check (kind in ('request', 'reminder')),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  email_sent boolean not null default false,
  email_detail text
);
create index if not exists signature_requests_doc_user_idx on public.signature_requests (document_id, user_id, requested_at desc);
alter table public.signature_requests enable row level security;
drop policy if exists "signature_requests: headteacher/admin read" on public.signature_requests;
create policy "signature_requests: headteacher/admin read"
  on public.signature_requests for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- ── 4. Signed-copy receipts: snapshot of what was signed + a content hash.
alter table public.document_signatures
  add column if not exists document_title_signed text,
  add column if not exists content_hash text,
  add column if not exists receipt_emailed_at timestamptz,
  add column if not exists receipt_email_detail text;

create or replace function public.document_signatures_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d public.signable_documents;
begin
  select * into d from public.signable_documents where id = new.document_id;
  new.document_title_signed := d.title;
  new.content_hash := encode(sha256(convert_to(concat_ws('|',
    d.title,
    new.asset_id_signed,
    coalesce(d.file_url, ''),
    md5(coalesce(d.body, '')),
    new.signer_id::text,
    new.typed_full_name,
    to_char(new.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ), 'UTF8')), 'hex');
  return new;
end;
$$;
drop trigger if exists document_signatures_receipt_trg on public.document_signatures;
create trigger document_signatures_receipt_trg
  before insert on public.document_signatures
  for each row execute function public.document_signatures_receipt();

-- ── 5. De-duplicate the outstanding views (a person holding two matching
-- roles used to appear once per role). Same columns as before.
create or replace view public.outstanding_signatures as
  select distinct
    p.id as user_id,
    p.full_name,
    p.email,
    d.id as document_id,
    d.title,
    d.current_asset_id
  from public.signable_documents d
  join public.user_roles ur on ur.role = any(d.target_roles)
  join public.profiles p on p.id = ur.user_id
  where d.requires_signature = true
    and (public.current_has_permission('can_export_data') or public.current_has_role(array['head_teacher', 'admin']))
    and not exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.signer_id = p.id and s.asset_id_signed = d.current_asset_id
    );

create or replace view public.my_outstanding_signatures as
  select distinct d.id as document_id, d.title, d.current_asset_id, d.file_url, d.body
  from public.signable_documents d
  join public.user_roles ur on ur.role = any(d.target_roles) and ur.user_id = auth.uid()
  where d.requires_signature = true
    and not exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.signer_id = auth.uid() and s.asset_id_signed = d.current_asset_id
    );

-- ── 6. Alert workflow for Compliance & safeguarding: open -> acknowledged ->
-- resolved (with a note, who and when). alert_ref identifies the underlying
-- item: audit_log.id for absence alerts/escalations, message id for flagged
-- messages.
create table if not exists public.compliance_alert_status (
  id uuid primary key default gen_random_uuid(),
  alert_kind text not null check (alert_kind in ('absence', 'escalation', 'flagged_message')),
  alert_ref text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  unique (alert_kind, alert_ref)
);
alter table public.compliance_alert_status enable row level security;
drop policy if exists "compliance_alert_status: read" on public.compliance_alert_status;
drop policy if exists "compliance_alert_status: write" on public.compliance_alert_status;
drop policy if exists "compliance_alert_status: update" on public.compliance_alert_status;
create policy "compliance_alert_status: read" on public.compliance_alert_status for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('safeguarding_lead') or public.current_has_permission('view_compliance'));
create policy "compliance_alert_status: write" on public.compliance_alert_status for insert to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('safeguarding_lead'));
create policy "compliance_alert_status: update" on public.compliance_alert_status for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('safeguarding_lead'))
  with check (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('safeguarding_lead'));
drop trigger if exists audit_compliance_alert_status on public.compliance_alert_status;
create trigger audit_compliance_alert_status
  after insert or update on public.compliance_alert_status
  for each row execute function public.audit_row_change();
