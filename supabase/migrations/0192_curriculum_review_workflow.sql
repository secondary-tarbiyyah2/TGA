-- Portal redesign, phase 5 (owner brief, 9 Nov 2026; docs/portal-redesign.md):
-- the single "sign off" becomes a proper review workflow.
--
--   draft -> submitted -> in_review -> changes_needed | approved -> published
--
-- Kept in the same table (curriculum_signoffs, migration 0102: one row per lesson
-- or spec unit) so nothing that reads it breaks. New here:
--   * who submitted, who approved and when, and which lesson version was approved;
--   * curriculum_review_events: every step, with the reviewer's comment;
--   * editing an approved or published lesson reopens it ("submitted", noted as
--     changed after approval), so an approval never silently covers new content.
--
-- Who may do what:
--   teachers (and heads/admins): submit, or withdraw their own submission to draft;
--   head_teacher/admin (reviewers): start review, approve, request changes, publish, reopen.

alter table public.curriculum_signoffs drop constraint if exists curriculum_signoffs_status_check;
alter table public.curriculum_signoffs
  add constraint curriculum_signoffs_status_check
  check (status in ('draft', 'submitted', 'in_review', 'changes_needed', 'approved', 'published'));

alter table public.curriculum_signoffs
  add column if not exists submitted_by uuid references public.profiles(id),
  add column if not exists submitted_name text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_name text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_version integer,
  add column if not exists changed_since_approval boolean not null default false;

create table if not exists public.curriculum_review_events (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,
  scope text not null check (scope in ('spec', 'lesson')),
  ref text not null,
  from_status text,
  to_status text not null,
  note text check (note is null or char_length(note) <= 1000),
  lesson_version integer,
  actor uuid references public.profiles(id),
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists curriculum_review_events_ref_idx on public.curriculum_review_events (subject_slug, scope, ref, created_at desc);

alter table public.curriculum_review_events enable row level security;

drop policy if exists "curriculum_review_events: staff read" on public.curriculum_review_events;
create policy "curriculum_review_events: staff read"
  on public.curriculum_review_events for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
-- No insert/update/delete policies: rows are written only by the functions below.

/** The lesson a 'lesson' sign-off ref ('y7/12') points at. */
create or replace function public.curriculum_lesson_for_ref(p_subject text, p_ref text)
returns public.curriculum_lessons
language sql
stable
security definer
set search_path = public
as $$
  select l.* from public.curriculum_lessons l
  where l.subject_slug = p_subject
    and l.year = split_part(p_ref, '/', 1)
    and l.lesson_no::text = split_part(p_ref, '/', 2)
  limit 1;
$$;

revoke all on function public.curriculum_lesson_for_ref(text, text) from public, anon;

/**
 * Move a lesson or spec unit to a new review status. Checks the step is allowed
 * from where it is now and that the caller may take it, records the event, and
 * returns the new status.
 */
create or replace function public.curriculum_review_transition(p_subject text, p_scope text, p_ref text, p_to text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.curriculum_signoffs;
  from_status text;
  is_reviewer boolean := public.current_has_role(array['head_teacher', 'admin']);
  is_teacher boolean := public.current_has_role(array['head_teacher', 'admin', 'teacher']);
  who text;
  lesson_version integer;
  ok boolean := false;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_teacher then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_scope not in ('spec', 'lesson') then
    raise exception 'invalid scope' using errcode = '22023';
  end if;
  if p_to not in ('draft', 'submitted', 'in_review', 'changes_needed', 'approved', 'published') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select * into cur from public.curriculum_signoffs where subject_slug = p_subject and scope = p_scope and ref = p_ref for update;
  from_status := coalesce(cur.status, 'draft');

  -- Allowed steps.
  ok := case
    when p_to = 'submitted' then from_status in ('draft', 'changes_needed') or (is_reviewer and from_status in ('approved', 'published'))
    when p_to = 'draft' then from_status in ('submitted', 'changes_needed') and (is_reviewer or cur.submitted_by = auth.uid())
    when p_to = 'in_review' then is_reviewer and from_status in ('submitted', 'changes_needed')
    when p_to = 'changes_needed' then is_reviewer and from_status in ('submitted', 'in_review', 'approved', 'published')
    when p_to = 'approved' then is_reviewer and from_status in ('submitted', 'in_review')
    when p_to = 'published' then is_reviewer and from_status = 'approved'
    else false
  end;
  if not ok then
    raise exception 'Can''t move from % to % (or you aren''t allowed to)', from_status, p_to using errcode = '42501';
  end if;
  if p_to = 'changes_needed' and clean_note is null then
    raise exception 'Say what needs changing' using errcode = '22023';
  end if;

  select full_name into who from public.profiles where id = auth.uid();
  if p_scope = 'lesson' then
    select (public.curriculum_lesson_for_ref(p_subject, p_ref)).version into lesson_version;
  end if;

  insert into public.curriculum_signoffs as s (subject_slug, scope, ref, status, note, checked_by, checked_name, checked_at,
    submitted_by, submitted_name, submitted_at, approved_by, approved_name, approved_at, approved_version, changed_since_approval)
  values (p_subject, p_scope, p_ref, p_to, clean_note, auth.uid(), who, now(),
    case when p_to = 'submitted' then auth.uid() end, case when p_to = 'submitted' then who end, case when p_to = 'submitted' then now() end,
    case when p_to = 'approved' then auth.uid() end, case when p_to = 'approved' then who end, case when p_to = 'approved' then now() end,
    case when p_to = 'approved' then lesson_version end, false)
  on conflict (subject_slug, scope, ref) do update set
    status = excluded.status,
    note = coalesce(excluded.note, case when excluded.status in ('approved', 'published') then s.note end),
    checked_by = excluded.checked_by,
    checked_name = excluded.checked_name,
    checked_at = excluded.checked_at,
    submitted_by = case when excluded.status = 'submitted' then excluded.submitted_by else s.submitted_by end,
    submitted_name = case when excluded.status = 'submitted' then excluded.submitted_name else s.submitted_name end,
    submitted_at = case when excluded.status = 'submitted' then excluded.submitted_at else s.submitted_at end,
    approved_by = case when excluded.status = 'approved' then excluded.approved_by when excluded.status = 'published' then s.approved_by else null end,
    approved_name = case when excluded.status = 'approved' then excluded.approved_name when excluded.status = 'published' then s.approved_name else null end,
    approved_at = case when excluded.status = 'approved' then excluded.approved_at when excluded.status = 'published' then s.approved_at else null end,
    approved_version = case when excluded.status = 'approved' then excluded.approved_version when excluded.status = 'published' then s.approved_version else null end,
    changed_since_approval = case when excluded.status in ('approved', 'published') then false else s.changed_since_approval end;

  insert into public.curriculum_review_events (subject_slug, scope, ref, from_status, to_status, note, lesson_version, actor, actor_name)
  values (p_subject, p_scope, p_ref, from_status, p_to, clean_note, lesson_version, auth.uid(), who);

  return p_to;
end;
$$;

revoke all on function public.curriculum_review_transition(text, text, text, text, text) from public, anon;
grant execute on function public.curriculum_review_transition(text, text, text, text, text) to authenticated;

-- The old one-step sign-off (0102) still works for any page not yet moved over:
-- it maps onto the workflow and is recorded as an event too.
create or replace function public.curriculum_set_signoff(p_subject text, p_scope text, p_ref text, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
  prev text;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_scope not in ('spec', 'lesson') then
    raise exception 'invalid scope' using errcode = '22023';
  end if;
  select status into prev from public.curriculum_signoffs where subject_slug = p_subject and scope = p_scope and ref = p_ref;
  select full_name into who from public.profiles where id = auth.uid();
  if p_status is null then
    delete from public.curriculum_signoffs where subject_slug = p_subject and scope = p_scope and ref = p_ref;
    insert into public.curriculum_review_events (subject_slug, scope, ref, from_status, to_status, note, actor, actor_name)
    values (p_subject, p_scope, p_ref, prev, 'draft', 'Sign-off cleared', auth.uid(), who);
    return;
  end if;
  if p_status not in ('in_review', 'approved', 'changes_needed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  insert into public.curriculum_signoffs (subject_slug, scope, ref, status, note, checked_by, checked_name, checked_at,
    approved_by, approved_name, approved_at, approved_version)
  values (p_subject, p_scope, p_ref, p_status, nullif(btrim(p_note), ''), auth.uid(), who, now(),
    case when p_status = 'approved' then auth.uid() end, case when p_status = 'approved' then who end, case when p_status = 'approved' then now() end,
    case when p_status = 'approved' and p_scope = 'lesson' then (public.curriculum_lesson_for_ref(p_subject, p_ref)).version end)
  on conflict (subject_slug, scope, ref)
  do update set status = excluded.status, note = excluded.note, checked_by = excluded.checked_by, checked_name = excluded.checked_name, checked_at = excluded.checked_at,
    approved_by = excluded.approved_by, approved_name = excluded.approved_name, approved_at = excluded.approved_at, approved_version = excluded.approved_version,
    changed_since_approval = false;
  insert into public.curriculum_review_events (subject_slug, scope, ref, from_status, to_status, note, actor, actor_name)
  values (p_subject, p_scope, p_ref, prev, p_status, nullif(btrim(p_note), ''), auth.uid(), who);
end;
$$;

revoke all on function public.curriculum_set_signoff(text, text, text, text, text) from public, anon;
grant execute on function public.curriculum_set_signoff(text, text, text, text, text) to authenticated;

-- Editing an approved or published lesson reopens its review (needs 0179's content column).
create or replace function public.curriculum_lesson_reopen_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.curriculum_signoffs;
  v_ref text := new.year || '/' || new.lesson_no;
begin
  -- What a teacher changes: the lesson's words (content, title, objectives,
  -- unit) or its slides by upload/restore (which stamp edited_at). A rebuild of
  -- the slides from unchanged content (deck_path, pdf_path, version only) does
  -- not reopen anything, so a whole-school design rebuild keeps approvals.
  if new.content is not distinct from old.content
     and new.title is not distinct from old.title
     and new.objectives is not distinct from old.objectives
     and new.unit is not distinct from old.unit
     and new.edited_at is not distinct from old.edited_at then
    return new;
  end if;
  select * into r from public.curriculum_signoffs where subject_slug = new.subject_slug and scope = 'lesson' and curriculum_signoffs.ref = v_ref for update;
  if r.id is null or r.status not in ('approved', 'published') then
    return new;
  end if;
  update public.curriculum_signoffs
     set status = 'submitted', changed_since_approval = true,
         note = 'Changed after approval (version ' || new.version || '): needs checking again.',
         checked_at = now()
   where id = r.id;
  insert into public.curriculum_review_events (subject_slug, scope, ref, from_status, to_status, note, lesson_version, actor, actor_name)
  values (new.subject_slug, 'lesson', v_ref, r.status, 'submitted', 'Lesson edited after approval, so it was reopened for review.', new.version, auth.uid(),
          (select full_name from public.profiles where id = auth.uid()));
  return new;
end;
$$;

drop trigger if exists curriculum_lessons_reopen_review on public.curriculum_lessons;
create trigger curriculum_lessons_reopen_review
  after update on public.curriculum_lessons
  for each row execute function public.curriculum_lesson_reopen_review();
