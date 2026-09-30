-- The pupil safeguarding record: address, country, time zone, guardians,
-- emergency contacts, local emergency number, and Individual Healthcare
-- Plans — plus the per-country Emergency Contact Register and the
-- teacher-facing emergency card that policy 09 requires.
--
-- Why this migration exists
-- -------------------------
-- `children` (0008) held name, dob, year_group_id and nothing else. Four
-- policies in the 2026-27 set depend on fields that did not exist:
--
--   * Policy 09 §6 (Supporting Pupils with Medical Conditions) is explicit
--     about the *interface*, not just the data: "Every live teacher must be
--     able to see, through the staff view of the Student Portal, each
--     pupil's home address, local emergency number and parent contact
--     numbers. This information is checked each term and whenever a family
--     moves." A teacher could not do that, which is the single scenario
--     that policy exists for — a medical emergency during a live lesson,
--     where §6.3 has the teacher give "the pupil's address from the
--     admission record" to emergency services in the pupil's own country.
--   * Policy 24 §11 (Admissions) specifies the admission register contents:
--     full name, DOB, date of admission, parents' names and contact
--     details, home address and country of residence, emergency contacts
--     (including a local adult where possible), and previous school.
--   * Policy 01 §10 (Safeguarding) requires an Emergency Contact Register
--     listing, per country where pupils live, the emergency number, the
--     most appropriate child protection/social services contact, and the
--     relevant British Embassy or High Commission consular line.
--   * Policy 24 §12 requires the Academy to record who holds parental
--     responsibility and any court orders, and to verify the identity of
--     each adult with parental responsibility.
--
-- Conventions follow 0008/0009/0015:
--   * RLS on every table, default deny.
--   * Emergency/medical data is special category data under Article 9, so
--     read access is scoped as narrowly as the policy allows: the child's
--     own parent, staff who actually teach the child, and the
--     safeguarding/leadership roles. There is deliberately NO
--     "any authenticated staff member" read policy.
--   * Pupils themselves do not read this table. A child does not need the
--     consular line for their country surfaced in their own portal, and
--     policy 09 §3 puts medication and first aid with parents.
--   * `audit_row_change()` on every table here — who looked at or changed a
--     pupil's emergency details is exactly the kind of thing a
--     safeguarding review asks about later.
--
-- Data minimisation choices:
--   * No document *numbers* are stored for identity verification (same rule
--     as `staff_vetting_records.right_to_work_document_type` in 0015):
--     `pupil_guardians` records the document *type* and that it was
--     verified, by whom and when — never a passport number.
--   * `local_emergency_number` on the child is an override only. The normal
--     path resolves it from `country_emergency_contacts` by country code, so
--     the number is maintained once per country by the DSL rather than
--     copied onto every pupil row and left to rot.
--   * IHPs are a separate table rather than columns on `children`, because
--     policy 09 §4 says they are "shared only with staff who need them" —
--     a separate table can carry its own, tighter RLS.

-- ── children: admission register + residence fields ─────────────────────
alter table public.children
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column region text,
  add column postcode text,
  -- ISO 3166-1 alpha-2, uppercased. The join key to
  -- country_emergency_contacts, so it is constrained rather than free text.
  add column country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  -- IANA time zone (e.g. 'Europe/London', 'Asia/Dubai'). Policies 08 §6,
  -- 21 §2 and 29 §4 all trigger behaviour off the pupil's local time, so
  -- this is a first-class field, not a display preference.
  add column time_zone text,
  -- Override only — normally resolved from country_emergency_contacts.
  add column local_emergency_number text,
  add column previous_school text,
  add column admitted_on date,
  -- Removal from roll. Policies 01 §15, 07 §8, 08 §10 and 25 §6 all state
  -- the same rule: a pupil is never removed from roll until the Academy
  -- knows where their education continues. `removal_continuing_education`
  -- is therefore NOT NULL-able independently of removed_on — the check
  -- constraint below makes "removed with no idea where they went"
  -- unrepresentable rather than merely discouraged.
  add column removed_on date,
  add column removal_ground text,
  add column removal_continuing_education text,
  -- Policy 09 §6: "checked each term and whenever a family moves."
  add column contact_details_confirmed_at timestamptz,
  add column contact_details_confirmed_by uuid references public.profiles(id),
  -- Minimal SEND flag so a teacher's emergency card and the behaviour
  -- policy's adjustment rules (07 §9) have something to key off now. The
  -- full SEND register and support plans (policy 16) are a separate piece
  -- of work; this is deliberately just a status.
  add column send_status text not null default 'none'
    check (send_status in ('none', 'monitoring', 'send_support', 'ehcp'));

alter table public.children
  add constraint children_removal_shape check (
    (removed_on is null and removal_ground is null and removal_continuing_education is null)
    or (removed_on is not null and removal_ground is not null
        and removal_continuing_education is not null
        and length(btrim(removal_continuing_education)) > 0)
  );

comment on column public.children.removal_continuing_education is
  'Where this pupil''s education continues after removal from roll. Required whenever removed_on is set — policies 01 §15, 07 §8, 08 §10 and 25 §6 all forbid removing a pupil from roll until the Academy knows this.';
comment on column public.children.local_emergency_number is
  'Per-pupil override only. Normally NULL — the emergency number is resolved from country_emergency_contacts by country_code so it is maintained once per country by the DSL (policy 01 §10).';
comment on column public.children.contact_details_confirmed_at is
  'Last time address and emergency contacts were re-verified with the family. Policy 09 §6 requires this each term and whenever a family moves; overdue families are listed by the pupils_contact_details_overdue view.';

create index children_country_code_idx on public.children (country_code);

-- ── country_emergency_contacts (the Emergency Contact Register) ──────────
-- Policy 01 §10. Maintained by the DSL, read by anyone who may have to act
-- on it in a live lesson — so its read policy is wider than the pupil
-- tables below (it holds no personal data about a child at all, just public
-- emergency and consular numbers for a country).
create table public.country_emergency_contacts (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  emergency_number text not null,
  child_protection_contact text,
  consular_contact text,
  notes text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.country_emergency_contacts enable row level security;

create policy "country_emergency_contacts: any signed-in user reads"
  on public.country_emergency_contacts for select
  to authenticated
  using (true);

create policy "country_emergency_contacts: safeguarding lead/head_teacher/admin manage"
  on public.country_emergency_contacts for all
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  )
  with check (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create trigger audit_country_emergency_contacts
  after insert or update or delete on public.country_emergency_contacts
  for each row execute function public.audit_row_change();

-- The UK is seeded because policy 01 §2 names 999 and the Hounslow
-- contacts directly, and because a register with nothing in it on day one
-- is worse than no register. Every other country a family lives in is the
-- DSL's to add at admission — deliberately NOT pre-seeded with guessed
-- numbers for countries we have no pupils in (ground rule: never invent
-- data, and a wrong emergency number is the worst possible invention).
insert into public.country_emergency_contacts
  (country_code, country_name, emergency_number, child_protection_contact, consular_contact, notes)
values
  ('GB', 'United Kingdom', '999',
   'Hounslow Multi-Agency Safeguarding Hub 020 8583 6600 (LADO 020 8583 4933)',
   null,
   'NSPCC Helpline 0808 800 5000. Childline 0800 1111. Contacts per policy 01 §2 — verify each term.');

-- ── pupil_guardians ─────────────────────────────────────────────────────
-- Policy 24 §11/§12 and Appendix A. `children.parent_user_id` (0008) models
-- exactly one portal account per child; a pupil may have two adults with
-- parental responsibility, a court order affecting one of them, and an
-- emergency contact who is neither. This table carries that, and is the
-- source of the "parent contact numbers" a teacher sees in an emergency.
create table public.pupil_guardians (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  -- Set where this guardian also has a portal login; null for a guardian
  -- the Academy records but who does not hold an account.
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  relationship text not null,
  phone text,
  alt_phone text,
  email text,
  has_parental_responsibility boolean not null default true,
  -- Free text rather than a document store: policy 24 Appendix A asks for
  -- "evidence of parental responsibility where relevant, for example a
  -- court order". What matters operationally is that staff know an order
  -- exists and what it restricts.
  court_order_notes text,
  -- Identity verification per policy 24 §12. Type only, never a number.
  photo_id_verified boolean not null default false,
  photo_id_document_type text,
  photo_id_verified_by uuid references public.profiles(id),
  photo_id_verified_at timestamptz,
  -- Lower sorts first on the emergency card.
  contact_priority int not null default 1 check (contact_priority between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pupil_guardians_child_idx on public.pupil_guardians (child_id, contact_priority);

alter table public.pupil_guardians enable row level security;

create policy "pupil_guardians: parent reads own child's"
  on public.pupil_guardians for select
  to authenticated
  using (public.child_belongs_to_parent(pupil_guardians.child_id));

create policy "pupil_guardians: teacher of this child reads"
  on public.pupil_guardians for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(pupil_guardians.child_id));

create policy "pupil_guardians: safeguarding/leadership read all"
  on public.pupil_guardians for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_permission('manage_admissions')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create policy "pupil_guardians: admissions/leadership manage"
  on public.pupil_guardians for all
  to authenticated
  using (
    public.current_has_permission('manage_admissions')
    or public.current_has_role(array['head_teacher', 'admin'])
  )
  with check (
    public.current_has_permission('manage_admissions')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create trigger audit_pupil_guardians
  after insert or update or delete on public.pupil_guardians
  for each row execute function public.audit_row_change();

-- ── pupil_emergency_contacts ────────────────────────────────────────────
-- Policy 01 §10 and 24 §11: "at least two emergency contacts, including one
-- local adult where possible". Policy 09 §4 wants an adult near the pupil's
-- home on the IHP for the same reason — if a child collapses in a lesson in
-- another time zone, a parent at work three hours away is not who a teacher
-- needs first.
create table public.pupil_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  phone text not null,
  alt_phone text,
  -- The "local adult where possible" flag from policies 01 §10 / 24 §11.
  is_local_adult boolean not null default false,
  notes text,
  contact_priority int not null default 1 check (contact_priority between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pupil_emergency_contacts_child_idx
  on public.pupil_emergency_contacts (child_id, contact_priority);

alter table public.pupil_emergency_contacts enable row level security;

create policy "pupil_emergency_contacts: parent reads own child's"
  on public.pupil_emergency_contacts for select
  to authenticated
  using (public.child_belongs_to_parent(pupil_emergency_contacts.child_id));

create policy "pupil_emergency_contacts: teacher of this child reads"
  on public.pupil_emergency_contacts for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(pupil_emergency_contacts.child_id));

create policy "pupil_emergency_contacts: safeguarding/leadership read all"
  on public.pupil_emergency_contacts for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_permission('manage_admissions')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

-- Parents may maintain their own child's emergency contacts. This is the one
-- place in this migration a parent gets write access, and it is deliberate:
-- policy 27 §4 asks parents to "keep contact details, address and emergency
-- contacts up to date", and a family that has to email the office to correct
-- a phone number will not bother. Address changes stay staff-only (they feed
-- the admission register and an LA notification), but a wrong emergency
-- number is a safeguarding risk that the family is best placed to fix.
create policy "pupil_emergency_contacts: parent manages own child's"
  on public.pupil_emergency_contacts for all
  to authenticated
  using (public.child_belongs_to_parent(pupil_emergency_contacts.child_id))
  with check (public.child_belongs_to_parent(pupil_emergency_contacts.child_id));

create policy "pupil_emergency_contacts: admissions/leadership manage"
  on public.pupil_emergency_contacts for all
  to authenticated
  using (
    public.current_has_permission('manage_admissions')
    or public.current_has_role(array['head_teacher', 'admin'])
  )
  with check (
    public.current_has_permission('manage_admissions')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create trigger audit_pupil_emergency_contacts
  after insert or update or delete on public.pupil_emergency_contacts
  for each row execute function public.audit_row_change();

-- ── individual_healthcare_plans ─────────────────────────────────────────
-- Policy 09 §4. One current plan per child (the plan is a living document
-- reviewed annually, not a series of versions — same reasoning as
-- `recording_consents` in 0009: current state is what gates behaviour, and
-- a full history of every edit is personal health data we have no stated
-- purpose for).
create table public.individual_healthcare_plans (
  child_id uuid primary key references public.children(id) on delete cascade,
  condition text not null,
  triggers text,
  signs_and_symptoms text,
  -- The field a teacher reads mid-lesson. Kept separate from the clinical
  -- description precisely so the emergency card can show this and nothing
  -- else.
  action_in_lesson text not null,
  adjustments text,
  -- Policy 09 §4: emergency contacts "including an adult near the pupil's
  -- home" — the structured contacts live in pupil_emergency_contacts; this
  -- is for anything plan-specific (a named clinician, a hospital).
  additional_emergency_info text,
  agreed_with_parent_on date,
  healthcare_professional_involved text,
  -- Policy 09 §4: "reviewed at least annually".
  last_reviewed_on date,
  next_review_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.individual_healthcare_plans enable row level security;

create policy "individual_healthcare_plans: parent reads own child's"
  on public.individual_healthcare_plans for select
  to authenticated
  using (public.child_belongs_to_parent(individual_healthcare_plans.child_id));

-- Policy 09 §3: "Teachers know which pupils in their classes have IHPs and
-- what to do." Scoped to teachers of this child only — an IHP is health
-- data, so a teacher who does not teach the pupil has no basis to read it.
create policy "individual_healthcare_plans: teacher of this child reads"
  on public.individual_healthcare_plans for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(individual_healthcare_plans.child_id));

create policy "individual_healthcare_plans: safeguarding/leadership read all"
  on public.individual_healthcare_plans for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

-- Policy 09 §3 puts IHP coordination with the SENCO/Pastoral Lead. There is
-- no 'senco' role in the 0007 vocabulary yet (see LMS-REQUIREMENTS.md §7.3
-- — the policies name ~20 roles this system does not model), so this uses
-- the nearest existing grant rather than inventing a role identifier that
-- nothing else recognises.
create policy "individual_healthcare_plans: leadership manages"
  on public.individual_healthcare_plans for all
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  )
  with check (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create trigger audit_individual_healthcare_plans
  after insert or update or delete on public.individual_healthcare_plans
  for each row execute function public.audit_row_change();

-- ── medical_incidents ───────────────────────────────────────────────────
-- Policy 09 §6 step 4: "The teacher informs the DSL and Headteacher and
-- completes an incident record the same day."
create table public.medical_incidents (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  lesson_instance_id uuid references public.lesson_instances(id) on delete set null,
  occurred_at timestamptz not null default now(),
  what_happened text not null,
  action_taken text not null,
  emergency_services_called boolean not null default false,
  parent_contacted boolean not null default false,
  dsl_informed boolean not null default false,
  reported_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index medical_incidents_child_idx on public.medical_incidents (child_id, occurred_at desc);

alter table public.medical_incidents enable row level security;

-- Any signed-in staff member can file one (the teacher in the room is
-- whoever it is), same shape as safeguarding_concerns in 0015: reporting is
-- never gated, reading is.
create policy "medical_incidents: staff can report"
  on public.medical_incidents for insert
  to authenticated
  with check (
    reported_by = auth.uid()
    and public.is_staff_member(auth.uid())
  );

create policy "medical_incidents: reporter reads own report"
  on public.medical_incidents for select
  to authenticated
  using (reported_by = auth.uid());

create policy "medical_incidents: safeguarding/leadership read all"
  on public.medical_incidents for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create policy "medical_incidents: safeguarding/leadership update"
  on public.medical_incidents for update
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  )
  with check (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

-- No delete policy, by design — same rule as safeguarding_concerns (0015).

create trigger audit_medical_incidents
  after insert or update or delete on public.medical_incidents
  for each row execute function public.audit_row_change();

-- ── pupil_emergency_card ────────────────────────────────────────────────
-- The view policy 09 §6 describes: what a teacher must be able to see for a
-- pupil they teach, in one place, during a live lesson. security_invoker so
-- every underlying table's RLS still applies per caller — a teacher sees
-- only their own pupils, a parent only their own child.
--
-- The emergency number falls back from the per-pupil override to the
-- country register, so the DSL maintains it once per country (policy 01
-- §10) and a teacher never sees a blank where a number should be without
-- also seeing which country to go and look up.
create view public.pupil_emergency_card
  with (security_invoker = true) as
  select
    c.id as child_id,
    c.name,
    c.dob,
    c.year_group_id,
    c.send_status,
    c.address_line1,
    c.address_line2,
    c.city,
    c.region,
    c.postcode,
    c.country_code,
    cec.country_name,
    c.time_zone,
    coalesce(c.local_emergency_number, cec.emergency_number) as emergency_number,
    (c.local_emergency_number is not null) as emergency_number_is_pupil_override,
    cec.child_protection_contact,
    cec.consular_contact,
    c.contact_details_confirmed_at,
    (ihp.child_id is not null) as has_healthcare_plan,
    ihp.condition as healthcare_condition,
    ihp.action_in_lesson as healthcare_action_in_lesson
  from public.children c
  left join public.country_emergency_contacts cec on cec.country_code = c.country_code
  left join public.individual_healthcare_plans ihp on ihp.child_id = c.id
  where c.removed_on is null;

comment on view public.pupil_emergency_card is
  'What a live teacher must be able to see for a pupil they teach, per policy 09 §6: home address, local emergency number, and whether an Individual Healthcare Plan exists with what to do in the lesson. Guardian and emergency-contact phone numbers are read from pupil_guardians and pupil_emergency_contacts alongside this (they are one-to-many, so they are not flattened into this view). security_invoker means each caller sees only the pupils their own RLS allows.';

-- ── pupils_contact_details_overdue ──────────────────────────────────────
-- Policy 09 §6: contact details are "checked each term and whenever a
-- family moves." A field nobody is prompted to re-check is a field that
-- silently goes stale, so the obligation is surfaced as a queue.
--
-- 100 days rather than a calendar term: terms vary in length and a pupil
-- admitted mid-term would otherwise appear overdue on day one. This is a
-- deliberate approximation of "each term" and is stated as such rather than
-- pretending to track term boundaries the `terms` table already owns.
create view public.pupils_contact_details_overdue
  with (security_invoker = true) as
  select
    c.id as child_id,
    c.name,
    c.year_group_id,
    c.country_code,
    c.contact_details_confirmed_at,
    (c.address_line1 is null or c.country_code is null) as never_completed,
    not exists (select 1 from public.pupil_emergency_contacts pec where pec.child_id = c.id)
      as no_emergency_contacts,
    not exists (
      select 1 from public.pupil_emergency_contacts pec
      where pec.child_id = c.id and pec.is_local_adult
    ) as no_local_adult
  from public.children c
  where c.removed_on is null
    and (
      c.contact_details_confirmed_at is null
      or c.contact_details_confirmed_at < now() - interval '100 days'
      or c.address_line1 is null
      or c.country_code is null
      or not exists (select 1 from public.pupil_emergency_contacts pec where pec.child_id = c.id)
    );

comment on view public.pupils_contact_details_overdue is
  'Pupils whose address/emergency contacts have never been completed or were last confirmed more than 100 days ago (policy 09 §6 requires a check each term and on every move). Also flags pupils with no emergency contact at all, and pupils with no local adult among their contacts — policies 01 §10 and 24 §11 ask for one "where possible", so this is a prompt to ask, not a hard failure.';
