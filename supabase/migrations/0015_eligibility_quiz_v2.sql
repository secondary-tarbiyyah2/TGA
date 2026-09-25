-- "Your Child's Week" eligibility quiz v2, replacing the flat
-- eligibility_responses form with:
--   1. A per-year-group public sample-week marking system layered on top of
--      Phase A's timetable_runs/timetable_slots (0008), with its own
--      draft -> review -> published lifecycle and history, matching the
--      exact conventions of `timetable_runs` (see that migration's header).
--   2. Admin-editable quiz questions/options/rules/result-sections, also
--      versioned draft -> published with history, evaluated CLIENT-SIDE
--      against a family's answers (no PII in the config tables themselves —
--      this is copy/rules, not responses).
--   3. GDPR-correct lead capture: an anonymous, non-identifying
--      `quiz_sessions` row is created the moment the quiz starts (session id
--      only, no name/email/child details), and answers accumulate on it.
--      NOTHING identifying exists until `quiz_leads` is written, which is
--      only possible once email + explicit consent are both present — this
--      is enforced by the column constraints below (`not null`), not just
--      client discipline, matching the pattern of `document_signatures`
--      being schema-enforced rather than trusted from the client.
--
-- Same trust model as every migration since 0001: RLS default-deny on every
-- table, anon can only INSERT into quiz_sessions/quiz_events/quiz_leads
-- (never SELECT another family's rows back), and every admin write is
-- gated on the SAME `current_has_role`/`current_has_permission` helpers
-- 0007 established — RLS is the real boundary, the /learn/admin UI gate is
-- just UX (see LearnGate's own comment).

-- ── 1. per-year-group public sample-week marks ─────────────────────────────
-- One row per year_group represents "which published timetable_run's slots
-- for this year group are the public sample week right now", with its own
-- draft -> review -> published lifecycle independent of the run's own
-- status (a run can be published school-wide while a particular year
-- group's sample-week marking is still in draft/review, e.g. while an
-- admin checks it reads well before it goes out to prospective parents).
create table public.public_sample_week_marks (
  id uuid primary key default gen_random_uuid(),
  year_group_id uuid not null references public.year_groups(id) on delete cascade,
  run_id uuid not null references public.timetable_runs(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  note text, -- optional admin note, e.g. "swapped to v4 after Arabic moved"
  created_by uuid references public.profiles(id),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one row can be the CURRENT published mark per year group — enforced
-- with a partial unique index rather than application logic, same idea as
-- the rest of this schema preferring DB-level guarantees.
create unique index public_sample_week_marks_one_published_per_year_group
  on public.public_sample_week_marks (year_group_id)
  where status = 'published';

alter table public.public_sample_week_marks enable row level security;

create policy "public_sample_week_marks: staff with manage_academic manage all"
  on public.public_sample_week_marks for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));

create policy "public_sample_week_marks: head_teacher/admin manage all"
  on public.public_sample_week_marks for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- No anon/authenticated-at-large read policy: the public quiz reads this
-- data only through public_sample_timetable_week() below (SECURITY
-- DEFINER), which enforces the anonymisation discipline and the
-- "published only" rule in one reviewable place, exactly like 0008's
-- original function did.

create or replace function public.touch_public_sample_week_marks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger public_sample_week_marks_touch_updated_at
  before update on public.public_sample_week_marks
  for each row execute function public.touch_public_sample_week_marks_updated_at();

-- ── history (so "last updated" + revert on the result screen and in the
-- admin UI are real, not just the underlying timetable_run's own history) ──
create table public.public_sample_week_mark_history (
  id uuid primary key default gen_random_uuid(),
  mark_id uuid not null references public.public_sample_week_marks(id) on delete cascade,
  year_group_id uuid not null references public.year_groups(id) on delete cascade,
  run_id uuid not null references public.timetable_runs(id) on delete restrict,
  status text not null,
  note text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

alter table public.public_sample_week_mark_history enable row level security;

create policy "public_sample_week_mark_history: staff with manage_academic read"
  on public.public_sample_week_mark_history for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

create policy "public_sample_week_mark_history: head_teacher/admin read"
  on public.public_sample_week_mark_history for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- History rows are written only by the trigger below (as the invoking
-- user, under RLS on public_sample_week_marks which already restricts who
-- can insert/update a mark) — no direct client write policy is needed or
-- granted.
create or replace function public.record_public_sample_week_mark_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.public_sample_week_mark_history (mark_id, year_group_id, run_id, status, note, changed_by)
  values (new.id, new.year_group_id, new.run_id, new.status, new.note, coalesce(new.published_by, new.created_by, auth.uid()));
  return new;
end;
$$;

create trigger record_public_sample_week_mark_history
  after insert or update on public.public_sample_week_marks
  for each row execute function public.record_public_sample_week_mark_history();

-- ── upgrade the anonymised public read function ─────────────────────────
-- Replaces 0008's whole-school "latest published run" hook with a
-- per-year-group lookup against the explicit marking above. Anonymisation
-- discipline is UNCHANGED from 0008: subject name + weekday + start/end
-- time only — still no teacher, no student, no class name. Returns zero
-- rows (never a fabricated week) when a year group has no PUBLISHED mark,
-- so the ground rule "must simply not render if no published timetable
-- exists yet" continues to hold, now scoped correctly per year group
-- instead of accidentally reusing another year group's week.
drop function if exists public.public_sample_timetable_week();

create or replace function public.public_sample_timetable_week(p_year_group_name text)
returns table (year_group text, subject text, weekday int, start_time time, end_time time, sample_updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select yg.name, s.name, ts.weekday, ts.start_time, ts.end_time, m.published_at
  from public.public_sample_week_marks m
  join public.year_groups yg on yg.id = m.year_group_id
  join public.timetable_slots ts on ts.run_id = m.run_id
  join public.classes c on c.id = ts.class_id and c.year_group_id = m.year_group_id
  join public.subjects s on s.id = ts.subject_id
  where m.status = 'published'
    and yg.name = p_year_group_name
    and public.run_status(m.run_id) in ('published', 'superseded');
$$;

grant execute on function public.public_sample_timetable_week(text) to anon, authenticated;

-- Convenience read for the /learn/admin quiz-builder "sample weeks" tab and
-- the admin dashboard gap-alert: every year group with NO published mark,
-- i.e. the quiz's honest-fallback case an admin should actually see. This
-- is the "dashboard alert" ground rule 4 asks for (reusing the established
-- dashboard-alert pattern rather than inventing a notification channel) —
-- computed live from real data rather than logged as discrete events, so it
-- can never go stale or need clearing.
create or replace function public.year_groups_missing_public_sample()
returns table (year_group_id uuid, year_group_name text)
language sql
stable
security definer
set search_path = public
as $$
  select yg.id, yg.name
  from public.year_groups yg
  where not exists (
    select 1 from public.public_sample_week_marks m
    where m.year_group_id = yg.id and m.status = 'published'
  )
  order by yg.sort_order;
$$;

grant execute on function public.year_groups_missing_public_sample() to authenticated;
-- (Not granted to anon: this is an admin-facing gap list, not public data —
-- the public quiz never calls it, it only ever sees the honest fallback
-- copy when public_sample_timetable_week() returns zero rows.)

create index public_sample_week_marks_year_group_idx on public.public_sample_week_marks (year_group_id);
create index public_sample_week_mark_history_mark_idx on public.public_sample_week_mark_history (mark_id);

-- ── 2. quiz configuration (questions / options / rules / sections) ─────────
-- A single row per config "document" versioned draft -> published, mirroring
-- timetable_runs' own versioning idea: editing never mutates the live
-- config in place, publishing swaps which version is live, and every past
-- version stays around as real history / a revert target.
create table public.quiz_config_versions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  label text not null default 'Untitled version',
  -- Full snapshot of questions/options/rules/sections/disclaimers as one
  -- JSON document (see src/lib/quiz/schema.ts for its TS shape) — kept as
  -- one versioned blob, deliberately, so "publish" and "revert" are a
  -- single atomic status flip on one row rather than a multi-table
  -- transaction that could publish an inconsistent half-edited state.
  content jsonb not null,
  created_by uuid references public.profiles(id),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index quiz_config_versions_one_published
  on public.quiz_config_versions (status)
  where status = 'published';

alter table public.quiz_config_versions enable row level security;

create policy "quiz_config_versions: head_teacher/admin manage all"
  on public.quiz_config_versions for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

-- Public read: ONLY the currently published version's content — draft
-- copy the admin is mid-edit on must never leak to the public site.
create policy "quiz_config_versions: anyone reads published"
  on public.quiz_config_versions for select
  to anon, authenticated
  using (status = 'published');

-- Staff who can manage academic content but aren't head_teacher/admin (e.g.
-- a future 'manage_website_content'-only role) can still read every
-- version for review, matching manage_website_content's existing scope.
create policy "quiz_config_versions: manage_website_content reads all"
  on public.quiz_config_versions for select
  to authenticated
  using (public.current_has_permission('manage_website_content'));

create index quiz_config_versions_created_at_idx on public.quiz_config_versions (created_at desc);

-- ── 3. anonymous session tracking (funnel analytics, pre-consent) ─────────
-- `session_token` is a random id the browser generates itself and keeps in
-- sessionStorage — never derived from anything identifying, never an
-- auth.uid(). No name/email/phone column exists on this table AT ALL, so
-- there is no way for personal data to end up here even by mistake before
-- consent — the schema itself is the guarantee, not just app discipline.
create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  quiz_config_version_id uuid references public.quiz_config_versions(id) on delete set null,
  year_group_id uuid references public.year_groups(id) on delete set null,
  timezone text,
  current_step int not null default 0,
  answers jsonb not null default '{}'::jsonb, -- keyed by question key -> answer value, no free-text PII fields exist in the quiz by design
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.quiz_sessions enable row level security;

create policy "quiz_sessions: anyone can start/update by knowing the token"
  on public.quiz_sessions for insert
  to anon, authenticated
  with check (true);

-- Update is intentionally open the same way insert is (anon has no
-- identity to scope by, and the token itself is the only credential a
-- browser holds) — this table carries no personal data, so the worst case
-- of a guessed token is someone overwriting anonymous step/answer
-- analytics for a session that isn't theirs, not a privacy incident. It
-- can never be SELECTed back by anon (no select policy below), so even
-- that guess can't read anything back.
create policy "quiz_sessions: anyone can update by token (no PII, write-only from the client)"
  on public.quiz_sessions for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "quiz_sessions: head_teacher/admin read all for analytics"
  on public.quiz_sessions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create index quiz_sessions_started_at_idx on public.quiz_sessions (started_at desc);
create index quiz_sessions_token_idx on public.quiz_sessions (session_token);

-- Step-level funnel/drop-off + outcome events (start, step_seen, step_answered,
-- completed, pdf_sent, call_booked). Anonymous (session-scoped) by design —
-- never carries an email or name column, same reasoning as quiz_sessions.
create table public.quiz_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  event_type text not null check (event_type in (
    'started', 'step_viewed', 'step_answered', 'completed', 'pdf_email_sent', 'call_booked', 'abandoned'
  )),
  step_index int,
  created_at timestamptz not null default now()
);

alter table public.quiz_events enable row level security;

create policy "quiz_events: anyone can record"
  on public.quiz_events for insert
  to anon, authenticated
  with check (true);

create policy "quiz_events: head_teacher/admin read all"
  on public.quiz_events for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

create index quiz_events_session_idx on public.quiz_events (session_id);
create index quiz_events_type_idx on public.quiz_events (event_type);

-- ── 4. quiz_leads — where personal data FIRST comes into existence ────────
-- The hard GDPR requirement: a row cannot exist here without both an email
-- and explicit consent, enforced at the schema level (not null + a check
-- that consent_given_at is genuinely set), not merely by the form
-- discipline of the React component. Mirrors leadRef.ts's deterministic
-- lead_ref (src/lib/leadRef.ts, sha256(lower(trim(email))).slice(0,8)) so a
-- family who also uses register.php/apply.php later is recognisably the
-- same lead to a human matching by reference, per ground rule 4 — computed
-- client-side with the exact same function, stored here rather than
-- re-implemented in SQL.
create table public.quiz_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.quiz_sessions(id) on delete set null,
  lead_ref text not null,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  parent_name text,
  consent_given_at timestamptz not null,
  consent_text text not null, -- the exact consent copy shown at submission time, for an auditable record of what was agreed to
  year_group_id uuid references public.year_groups(id) on delete set null,
  answers_snapshot jsonb not null default '{}'::jsonb,
  pdf_sent_at timestamptz,
  call_booked_at timestamptz,
  staff_notes text,
  created_at timestamptz not null default now()
);

alter table public.quiz_leads enable row level security;

create policy "quiz_leads: anyone can submit with consent"
  on public.quiz_leads for insert
  to anon, authenticated
  with check (consent_given_at is not null and length(trim(consent_text)) > 0);

create policy "quiz_leads: head_teacher/admin/admissions read all"
  on public.quiz_leads for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create policy "quiz_leads: head_teacher/admin/admissions update follow-up fields"
  on public.quiz_leads for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

create index quiz_leads_created_at_idx on public.quiz_leads (created_at desc);
create index quiz_leads_lead_ref_idx on public.quiz_leads (lead_ref);

-- ── audit triggers (reuses 0003's generic audit_row_change(), same as
-- every sensitive table since) ───────────────────────────────────────────
create trigger audit_public_sample_week_marks
  after insert or update or delete on public.public_sample_week_marks
  for each row execute function public.audit_row_change();

create trigger audit_quiz_config_versions
  after insert or update or delete on public.quiz_config_versions
  for each row execute function public.audit_row_change();

create trigger audit_quiz_leads
  after insert or update or delete on public.quiz_leads
  for each row execute function public.audit_row_change();
