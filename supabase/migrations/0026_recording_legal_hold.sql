-- Legal hold + access logging + retention classes for lesson recordings.
--
-- Why this migration exists
-- -------------------------
-- `lesson_recordings` (0009) had a single `retention_deletes_at`, and
-- scripts/lms-recording-retention.mjs deletes anything past it. Policy 04 §6
-- defines three retention classes, not one:
--
--   | Recording type                                    | Retention        |
--   | Routine lesson recordings                         | 1 academic year  |
--   | Recordings shared as learning resources           | End of the academic year in which shared |
--   | Recordings relevant to a safeguarding concern,    | "Kept securely until the matter is
--   | allegation, complaint or legal claim              |  resolved and then in line with the
--   |                                                   |  retention period for that record" |
--
-- The third case cannot be expressed as a date, because nobody knows when an
-- investigation will finish. Without it, the retention job will delete
-- evidence in the middle of a live safeguarding case, a staff allegation
-- (policy 01 §16) or a Stage 2 complaint whose investigation policy 26 §5
-- explicitly says includes "review of relevant records such as lesson
-- recordings where appropriate". That is the worst failure mode this system
-- has: it is automated, silent, irreversible, and it destroys exactly the
-- material an investigation needs.
--
-- This migration makes deletion refuse to happen while a hold is on, at the
-- database level rather than by asking the job to remember.
--
-- It also adds the access log policy 04 §5 requires: "Every access to a
-- recording for safeguarding, behaviour or complaint purposes is logged."

-- ── retention class + legal hold ────────────────────────────────────────
alter table public.lesson_recordings
  add column retention_class text not null default 'routine'
    check (retention_class in ('routine', 'shared_resource')),
  add column legal_hold boolean not null default false,
  add column legal_hold_reason text,
  -- Which kind of matter the hold is for. Drives nothing automatically —
  -- the point of a hold is that a human decides when it lifts — but it makes
  -- the register reviewable ("what are we holding, and why, and since when").
  add column legal_hold_matter text
    check (legal_hold_matter is null or legal_hold_matter in
      ('safeguarding_concern', 'staff_allegation', 'complaint', 'legal_claim', 'other')),
  add column legal_hold_set_by uuid references public.profiles(id),
  add column legal_hold_set_at timestamptz,
  add column legal_hold_released_by uuid references public.profiles(id),
  add column legal_hold_released_at timestamptz,
  -- Set when retention_class = 'shared_resource': policy 04 §6 retains those
  -- until the end of the academic year in which they were shared, which is a
  -- different clock from the routine one-year-from-recording rule.
  add column shared_as_resource_at timestamptz;

alter table public.lesson_recordings
  add constraint lesson_recordings_legal_hold_shape check (
    (legal_hold = false)
    or (legal_hold = true
        and legal_hold_reason is not null
        and length(btrim(legal_hold_reason)) > 0
        and legal_hold_matter is not null
        and legal_hold_set_at is not null)
  );

comment on column public.lesson_recordings.legal_hold is
  'While true, this recording is exempt from automated retention deletion (policy 04 §6: recordings relevant to a safeguarding concern, allegation, complaint or legal claim are kept until the matter is resolved). Enforced by the prevent_deleting_recording_on_legal_hold trigger, not just by the retention job.';

create index lesson_recordings_legal_hold_idx
  on public.lesson_recordings (legal_hold) where legal_hold;

-- ── the actual guarantee ────────────────────────────────────────────────
-- A trigger rather than an RLS policy, because the retention job runs with
-- the service-role key, which bypasses RLS entirely. A policy would look
-- like protection and provide none against the one caller that actually
-- performs the deletion. Triggers fire for service-role too.
create function public.prevent_deleting_recording_on_legal_hold()
returns trigger
language plpgsql
as $$
begin
  if old.legal_hold then
    raise exception
      'Recording % is on legal hold (%): %. Release the hold before deleting.',
      old.id, old.legal_hold_matter, old.legal_hold_reason
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger prevent_deleting_recording_on_legal_hold
  before delete on public.lesson_recordings
  for each row execute function public.prevent_deleting_recording_on_legal_hold();

comment on function public.prevent_deleting_recording_on_legal_hold() is
  'Refuses deletion of a recording under legal hold. A BEFORE DELETE trigger, deliberately not an RLS policy: the retention job uses the service-role key which bypasses RLS, so RLS would give the appearance of protection against the only caller that deletes.';

-- ── who may set and release a hold ───────────────────────────────────────
-- `lesson_recordings` has no client write policies at all in 0009 (all
-- writes go through Edge Functions / the service role). Holds are the one
-- thing a human needs to set urgently, from the UI, at the moment a concern
-- is raised — waiting for a script is how evidence gets lost. So this adds
-- a narrow update path for exactly the two roles policy 04 §5 gives full
-- recording access to, restricted to the hold columns by a check that
-- nothing else changed.
create function public.set_recording_legal_hold(
  p_recording_id uuid,
  p_matter text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher', 'admin'])
  ) then
    raise exception 'Not permitted to place a recording on legal hold'
      using errcode = 'insufficient_privilege';
  end if;

  update public.lesson_recordings
     set legal_hold = true,
         legal_hold_matter = p_matter,
         legal_hold_reason = p_reason,
         legal_hold_set_by = auth.uid(),
         legal_hold_set_at = now(),
         legal_hold_released_by = null,
         legal_hold_released_at = null
   where id = p_recording_id;

  if not found then
    raise exception 'Recording % not found', p_recording_id;
  end if;
end;
$$;

create function public.release_recording_legal_hold(
  p_recording_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Deliberately narrower than setting a hold: releasing one makes a
  -- recording deletable again, so it is a DSL/Headteacher decision only,
  -- never a general admin one.
  if not (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_role(array['head_teacher'])
  ) then
    raise exception 'Only the safeguarding lead or Headteacher may release a legal hold'
      using errcode = 'insufficient_privilege';
  end if;

  update public.lesson_recordings
     set legal_hold = false,
         legal_hold_released_by = auth.uid(),
         legal_hold_released_at = now(),
         -- The reason the hold existed is kept, with the release appended —
         -- "why was this held and who let it go" is the audit question.
         legal_hold_reason = coalesce(legal_hold_reason, '') ||
           ' | RELEASED: ' || coalesce(p_reason, '(no reason given)')
   where id = p_recording_id
     and legal_hold;

  if not found then
    raise exception 'Recording % not found or not on hold', p_recording_id;
  end if;
end;
$$;

revoke all on function public.set_recording_legal_hold(uuid, text, text) from public;
revoke all on function public.release_recording_legal_hold(uuid, text) from public;
grant execute on function public.set_recording_legal_hold(uuid, text, text) to authenticated;
grant execute on function public.release_recording_legal_hold(uuid, text) to authenticated;

-- ── recording_access_log ────────────────────────────────────────────────
-- Policy 04 §5, final line. `audit_log` (0003) records row *changes*;
-- viewing a recording changes no row, so it would leave no trace there.
-- This is a separate, append-only log with a reason code, because the
-- policy's own access matrix is organised by purpose (safeguarding,
-- behaviour, complaints, quality assurance, learning support) and "who
-- watched which child's lesson, and why" is the question a subject access
-- request or an inspection asks.
create table public.recording_access_log (
  id bigint generated always as identity primary key,
  recording_id uuid not null references public.lesson_recordings(id) on delete cascade,
  accessed_by uuid not null references public.profiles(id),
  -- The purposes in policy 04 §3/§5.
  purpose text not null check (purpose in
    ('safeguarding', 'behaviour', 'complaint', 'quality_assurance',
     'learning_support', 'own_lesson_reflection', 'subject_access_request', 'other')),
  purpose_note text,
  accessed_at timestamptz not null default now()
);

create index recording_access_log_recording_idx
  on public.recording_access_log (recording_id, accessed_at desc);
create index recording_access_log_actor_idx
  on public.recording_access_log (accessed_by, accessed_at desc);

alter table public.recording_access_log enable row level security;

-- Written by the recording-access Edge Function (service role) at the moment
-- it issues a playback URL — not by the client, which could simply not call
-- it. No insert policy for `authenticated` on purpose.
create policy "recording_access_log: safeguarding/leadership read"
  on public.recording_access_log for select
  to authenticated
  using (
    public.current_has_permission('safeguarding_lead')
    or public.current_has_permission('view_compliance')
    or public.current_has_role(array['head_teacher', 'admin'])
  );

create policy "recording_access_log: staff read own accesses"
  on public.recording_access_log for select
  to authenticated
  using (accessed_by = auth.uid());

-- No update or delete policy anywhere: an access log that can be edited is
-- not an access log. Same rule as safeguarding_concerns in 0015.

-- ── recordings_on_legal_hold ────────────────────────────────────────────
-- The reviewable register. A hold that nobody revisits becomes indefinite
-- retention by accident, which is its own UK GDPR problem (principle 5,
-- policy 28 §3) — so the register surfaces how long each hold has been open.
create view public.recordings_on_legal_hold
  with (security_invoker = true) as
  select
    r.id as recording_id,
    r.lesson_instance_id,
    r.recorded_at,
    r.legal_hold_matter,
    r.legal_hold_reason,
    r.legal_hold_set_at,
    r.legal_hold_set_by,
    date_part('day', now() - r.legal_hold_set_at)::int as days_on_hold,
    r.retention_deletes_at as would_have_deleted_at
  from public.lesson_recordings r
  where r.legal_hold;

comment on view public.recordings_on_legal_hold is
  'Recordings currently exempt from automated deletion, with how long each hold has been open. Reviewed so that a hold placed during an investigation does not quietly become permanent retention after the matter closes (policy 28 §3, principle 5).';
