-- Homework feedback loop.
--
-- A teacher can answer a submission with typed feedback and/or a short audio
-- note, and can ask for a resubmission. Workflow, per submission:
--
--   submitted (no feedback row yet)
--     -> feedback_given            teacher left text and/or audio feedback
--     -> resubmission_requested    teacher asked the student to try again
--     -> resubmitted               the student (or parent) sent a new version
--     -> feedback_given / resubmission_requested again, as often as needed
--
-- Design notes (same conventions as 0010/0055/0067):
--  * homework_feedback is a SEPARATE teacher-owned table, not columns on
--    homework_submissions, because RLS cannot make one column of a
--    student-writable row read-only (see the 0010 header). Students and
--    parents may only READ it.
--  * The 'resubmitted' status is never set by a client. A SECURITY DEFINER
--    trigger on homework_submissions flips resubmission_requested ->
--    resubmitted when the content really changes, so the status cannot be
--    forged or skipped.
--  * Audio lives in a private storage bucket (2MB cap, audio/webm and
--    audio/mp4 only) using the same '<homework_id>/<child_id>/<file>' path
--    convention as homework-submissions, so access follows the same rules.
--  * Parents could not previously write a submission. They may now UPDATE
--    (never create) a submission, and only while the teacher has an open
--    resubmission request for it.
--  * homework_attention is the "Late & missing" view for teachers (their
--    classes) and head/admin (whole school). security_invoker, so it grants
--    nothing the caller's own RLS on the underlying tables does not.
--  * audit_row_change() reads NEW.id / OLD.id, so every table keeps a real id.
--
-- Idempotent: safe to run more than once.

-- ── helpers ──────────────────────────────────────────────────────────────

-- Like storage_path_homework_id()/storage_path_child_id() from 0010 but
-- returns NULL (instead of raising) for a path segment that is not a uuid,
-- so a policy can never error on an unrelated object name.
create or replace function public.storage_path_uuid_part(p_name text, p_idx int)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', p_idx) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', p_idx)::uuid
    else null
  end;
$$;

grant execute on function public.storage_path_uuid_part(text, int) to authenticated;

-- ── homework_feedback ────────────────────────────────────────────────────
create table if not exists public.homework_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.homework_submissions(id) on delete cascade,
  status text not null default 'feedback_given'
    check (status in ('feedback_given', 'resubmission_requested', 'resubmitted')),
  feedback_text text check (feedback_text is null or char_length(feedback_text) <= 4000),
  audio_path text, -- object name in the homework-feedback-audio bucket: <homework_id>/<child_id>/<file>
  audio_seconds int check (audio_seconds is null or (audio_seconds >= 0 and audio_seconds <= 600)),
  resubmit_count int not null default 0 check (resubmit_count >= 0),
  given_by uuid references public.profiles(id),
  given_at timestamptz not null default now(),
  requested_at timestamptz,
  resubmitted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint homework_feedback_has_content check (
    char_length(btrim(coalesce(feedback_text, ''))) > 0 or audio_path is not null
  )
);

create index if not exists homework_feedback_status_idx on public.homework_feedback (status);

alter table public.homework_feedback enable row level security;

-- The audio object must live in this submission's own folder, so feedback can
-- never point at another child's file. Also stamps the bookkeeping columns.
create or replace function public.homework_feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_homework uuid;
  v_child uuid;
  v_requested boolean := false;
begin
  select hs.homework_id, hs.child_id into v_homework, v_child
  from public.homework_submissions hs where hs.id = new.submission_id;
  if v_homework is null then
    raise exception 'submission_not_found' using errcode = '23503';
  end if;

  if new.audio_path is not null
     and (split_part(new.audio_path, '/', 1) <> v_homework::text
          or split_part(new.audio_path, '/', 2) <> v_child::text
          or split_part(new.audio_path, '/', 3) = '') then
    raise exception 'invalid_audio_path' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.submission_id := old.submission_id;
    -- Only the definer trigger below may move requested -> resubmitted; it
    -- also bumps these two columns. Every other write keeps them as they were.
    if not (old.status = 'resubmission_requested' and new.status = 'resubmitted') then
      new.resubmit_count := old.resubmit_count;
      new.resubmitted_at := old.resubmitted_at;
    end if;
    v_requested := old.status = 'resubmission_requested';
  end if;

  if new.status = 'resubmission_requested' and not v_requested then
    new.requested_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists homework_feedback_guard on public.homework_feedback;
create trigger homework_feedback_guard
  before insert or update on public.homework_feedback
  for each row execute function public.homework_feedback_guard();

drop trigger if exists audit_homework_feedback on public.homework_feedback;
create trigger audit_homework_feedback
  after insert or update or delete on public.homework_feedback
  for each row execute function public.audit_row_change();

-- Teachers and head/admin write; the status they may set excludes
-- 'resubmitted' (that one belongs to the trigger below).
drop policy if exists "homework_feedback: teacher of class manages" on public.homework_feedback;
create policy "homework_feedback: teacher of class manages"
  on public.homework_feedback for all
  to authenticated
  using (public.class_taught_by_current_user(public.submission_homework_class_id(homework_feedback.submission_id)))
  with check (
    public.class_taught_by_current_user(public.submission_homework_class_id(homework_feedback.submission_id))
    and homework_feedback.status in ('feedback_given', 'resubmission_requested')
  );

drop policy if exists "homework_feedback: head_teacher/admin manage all" on public.homework_feedback;
create policy "homework_feedback: head_teacher/admin manage all"
  on public.homework_feedback for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (
    public.current_has_role(array['head_teacher', 'admin'])
    and homework_feedback.status in ('feedback_given', 'resubmission_requested')
  );

drop policy if exists "homework_feedback: manage_academic staff manage all" on public.homework_feedback;
create policy "homework_feedback: manage_academic staff manage all"
  on public.homework_feedback for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (
    public.current_has_permission('manage_academic')
    and homework_feedback.status in ('feedback_given', 'resubmission_requested')
  );

drop policy if exists "homework_feedback: parent reads own child's" on public.homework_feedback;
create policy "homework_feedback: parent reads own child's"
  on public.homework_feedback for select
  to authenticated
  using (public.child_belongs_to_parent(public.submission_child_id(homework_feedback.submission_id)));

drop policy if exists "homework_feedback: student reads own" on public.homework_feedback;
create policy "homework_feedback: student reads own"
  on public.homework_feedback for select
  to authenticated
  using (public.child_belongs_to_student(public.submission_child_id(homework_feedback.submission_id)));

-- ── resubmission ─────────────────────────────────────────────────────────
create or replace function public.homework_resubmission_requested(p_homework_id uuid, p_child_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.homework_feedback f
    join public.homework_submissions s on s.id = f.submission_id
    where s.homework_id = p_homework_id
      and s.child_id = p_child_id
      and f.status = 'resubmission_requested'
  );
$$;

grant execute on function public.homework_resubmission_requested(uuid, uuid) to authenticated;

-- A parent may update (not create) their child's submission, but only while
-- the teacher has asked for a resubmission.
drop policy if exists "homework_submissions: parent resubmits when requested" on public.homework_submissions;
create policy "homework_submissions: parent resubmits when requested"
  on public.homework_submissions for update
  to authenticated
  using (
    public.child_belongs_to_parent(homework_submissions.child_id)
    and public.homework_resubmission_requested(homework_submissions.homework_id, homework_submissions.child_id)
  )
  with check (
    public.child_belongs_to_parent(homework_submissions.child_id)
    and public.homework_resubmission_requested(homework_submissions.homework_id, homework_submissions.child_id)
  );

-- ...and upload the replacement file into the child's own folder.
drop policy if exists "homework-submissions: parent uploads requested resubmission" on storage.objects;
create policy "homework-submissions: parent uploads requested resubmission"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'homework-submissions'
    and public.child_belongs_to_parent(public.storage_path_uuid_part(name, 2))
    and public.homework_resubmission_requested(public.storage_path_uuid_part(name, 1), public.storage_path_uuid_part(name, 2))
  );

-- A submission's identity (which homework, which child) never changes.
create or replace function public.homework_submissions_lock_keys()
returns trigger
language plpgsql
as $$
begin
  new.homework_id := old.homework_id;
  new.child_id := old.child_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists homework_submissions_lock_keys on public.homework_submissions;
create trigger homework_submissions_lock_keys
  before update on public.homework_submissions
  for each row execute function public.homework_submissions_lock_keys();

-- When the content of a submission actually changes while a resubmission is
-- requested, record it. SECURITY DEFINER so the student/parent needs no write
-- access to homework_feedback.
create or replace function public.homework_submission_resubmitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.homework_feedback
     set status = 'resubmitted',
         resubmitted_at = now(),
         resubmit_count = resubmit_count + 1
   where submission_id = new.id
     and status = 'resubmission_requested';
  return new;
end;
$$;

drop trigger if exists homework_submission_resubmitted on public.homework_submissions;
create trigger homework_submission_resubmitted
  after update on public.homework_submissions
  for each row
  when (
    old.response_text is distinct from new.response_text
    or old.file_path is distinct from new.file_path
    or old.kind is distinct from new.kind
    or old.submitted_at is distinct from new.submitted_at
  )
  execute function public.homework_submission_resubmitted();

-- ── storage: homework-feedback-audio (private, 2MB, webm/mp4 audio) ─────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework-feedback-audio', 'homework-feedback-audio', false, 2097152, array['audio/webm', 'audio/mp4'])
on conflict (id) do nothing;

drop policy if exists "homework-feedback-audio: teacher/head read" on storage.objects;
create policy "homework-feedback-audio: teacher/head read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-feedback-audio'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-feedback-audio: parent/student read own child's" on storage.objects;
create policy "homework-feedback-audio: parent/student read own child's"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-feedback-audio'
    and (
      public.child_belongs_to_parent(public.storage_path_uuid_part(name, 2))
      or public.child_belongs_to_student(public.storage_path_uuid_part(name, 2))
    )
  );

drop policy if exists "homework-feedback-audio: teacher/head upload" on storage.objects;
create policy "homework-feedback-audio: teacher/head upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'homework-feedback-audio'
    and public.homework_child_enrolled(public.storage_path_uuid_part(name, 1), public.storage_path_uuid_part(name, 2))
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-feedback-audio: teacher/head replace" on storage.objects;
create policy "homework-feedback-audio: teacher/head replace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'homework-feedback-audio'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

drop policy if exists "homework-feedback-audio: teacher/head delete" on storage.objects;
create policy "homework-feedback-audio: teacher/head delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'homework-feedback-audio'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.homework_class_id(public.storage_path_uuid_part(name, 1)))
    )
  );

-- ── homework_attention: "Late & missing" for teachers and admin ─────────
-- One row per (homework, child) that needs attention: never handed in after
-- the deadline, handed in late, or waiting for a requested resubmission.
-- Names are joined in so the page needs no follow-up lookups. security_invoker:
-- a teacher sees their own classes, head/admin the whole school, a parent or
-- student only their own child.
create or replace view public.homework_attention
  with (security_invoker = true) as
  select
    hs.homework_id,
    h.title as homework_title,
    hs.class_id,
    c.name as class_name,
    hs.due_at,
    hs.child_id,
    ch.name as child_name,
    hs.submission_id,
    hs.submitted_at,
    case when hf.status = 'resubmission_requested' then 'resubmission_requested' else hs.status end as attention,
    hf.requested_at as resubmission_requested_at
  from public.homework_status hs
  join public.homework h on h.id = hs.homework_id
  left join public.classes c on c.id = hs.class_id
  left join public.children ch on ch.id = hs.child_id
  left join public.homework_feedback hf on hf.submission_id = hs.submission_id
  where hs.status in ('late', 'missing') or hf.status = 'resubmission_requested';

grant select on public.homework_attention to authenticated;
