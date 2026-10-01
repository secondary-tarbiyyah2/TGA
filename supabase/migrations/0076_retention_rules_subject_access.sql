-- 0076: data protection tooling.
--
-- (a) retention_rules: an admin-editable rule per data category (period in
--     months + delete/anonymise) that drives a DRY-RUN-FIRST review screen.
--     Nothing here ever runs on a schedule: retention_preview() lists what is
--     due (and what is held back), and retention_run() only acts when the
--     caller passes back the exact number of records they reviewed, so the
--     list cannot silently change between "review" and "run". Every run is
--     written to retention_job_runs (0015) and to audit_log, and the audit
--     history of the removed records is redacted so the audit trail does not
--     keep the very personal data the rule was meant to remove.
--
--     This sits ALONGSIDE the human-readable retention_schedule (0015) and the
--     existing per-feature jobs (recordings, messages, sign-in log): those keep
--     their own settings. The seeded periods are sensible starting points for a
--     UK independent school, NOT legal advice - the screen says so and each
--     rule carries an editable 'basis' note. Check against ICO/DfE guidance and
--     your legal adviser before relying on them.
--
-- (b) subject-access export support: data_export_log (who exported what, when,
--     which file, expiry; no personal content) and the private 'data-exports'
--     bucket. The export itself is the subject-access-export Edge Function.
--
-- Idempotent: safe to re-run.

-- ═══ (a) retention_rules ═══════════════════════════════════════════════════

create table if not exists public.retention_rules (
  id bigint generated always as identity primary key, -- audit_row_change() needs NEW.id
  category text not null unique,
  label text not null,
  description text not null,
  retention_months int not null check (retention_months between 1 and 600),
  action text not null check (action in ('delete', 'anonymise')),
  allowed_actions text[] not null default '{delete}',
  basis_note text not null default '',
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_count int,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint retention_rules_action_allowed check (action = any (allowed_actions))
);

alter table public.retention_rules enable row level security;

drop policy if exists "retention_rules: head_teacher/admin read" on public.retention_rules;
create policy "retention_rules: head_teacher/admin read"
  on public.retention_rules for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- Update only: categories are tied to code in retention_due_rows(), so a
-- client can tune a rule but never add or remove one.
drop policy if exists "retention_rules: head_teacher/admin update" on public.retention_rules;
create policy "retention_rules: head_teacher/admin update"
  on public.retention_rules for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.retention_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.category := old.category;
  new.label := old.label;
  new.description := old.description;
  new.allowed_actions := old.allowed_actions;
  if coalesce(current_setting('app.retention_run', true), '') <> '1' then
    new.last_run_at := old.last_run_at;
    new.last_run_count := old.last_run_count;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists retention_rules_guard on public.retention_rules;
create trigger retention_rules_guard
  before update on public.retention_rules
  for each row execute function public.retention_rules_guard();

drop trigger if exists audit_retention_rules on public.retention_rules;
create trigger audit_retention_rules
  after insert or update or delete on public.retention_rules
  for each row execute function public.audit_row_change();

insert into public.retention_rules (category, label, description, retention_months, action, allowed_actions, basis_note) values
  ('admissions_not_proceeded',
   'Admissions: applications that did not proceed',
   'Applications still at New, or Declined/Withdrawn, with no activity for the period (and the messages and stage notes attached to them). Offered, accepted, waitlisted and in-progress applications are never touched. Applications with uploaded documents or payment proofs are held back for manual clean-up.',
   12, 'delete', '{delete,anonymise}',
   'Starting point: one admissions cycle plus a short appeal window (commonly 6-12 months). Check against ICO and DfE guidance and take legal advice before changing.'),
  ('messages',
   'Parent, staff and student messages',
   'Whole conversations whose latest message is older than the period. Conversations containing a message flagged for safeguarding are held back.',
   24, 'delete', '{delete}',
   'Starting point matches the nightly messaging job (messaging_settings, default 730 days); whichever is shorter applies. Some schools keep communications longer (up to 7 years) as evidence for complaints or claims - decide with your legal adviser and ICO guidance.'),
  ('quiz_leads',
   'Eligibility quiz leads (prospective parents)',
   'Email, name, notes and answers captured by the public eligibility quiz, older than the period.',
   12, 'delete', '{delete,anonymise}',
   'Marketing-style data held on consent: keep no longer than needed to follow up (commonly 6-12 months). Check against ICO guidance.')
on conflict (category) do nothing;

-- ── what is due, per category (internal) ──────────────────────────────────
-- Returns ONLY a reference label and a date for each record - never names,
-- emails or message text - so the dry-run list is safe to show.
create or replace function public.retention_due_rows(p_category text, p_months int)
returns table (record_id text, record_label text, record_date timestamptz, held boolean, held_reason text)
language plpgsql
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cutoff timestamptz := now() - make_interval(months => p_months);
begin
  if p_category = 'admissions_not_proceeded' then
    return query
    select a.id::text,
           'Application ' || coalesce(a.reference, left(a.id::text, 8)) || ' (' || a.status || ')',
           a.updated_at,
           x.has_files,
           case when x.has_files then 'Has uploaded documents or payment proofs - remove the files manually first' end
    from public.admissions_applications a
    cross join lateral (
      select (
        exists (select 1 from public.admissions_payment_proofs pp where pp.application_id = a.id)
        or exists (select 1 from storage.objects o where o.bucket_id = 'admissions-documents' and split_part(o.name, '/', 1) = a.id::text)
        or exists (select 1 from public.admissions_stage_details s where s.application_id = a.id and s.assessment_results_path is not null)
      ) as has_files
    ) x
    where a.status in ('new', 'declined', 'withdrawn')
      and a.updated_at < v_cutoff
      and a.parent_email <> 'redacted@example.invalid'
    order by a.updated_at;

  elsif p_category = 'messages' then
    return query
    select t.id::text,
           'Conversation (' || t.kind || '), last message ' || to_char(m.last_at, 'YYYY-MM-DD'),
           m.last_at,
           m.has_flagged,
           case when m.has_flagged then 'Contains a message flagged for safeguarding review' end
    from public.message_threads t
    join (
      select mm.thread_id, max(mm.created_at) as last_at, bool_or(mm.flagged) as has_flagged
      from public.message_thread_messages mm
      group by mm.thread_id
    ) m on m.thread_id = t.id
    where m.last_at < v_cutoff
    order by m.last_at;

  elsif p_category = 'quiz_leads' then
    return query
    select q.id::text,
           'Quiz lead ' || q.lead_ref,
           q.created_at,
           false,
           null::text
    from public.quiz_leads q
    where q.created_at < v_cutoff
      and q.email <> 'redacted@example.invalid'
    order by q.created_at;
  end if;
end;
$$;

revoke all on function public.retention_due_rows(text, int) from public, anon, authenticated;

-- ── the dry-run screen ────────────────────────────────────────────────────
create or replace function public.retention_preview()
returns table (
  category text,
  rule_label text,
  action text,
  retention_months int,
  record_id text,
  record_label text,
  record_date timestamptz,
  held boolean,
  held_reason text
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or Admin can review retention' using errcode = '42501';
  end if;
  return query
  select r.category, r.label, r.action, r.retention_months,
         d.record_id, d.record_label, d.record_date, d.held, d.held_reason
  from public.retention_rules r
  cross join lateral (
    select * from public.retention_due_rows(r.category, r.retention_months) limit 1000
  ) d
  where r.enabled
  order by r.category, d.record_date;
end;
$$;

revoke all on function public.retention_preview() from public, anon;
grant execute on function public.retention_preview() to authenticated;

-- Removes personal data from audit rows about records that retention removed.
create or replace function public.retention_redact_audit(p_table text, p_ids text[])
returns int
language sql
security definer
set search_path = public
as $$
  with u as (
    update public.audit_log
       set changes = jsonb_build_object('redacted', 'removed under a retention rule')
     where target_table = p_table
       and target_id = any (p_ids)
       and changes is not null
    returning 1
  )
  select count(*)::int from u;
$$;

revoke all on function public.retention_redact_audit(text, text[]) from public, anon, authenticated;

-- ── run one category, after review ────────────────────────────────────────
create or replace function public.retention_run(p_category text, p_expected int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.retention_rules%rowtype;
  v_ids uuid[];
  v_id_text text[];
  v_sub_ids text[];
  v_thread_msgs text[];
  v_n int := 0;
  v_email text;
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or Admin can run retention' using errcode = '42501';
  end if;

  select * into v_rule from public.retention_rules where category = p_category;
  if not found then
    raise exception 'Unknown retention category';
  end if;
  if not v_rule.enabled then
    raise exception 'This retention rule is switched off';
  end if;

  select coalesce(array_agg(d.record_id::uuid), '{}'::uuid[])
    into v_ids
  from public.retention_due_rows(v_rule.category, v_rule.retention_months) d
  where not d.held;

  if cardinality(v_ids) <> coalesce(p_expected, -1) then
    raise exception 'The list changed since you reviewed it (% record(s) are due now, you reviewed %). Review it again.',
      cardinality(v_ids), coalesce(p_expected, -1) using errcode = 'P0001';
  end if;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  v_id_text := array(select u::text from unnest(v_ids) u);
  perform set_config('app.retention_run', '1', true);

  if v_rule.category = 'admissions_not_proceeded' then
    select coalesce(array_agg(m.id::text), '{}'::text[]) into v_sub_ids
    from public.admissions_messages m where m.application_id = any (v_ids);

    if v_rule.action = 'delete' then
      delete from public.admissions_applications where id = any (v_ids); -- cascades messages and stage details
    else
      delete from public.admissions_messages where application_id = any (v_ids);
      delete from public.admissions_stage_details where application_id = any (v_ids);
      update public.admissions_applications
         set parent_name = 'Redacted',
             parent_email = 'redacted@example.invalid',
             parent_phone = '00000',
             relationship = null,
             address = null,
             child_first_name = 'Redacted',
             child_last_name = 'Redacted',
             child_dob = date '2000-01-01',
             child_gender = null,
             current_school = null,
             previous_islamic_education = null,
             send_or_medical_notes = null,
             sibling_details = null,
             declaration_name = 'Redacted',
             notes = null,
             decision_note = null,
             sibling_applicants = '[]'::jsonb
       where id = any (v_ids);
    end if;
    perform public.retention_redact_audit('admissions_applications', v_id_text);
    perform public.retention_redact_audit('admissions_stage_details', v_id_text);
    perform public.retention_redact_audit('admissions_messages', v_sub_ids);

  elsif v_rule.category = 'messages' then
    select coalesce(array_agg(m.id::text), '{}'::text[]) into v_thread_msgs
    from public.message_thread_messages m where m.thread_id = any (v_ids);

    delete from public.message_threads where id = any (v_ids); -- cascades the messages
    perform public.retention_redact_audit('message_threads', v_id_text);
    perform public.retention_redact_audit('message_thread_messages', v_thread_msgs);

  elsif v_rule.category = 'quiz_leads' then
    if v_rule.action = 'delete' then
      delete from public.quiz_leads where id = any (v_ids);
    else
      update public.quiz_leads
         set email = 'redacted@example.invalid',
             parent_name = null,
             staff_notes = null,
             answers_snapshot = '{}'::jsonb
       where id = any (v_ids);
    end if;
    perform public.retention_redact_audit('quiz_leads', v_id_text);

  else
    raise exception 'No retention action is implemented for this category';
  end if;

  v_n := cardinality(v_ids);
  select email into v_email from public.profiles where id = auth.uid();

  insert into public.retention_job_runs (data_type, action, rows_affected, notes)
  values (v_rule.label, v_rule.action, v_n, 'Manual run by ' || coalesce(v_email, 'unknown') || ' after reviewing the dry-run list');

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (auth.uid(), v_email, 'RETENTION_RUN', 'retention_rules', v_rule.id::text,
          jsonb_build_object('category', v_rule.category, 'action', v_rule.action,
                             'retention_months', v_rule.retention_months, 'rows', v_n, 'record_ids', v_id_text));

  update public.retention_rules set last_run_at = now(), last_run_count = v_n where id = v_rule.id;
  return v_n;
end;
$$;

revoke all on function public.retention_run(text, int) from public, anon;
grant execute on function public.retention_run(text, int) to authenticated;

-- ═══ (b) subject-access exports ═══════════════════════════════════════════

-- One row per export. Holds no personal content beyond a name label so the
-- admin can recognise it; the audit_log entry is written by the Edge Function
-- (with the real actor), so there is deliberately no audit trigger here.
create table if not exists public.data_export_log (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('pupil', 'parent')),
  subject_profile_id uuid references public.profiles(id) on delete set null,
  subject_child_id uuid references public.children(id) on delete set null,
  subject_label text not null,
  include_child_records boolean not null default false,
  include_safeguarding boolean not null default false,
  requested_by uuid references public.profiles(id) on delete set null,
  data_rights_request_id uuid references public.data_rights_requests(id) on delete set null,
  sections jsonb not null default '{}'::jsonb, -- record counts per section, no content
  storage_prefix text not null, -- folder inside the data-exports bucket
  expires_at timestamptz not null,
  files_deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists data_export_log_created_idx on public.data_export_log (created_at desc);

alter table public.data_export_log enable row level security;

drop policy if exists "data_export_log: head_teacher/admin read" on public.data_export_log;
create policy "data_export_log: head_teacher/admin read"
  on public.data_export_log for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));
-- No insert/update/delete policy: only the Edge Function (service role) writes.

-- Private bucket. No storage.objects policy at all: nobody reads it through
-- the API; the Edge Function mints a 24-hour signed URL with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('data-exports', 'data-exports', false, 26214400, array['application/json', 'text/html'])
on conflict (id) do update
  set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/json', 'text/html'];
