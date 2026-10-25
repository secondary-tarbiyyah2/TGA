-- Entry assessment: breaks, one active window per sitting, and writing marks
-- (AI or estimate first, then checked by staff).
--
-- Like entry_assessments (0116), these tables are written only by the
-- entry-assessment Edge Function (service role), which re-checks roles.
-- Staff with admissions/leadership roles can read them. Candidates never
-- read them directly. Idempotent.

-- Breaks taken during timed parts: [{ section, start, end?, allowedMs }].
-- While a break runs, the clock is paused and the questions are not sent.
alter table public.entry_assessments add column if not exists breaks jsonb not null default '[]'::jsonb;
alter table public.entry_assessments add column if not exists break_started_at timestamptz;

-- The one window (browser tab or device) allowed to answer. Only a hash of
-- the window's token is stored. Kept out of entry_assessments so the regular
-- "still here" check-ins don't fill the audit log with copies of the paper.
create table if not exists public.entry_assessment_sessions (
  assessment_id uuid primary key references public.entry_assessments(id) on delete cascade,
  session_hash text not null,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  device text check (device is null or char_length(device) <= 300),
  windows int not null default 1
);
alter table public.entry_assessment_sessions enable row level security;
drop policy if exists "entry_assessment_sessions: staff read" on public.entry_assessment_sessions;
create policy "entry_assessment_sessions: staff read" on public.entry_assessment_sessions
  for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

-- Writing marks. One row per marking: source 'ai' or 'estimate' for the first
-- mark, 'staff' when a teacher accepts, adjusts or overrides it. The report
-- uses the latest staff row when there is one. Pupil names are never sent
-- to the AI; only the writing (with the pupil's name removed), the year group
-- and the task.
create table if not exists public.entry_assessment_writing_marks (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.entry_assessments(id) on delete cascade,
  item_id text,
  source text not null check (source in ('ai', 'estimate', 'staff')),
  status text not null default 'ok' check (status in ('ok', 'error')),
  model text check (model is null or char_length(model) <= 80),
  strands jsonb not null default '{}'::jsonb,
  overall text check (overall is null or overall in ('Well below', 'Below', 'Expected', 'Above', 'Well above')),
  working_at numeric(4, 1),
  feedback text check (feedback is null or char_length(feedback) <= 4000),
  next_steps jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  confidence text check (confidence is null or confidence in ('low', 'medium', 'high')),
  word_count int,
  error text check (error is null or char_length(error) <= 500),
  raw text check (raw is null or char_length(raw) <= 8000),
  -- Staff rows only.
  based_on uuid references public.entry_assessment_writing_marks(id) on delete set null,
  decision text check (decision is null or decision in ('accepted', 'adjusted', 'overridden', 'staff')),
  override_reason text check (override_reason is null or char_length(override_reason) <= 2000),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  check (source <> 'staff' or decision is not null),
  check (decision is distinct from 'overridden' or char_length(coalesce(override_reason, '')) >= 3)
);
create index if not exists entry_assessment_writing_marks_idx on public.entry_assessment_writing_marks (assessment_id, created_at desc);

alter table public.entry_assessment_writing_marks enable row level security;
drop policy if exists "entry_assessment_writing_marks: staff read" on public.entry_assessment_writing_marks;
create policy "entry_assessment_writing_marks: staff read" on public.entry_assessment_writing_marks
  for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop trigger if exists entry_assessment_writing_marks_audit on public.entry_assessment_writing_marks;
create trigger entry_assessment_writing_marks_audit
  after insert or update or delete on public.entry_assessment_writing_marks
  for each row execute function public.audit_row_change();

-- Atomic saves, so two answers (or two events) arriving at the same moment
-- can't overwrite each other. Called by the Edge Function only.
create or replace function public.entry_assessment_set_response(p_id uuid, p_item text, p_value jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.entry_assessments
  set responses = coalesce(responses, '{}'::jsonb) || jsonb_build_object(p_item, p_value), updated_at = now()
  where id = p_id;
$$;

create or replace function public.entry_assessment_add_event(p_id uuid, p_event jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.entry_assessments
  set events = case when jsonb_array_length(coalesce(events, '[]'::jsonb)) >= 1500
                    then (events - 0) || jsonb_build_array(p_event)
                    else coalesce(events, '[]'::jsonb) || jsonb_build_array(p_event) end
  where id = p_id;
$$;

revoke all on function public.entry_assessment_set_response(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.entry_assessment_add_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.entry_assessment_set_response(uuid, text, jsonb) to service_role;
grant execute on function public.entry_assessment_add_event(uuid, jsonb) to service_role;
