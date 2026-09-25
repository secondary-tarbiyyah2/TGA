-- Phase D: the compliance area under /learn/admin/compliance. Same
-- conventions as every migration since 0007 — deny-by-default RLS, no
-- client write policy unless explicitly justified, audit_row_change() on
-- every writable table, learn_role/learn_permission domains reused (never
-- re-invented).
--
-- This is the single most sensitive area of the whole application
-- (safeguarding concerns about children, DBS/right-to-work records, breach
-- logs), so every policy below is commented with WHO can see it and WHY,
-- and the safeguarding log specifically gets an extra layer beyond every
-- other table here — see its section.

-- ── safeguarding_categories: configurable classification (ground rule 1 —
-- never hardcode a classification list in application code) ─────────────
create table public.safeguarding_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.safeguarding_categories enable row level security;

create policy "safeguarding_categories: safeguarding lead/head_teacher read"
  on public.safeguarding_categories for select
  to authenticated
  using (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']));

create policy "safeguarding_categories: safeguarding lead/head_teacher write"
  on public.safeguarding_categories for all
  to authenticated
  using (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
  with check (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']));

insert into public.safeguarding_categories (label) values
  ('Physical abuse'), ('Emotional abuse'), ('Neglect'), ('Sexual abuse'),
  ('Peer-on-peer abuse'), ('Online safety'), ('Radicalisation/extremism (Prevent)'),
  ('Domestic abuse in the home'), ('Wellbeing/mental health concern'), ('Other');

-- ── safeguarding_concerns: the case record ────────────────────────────────
-- Data minimization: this deliberately does NOT duplicate a child's
-- demographic details (name/DOB/etc already live in `children`, joined at
-- read time) — only what a safeguarding case genuinely needs: who/what it's
-- about, classification, a short initiating summary, and the
-- actions/outcome/referral fields the brief asks for. Anything more
-- detailed belongs in the append-only chronology below, not bolted onto
-- this row as free-text fields that could be silently overwritten.
--
-- Reporting is deliberately WIDE OPEN at INSERT (any signed-in /learn user
-- — staff, parent or student — can create one) but the resulting row is
-- then LOCKED to Safeguarding Lead + Head Teacher only, including for the
-- person who reported it. This matches real safeguarding practice (a
-- reporter raises a concern but does not get ongoing visibility of the
-- confidential case file) and is the literal reading of the brief: "the
-- resulting record then becomes visible only per the restriction below".
create table public.safeguarding_concerns (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.children(id) on delete set null,
  subject_description text, -- free text when the concern isn't about a specific enrolled child (e.g. a staff conduct concern)
  reported_by uuid references public.profiles(id),
  reported_by_role public.learn_role, -- snapshot of the reporter's role at time of report (roles can change later)
  category_id uuid references public.safeguarding_categories(id),
  severity text not null default 'standard' check (severity in ('low', 'standard', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  summary text not null,
  actions_taken text,
  outcome text,
  referral_details text, -- e.g. "referred to Children's Social Care, <date>" — free text, not an integration (per brief)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint safeguarding_concerns_subject_shape check (child_id is not null or subject_description is not null)
);

alter table public.safeguarding_concerns enable row level security;

-- Anyone signed in to /learn can raise a concern about themselves or
-- someone else. reported_by must be the caller (no impersonation).
create policy "safeguarding_concerns: any signed-in user can report"
  on public.safeguarding_concerns for insert
  to authenticated
  with check (reported_by = auth.uid());

-- MFA re-check gate for reading/acting on the log itself — see
-- current_token_fresh() (0007). Deliberately stricter than every other
-- table in this migration (which only check role/permission): this is the
-- one place holding live child-protection case narratives, so "signed in
-- with MFA at some point this session" is judged not enough — the caller's
-- access token must have been minted in the last SAFEGUARDING_FRESH_MINUTES
-- (i.e. they entered their authenticator code again recently, not just once
-- at login). The UI enforces this with a re-challenge screen
-- (FreshMfaGate); this RLS check is what makes it a real boundary rather
-- than a UI convenience — see report for the full reasoning and the
-- trade-off considered (a per-query re-check would make the page unusable;
-- a session-long window of a few minutes balances that against "recently
-- proven it's really you").
create policy "safeguarding_concerns: safeguarding lead/head_teacher read (MFA re-check)"
  on public.safeguarding_concerns for select
  to authenticated
  using (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create policy "safeguarding_concerns: safeguarding lead/head_teacher update (MFA re-check)"
  on public.safeguarding_concerns for update
  to authenticated
  using (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  )
  with check (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

-- No delete policy anywhere, by design — a safeguarding case is never
-- deleted from the client; retention handling for this table is a
-- deliberate registry entry (see retention_schedule) actioned by
-- service-role only, never an RLS delete policy.

create trigger audit_safeguarding_concerns
  after insert or update on public.safeguarding_concerns
  for each row execute function public.audit_row_change();

-- ── safeguarding_chronology: append-only timeline per concern ────────────
-- No UPDATE or DELETE policy at all — same "zero policies = zero access"
-- pattern this schema uses everywhere for "must never be edited after the
-- fact" data (e.g. login_attempts). Only INSERT and SELECT exist.
create table public.safeguarding_chronology (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references public.safeguarding_concerns(id) on delete cascade,
  entry text not null,
  entered_by uuid references public.profiles(id),
  entered_at timestamptz not null default now()
);

alter table public.safeguarding_chronology enable row level security;

create policy "safeguarding_chronology: safeguarding lead/head_teacher read (MFA re-check)"
  on public.safeguarding_chronology for select
  to authenticated
  using (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create policy "safeguarding_chronology: safeguarding lead/head_teacher append (MFA re-check)"
  on public.safeguarding_chronology for insert
  to authenticated
  with check (
    entered_by = auth.uid()
    and (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create trigger audit_safeguarding_chronology
  after insert on public.safeguarding_chronology
  for each row execute function public.audit_row_change();

-- ── safeguarding attachments: Supabase Storage, strict per-row RLS ───────
-- Private bucket; every object path is namespaced <concern_id>/<filename>
-- so the storage policy can check the same MFA-fresh + role condition
-- without a metadata table lookup (cheaper, and one less place for the
-- rule to drift out of sync). A row in safeguarding_attachments records
-- WHAT was uploaded (for the chronology view); the bytes live only in
-- Storage, never duplicated into Postgres.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('safeguarding-attachments', 'safeguarding-attachments', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'text/plain'])
on conflict (id) do nothing;

create or replace function public.storage_path_concern_id(p_name text)
returns uuid
language sql
immutable
as $$
  select (split_part(p_name, '/', 1))::uuid;
$$;

create policy "safeguarding-attachments: safeguarding lead/head_teacher read (MFA re-check)"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'safeguarding-attachments'
    and (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create policy "safeguarding-attachments: safeguarding lead/head_teacher upload (MFA re-check)"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'safeguarding-attachments'
    and (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create table public.safeguarding_attachments (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references public.safeguarding_concerns(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

alter table public.safeguarding_attachments enable row level security;

create policy "safeguarding_attachments: safeguarding lead/head_teacher read (MFA re-check)"
  on public.safeguarding_attachments for select
  to authenticated
  using (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create policy "safeguarding_attachments: safeguarding lead/head_teacher record upload (MFA re-check)"
  on public.safeguarding_attachments for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

create trigger audit_safeguarding_attachments
  after insert on public.safeguarding_attachments
  for each row execute function public.audit_row_change();

-- ── data rights requests (subject access / rectification / erasure /
-- export / objection) — logged and actioned by Head Teacher/Admin; anyone
-- holding can_export_data can see the queue too since they run the export
-- mechanics for SAR-type requests, but only HT/Admin can log or update a
-- request's status/deadline handling. ─────────────────────────────────────
create table public.data_rights_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('subject_access', 'rectification', 'erasure', 'export', 'objection')),
  requester_name text not null,
  requester_email text not null,
  subject_profile_id uuid references public.profiles(id), -- set when the data subject has a /learn account
  subject_description text, -- free text otherwise (e.g. a former pupil with no live account)
  status text not null default 'received' check (status in ('received', 'in_progress', 'completed', 'rejected')),
  received_at timestamptz not null default now(),
  statutory_deadline timestamptz not null default (now() + interval '1 month'), -- UK GDPR: one calendar month, see extended_deadline for complex-case extensions
  extended_deadline timestamptz, -- set only when the complex-case extension (up to two further months) applies
  extension_reason text,
  completed_at timestamptz,
  actioned_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_rights_requests_subject_shape check (subject_profile_id is not null or subject_description is not null)
);

alter table public.data_rights_requests enable row level security;

create policy "data_rights_requests: head_teacher/admin/can_export_data read"
  on public.data_rights_requests for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('can_export_data'));

create policy "data_rights_requests: head_teacher/admin write"
  on public.data_rights_requests for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_data_rights_requests
  after insert or update or delete on public.data_rights_requests
  for each row execute function public.audit_row_change();

-- ── retention_schedule: the genuine central registry BY DATA TYPE ────────
-- Deliberate design choice (documented per the brief's prompt to justify
-- it): the existing per-feature jobs (lms-recording-retention.mjs,
-- messaging-retention.mjs) keep their own configurable period in their own
-- settings singleton (lms_settings.recording_retention_days,
-- messaging_settings.message_retention_days) because they need that value
-- at the exact point of deciding what to delete, in a script that already
-- exists and works — duplicating the number here and hoping the two stay
-- in sync would violate ground rule 1 (one source of truth) in the other
-- direction. Instead this registry is the reporting/visibility layer both
-- feed INTO: each job, after it runs, writes one row to
-- retention_job_runs (below) naming its data type, so this becomes the
-- single place a Head Teacher/Admin looks to see "what gets retained for
-- how long, and when did each one last actually run" across every
-- feature — including the two NEW jobs this migration adds
-- (safeguarding-adjacent data has its own explicit retention decisions,
-- and login_attempts is a good first genuinely "owned here" entry).
create table public.retention_schedule (
  id uuid primary key default gen_random_uuid(),
  data_type text not null unique,
  description text not null,
  retention_period text not null, -- human-readable (e.g. "90 days", "2 school years") — the authoritative NUMBER for automated features stays in that feature's own settings table; this is the human-facing summary of it
  action_on_expiry text not null check (action_on_expiry in ('delete', 'anonymise')),
  owner_job text, -- which script actually performs it, e.g. "scripts/lms-recording-retention.mjs"
  last_run_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.retention_schedule enable row level security;

create policy "retention_schedule: view_compliance read"
  on public.retention_schedule for select
  to authenticated
  using (public.current_has_permission('view_compliance'));

create policy "retention_schedule: head_teacher/admin write"
  on public.retention_schedule for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_retention_schedule
  after insert or update or delete on public.retention_schedule
  for each row execute function public.audit_row_change();

insert into public.retention_schedule (data_type, description, retention_period, action_on_expiry, owner_job) values
  ('Lesson recordings', 'BBB video/audio recordings of live lessons', 'Configurable (lms_settings.recording_retention_days, default 90 days)', 'delete', 'scripts/lms-recording-retention.mjs'),
  ('Parent/staff/student messages', 'message_thread_messages threads', 'Configurable (messaging_settings.message_retention_days, default 730 days)', 'delete', 'scripts/messaging-retention.mjs'),
  ('Sign-in attempt log', 'login_attempts rows (lockout tracking)', '90 days', 'delete', 'scripts/compliance-retention.mjs'),
  ('Closed safeguarding concerns', 'safeguarding_concerns and chronology, closed status', '25 years from closure (statutory minimum for child-protection records; anonymise, never delete outright while a child could still be under 25)', 'anonymise', 'Manual review only — see SETUP.md (deliberately not auto-deleted)'),
  ('Data rights requests', 'data_rights_requests', '3 years from completion', 'delete', 'scripts/compliance-retention.mjs');

-- Deliberately no automated job is wired up for the safeguarding-concerns
-- row above — see SETUP.md "Compliance area" for why (an auto-delete of
-- child-protection case history is exactly the kind of decision that
-- should never run unattended).

-- ── retention_job_runs: what ran, when, how many rows — metadata only,
-- NEVER the deleted personal data itself (ground rule 5/6). service-role
-- only writes (no client insert policy, same pattern as login_attempts) ──
create table public.retention_job_runs (
  id bigint generated always as identity primary key,
  data_type text not null,
  run_at timestamptz not null default now(),
  action text not null check (action in ('delete', 'anonymise')),
  rows_affected int not null default 0,
  notes text
);

alter table public.retention_job_runs enable row level security;

create policy "retention_job_runs: view_compliance read"
  on public.retention_job_runs for select
  to authenticated
  using (public.current_has_permission('view_compliance'));

-- ── staff_vetting_records: the Single Central Record ──────────────────────
-- Data minimization judgement (documented per ground rule 5): right-to-work
-- checks record ONLY verified:boolean + date + document TYPE + who
-- verified it — never a document/passport/visa NUMBER. A verifier looks at
-- the physical document and attests "yes, in date, checked on this date";
-- the number itself adds no further safeguarding/compliance value on this
-- record (it isn't looked up against anything automatically) while being
-- exactly the kind of sensitive identifier that increases breach impact if
-- this table were ever exposed. DBS is different: the brief explicitly
-- asks for the certificate reference number, which IS the standard,
-- minimal thing schools are expected to retain under KCSIE (not the
-- disclosure content itself, which this table also never stores).
-- Surrogate `id` (not user_id as primary key) — same reasoning as 0007's
-- user_permissions: the shared audit_row_change() trigger reads NEW/OLD.id
-- unconditionally, which a user_id-only primary key breaks.
create table public.staff_vetting_records (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  dbs_check_date date,
  dbs_certificate_reference text,
  dbs_renewal_due date,
  references_received boolean not null default false,
  references_received_date date,
  right_to_work_verified boolean not null default false,
  right_to_work_verified_date date,
  right_to_work_document_type text, -- e.g. "UK passport", "Share code" — never a document number, see header
  right_to_work_verified_by uuid references public.profiles(id),
  qualification_check_done boolean not null default false,
  qualification_check_date date,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.staff_vetting_records enable row level security;

create policy "staff_vetting_records: head_teacher/admin read"
  on public.staff_vetting_records for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create policy "staff_vetting_records: head_teacher/admin write"
  on public.staff_vetting_records for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_staff_vetting_records
  after insert or update or delete on public.staff_vetting_records
  for each row execute function public.audit_row_change();

-- ── consent register: recordings, marketing, photos — with timestamped,
-- versioned WORDING (not just a boolean). Integration choice with Phase
-- B's `recording_consents` (documented per the brief's prompt): this does
-- NOT replace recording_consents, which stays exactly as-is because
-- everything under lessons/attendance/BBB reads its narrow "current state
-- per child" shape directly and cheaply. Instead consent_register becomes
-- the broader, append-only HISTORY across all three consent types
-- (recording/marketing/photos), and a trigger below appends a row to it
-- every time recording_consents changes — so recording_consents keeps its
-- existing job (fast current-state gate) while consent_register becomes
-- the one place with the full "what was agreed, in exactly what words, and
-- when" ledger the brief asks for, for ALL consent types including
-- recordings. No duplicated/disconnected concept. ───────────────────────
create table public.consent_wordings (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('recording', 'marketing', 'photos')),
  wording text not null,
  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.consent_wordings enable row level security;

create policy "consent_wordings: authenticated read"
  on public.consent_wordings for select
  to authenticated
  using (true); -- the wording itself isn't personal data — every parent/student needs to read it before consenting

create policy "consent_wordings: head_teacher/admin write"
  on public.consent_wordings for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']));
-- No update/delete policy: a wording is superseded by inserting a NEW row
-- with a later effective_from, never edited in place — otherwise a past
-- consent_register entry's wording_snapshot (captured at the time) would
-- be the only place old wording survived, but the "current wording" picker
-- below relies on being able to trust effective_from ordering, not on
-- wordings staying editable.

create trigger audit_consent_wordings
  after insert on public.consent_wordings
  for each row execute function public.audit_row_change();

insert into public.consent_wordings (category, wording) values
  ('recording', 'I consent to live lessons my child attends being recorded for the purposes of catch-up viewing and safeguarding review, in line with the school''s Safeguarding and Data Protection policies. I understand I can withdraw this consent at any time.'),
  ('marketing', 'I consent to Tarbiyyah Global Academy using my/my child''s achievements and quotes (not photos) in marketing materials such as the website and newsletters.'),
  ('photos', 'I consent to Tarbiyyah Global Academy using photos/video of my child in school marketing materials (website, prospectus, social media). I understand I can withdraw this consent at any time and future material will not include new photos of my child.');

create table public.consent_register (
  id bigint generated always as identity primary key,
  child_id uuid references public.children(id) on delete cascade,
  category text not null check (category in ('recording', 'marketing', 'photos')),
  given boolean not null,
  wording_id uuid references public.consent_wordings(id),
  wording_snapshot text not null, -- the EXACT wording shown at the time, copied — never re-derived from consent_wordings later
  given_by uuid references public.profiles(id),
  given_at timestamptz not null default now()
);

alter table public.consent_register enable row level security;

create policy "consent_register: parent reads own child's"
  on public.consent_register for select
  to authenticated
  using (public.child_belongs_to_parent(consent_register.child_id));

create policy "consent_register: staff with manage_people_accounts/safeguarding_lead/head_teacher/admin read"
  on public.consent_register for select
  to authenticated
  using (
    public.current_has_permission('manage_people_accounts')
    or public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create policy "consent_register: parent records marketing/photos consent for own child"
  on public.consent_register for insert
  to authenticated
  with check (
    given_by = auth.uid()
    and category in ('marketing', 'photos')
    and public.child_belongs_to_parent(consent_register.child_id)
  );

-- recording consent rows are appended only by the trigger below (which
-- runs as the table owner and therefore bypasses RLS, same as every other
-- trigger-driven insert in this schema) — no direct client insert policy
-- for category = 'recording', so the ledger can't drift from what
-- recording_consents itself actually holds.

create or replace function public.log_recording_consent_to_register()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wording_id uuid;
  v_wording text;
begin
  select id, wording into v_wording_id, v_wording
  from public.consent_wordings
  where category = 'recording' and effective_from <= now()
  order by effective_from desc
  limit 1;

  insert into public.consent_register (child_id, category, given, wording_id, wording_snapshot, given_by, given_at)
  values (new.child_id, 'recording', new.given, v_wording_id, coalesce(v_wording, '(no recording-consent wording configured at time of capture)'), new.given_by, new.given_at);

  return new;
end;
$$;

create trigger log_recording_consent
  after insert or update of given on public.recording_consents
  for each row execute function public.log_recording_consent_to_register();

-- ── incident and data-breach log ──────────────────────────────────────────
create table public.incident_breach_log (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  affected_data_types text, -- free text, e.g. "names, email addresses"
  affected_count int, -- COUNT of people, not necessarily full identification — see brief
  containment_actions text,
  status text not null default 'open' check (status in ('open', 'contained', 'closed')),
  discovered_at timestamptz not null default now(), -- the clock the 72-hour ICO deadline runs from
  reported_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.incident_breach_log enable row level security;

create policy "incident_breach_log: view_compliance read"
  on public.incident_breach_log for select
  to authenticated
  using (public.current_has_permission('view_compliance'));

create policy "incident_breach_log: head_teacher/admin write"
  on public.incident_breach_log for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_incident_breach_log
  after insert or update or delete on public.incident_breach_log
  for each row execute function public.audit_row_change();

-- Structured ICO-notification checklist — one fixed set of steps per
-- incident, auto-seeded on insert so it's a genuine checklist (each step
-- has its own done/who/when), not a free-text field claiming to be one.
create table public.incident_checklist_items (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incident_breach_log(id) on delete cascade,
  item_key text not null check (item_key in (
    'assessed_notifiable_risk', 'ico_notified', 'individuals_notified_if_high_risk',
    'containment_completed', 'post_incident_review'
  )),
  done boolean not null default false,
  done_by uuid references public.profiles(id),
  done_at timestamptz,
  notes text,
  unique (incident_id, item_key)
);

alter table public.incident_checklist_items enable row level security;

create policy "incident_checklist_items: view_compliance read"
  on public.incident_checklist_items for select
  to authenticated
  using (public.current_has_permission('view_compliance'));

create policy "incident_checklist_items: head_teacher/admin write"
  on public.incident_checklist_items for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_incident_checklist_items
  after insert or update or delete on public.incident_checklist_items
  for each row execute function public.audit_row_change();

create or replace function public.seed_incident_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.incident_checklist_items (incident_id, item_key) values
    (new.id, 'assessed_notifiable_risk'),
    (new.id, 'ico_notified'),
    (new.id, 'individuals_notified_if_high_risk'),
    (new.id, 'containment_completed'),
    (new.id, 'post_incident_review');
  return new;
end;
$$;

create trigger seed_incident_breach_checklist
  after insert on public.incident_breach_log
  for each row execute function public.seed_incident_checklist();

-- ── audit_log viewer: a second, additive read policy for the /learn role
-- system. The original (0003) "admin read" policy uses the OLD
-- profiles.role booking-admin system by design (see 0007's header) — this
-- adds the /learn equivalent alongside it (multiple permissive SELECT
-- policies on the same table OR together in Postgres), so a /learn Head
-- Teacher/Admin can read it without touching the pre-existing booking-admin
-- path. Broader than the safeguarding log (audit_log spans every phase's
-- activity, not just safeguarding), narrower than "all compliance
-- viewers" (view_compliance) — deliberately restricted to head_teacher/
-- admin only, since this is a raw record of every write anyone has ever
-- made, which is more than a general compliance-permission holder needs.
create policy "audit_log: learn head_teacher/admin read"
  on public.audit_log for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- Export of audit_log/other compliance CSVs is gated in the UI behind
-- can_export_data, matching the pattern Phase C's document-signatures
-- export already established (client-side CSV build from an RLS-scoped
-- read — see src/app/learn/admin/documents/page.tsx). No extra DB policy is
-- needed for that: can_export_data holders still need head_teacher/admin
-- read access to audit_log itself under the policy above, or
-- view_compliance for the other compliance tables' export.
